CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own pdfs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);