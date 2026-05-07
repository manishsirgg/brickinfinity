-- Remove legacy locality public identifier.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'localities'
      AND column_name = 'public_id'
  ) THEN
    ALTER TABLE public.localities
      DROP CONSTRAINT IF EXISTS localities_public_id_key;

    ALTER TABLE public.localities
      DROP COLUMN public_id;
  END IF;
END $$;
