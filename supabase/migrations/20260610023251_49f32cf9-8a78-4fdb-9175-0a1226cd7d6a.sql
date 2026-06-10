
CREATE TABLE public.google_sheets_sync (
  entity_type text PRIMARY KEY,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text,
  sheet_name text NOT NULL DEFAULT 'Sheet1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_sheets_sync TO authenticated;
GRANT ALL ON public.google_sheets_sync TO service_role;

ALTER TABLE public.google_sheets_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sheets sync"
  ON public.google_sheets_sync FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sheets sync"
  ON public.google_sheets_sync FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sheets sync"
  ON public.google_sheets_sync FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete sheets sync"
  ON public.google_sheets_sync FOR DELETE TO authenticated USING (true);

CREATE TRIGGER google_sheets_sync_updated_at
  BEFORE UPDATE ON public.google_sheets_sync
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
