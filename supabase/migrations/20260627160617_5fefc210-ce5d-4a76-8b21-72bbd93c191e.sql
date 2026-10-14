
-- 1. Extend documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folder_id uuid,
  ADD COLUMN IF NOT EXISTS summary_cache jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS insights jsonb,
  ADD COLUMN IF NOT EXISTS analytics jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Folders
CREATE TABLE IF NOT EXISTS public.folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_folders" ON public.folders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_folder_id_fkey,
  ADD CONSTRAINT documents_folder_id_fkey FOREIGN KEY (folder_id)
    REFERENCES public.folders(id) ON DELETE SET NULL;

-- 3. Chat sessions
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  title text NOT NULL DEFAULT 'New chat',
  mode text NOT NULL DEFAULT 'chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chat_sessions" ON public.chat_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Chat messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chat_messages" ON public.chat_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Search history
CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_history TO authenticated;
GRANT ALL ON public.search_history TO service_role;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_search_history" ON public.search_history FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. Study items (flashcards, quizzes)
CREATE TABLE IF NOT EXISTS public.study_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  kind text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medium',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_items TO authenticated;
GRANT ALL ON public.study_items TO service_role;
ALTER TABLE public.study_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_study_items" ON public.study_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. Annotations
CREATE TABLE IF NOT EXISTS public.annotations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page integer NOT NULL,
  kind text NOT NULL DEFAULT 'note',
  body text,
  position jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annotations TO authenticated;
GRANT ALL ON public.annotations TO service_role;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_annotations" ON public.annotations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Cross-document semantic search RPC
CREATE OR REPLACE FUNCTION public.match_all_chunks(
  query_embedding extensions.vector,
  match_user_id uuid,
  match_count integer DEFAULT 12,
  filter_document_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid, document_id uuid, content text, page integer,
  chunk_index integer, similarity double precision
)
LANGUAGE sql STABLE SET search_path = public, extensions
AS $$
  SELECT c.id, c.document_id, c.content, c.page, c.chunk_index,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE c.user_id = match_user_id
    AND (filter_document_ids IS NULL OR c.document_id = ANY(filter_document_ids))
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 9. updated_at triggers
CREATE TRIGGER folders_updated_at BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER annotations_updated_at BEFORE UPDATE ON public.annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
