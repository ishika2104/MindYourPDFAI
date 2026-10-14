
CREATE TABLE public.ingestion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('started','cancelled','completed','failed','progress')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ingestion_events_doc_idx ON public.ingestion_events (document_id, created_at DESC);
CREATE INDEX ingestion_events_user_idx ON public.ingestion_events (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.ingestion_events TO authenticated;
GRANT ALL ON public.ingestion_events TO service_role;

ALTER TABLE public.ingestion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ingestion events"
  ON public.ingestion_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ingestion events"
  ON public.ingestion_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
