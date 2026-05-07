-- Allow dashboard users to create any locality text while adding/editing properties.

ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON TABLE public.localities TO authenticated;

DROP POLICY IF EXISTS "authenticated_insert_localities" ON public.localities;
CREATE POLICY "authenticated_insert_localities"
  ON public.localities
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
