CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;

-- Recreate match function as SECURITY INVOKER (RLS enforces ownership)
DROP FUNCTION IF EXISTS public.match_document_chunks(extensions.vector, uuid, integer);
DROP FUNCTION IF EXISTS public.match_document_chunks(vector, uuid, integer);

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding extensions.vector(1536),
  match_document_id UUID,
  match_count INTEGER DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  page INTEGER,
  chunk_index INTEGER,
  similarity FLOAT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions
AS $$
  SELECT c.id, c.content, c.page, c.chunk_index,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE c.document_id = match_document_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_document_chunks(extensions.vector, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, uuid, integer) TO authenticated, service_role;