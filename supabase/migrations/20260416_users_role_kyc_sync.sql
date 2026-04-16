-- BrickInfinity: users role/KYC schema hardening for new app flows
-- Safe to run multiple times (idempotent where possible).

-- 1) Ensure users.user_id can be used as an upsert conflict target
CREATE UNIQUE INDEX IF NOT EXISTS users_user_id_unique_idx
  ON public.users (user_id);

-- 2) Ensure role enum/text supports buyer/seller/admin
DO $$
DECLARE
  role_udt text;
BEGIN
  SELECT c.udt_name
  INTO role_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'users'
    AND c.column_name = 'role';

  IF role_udt IS NULL THEN
    RAISE NOTICE 'users.role column not found; skipping role value updates.';
    RETURN;
  END IF;

  IF role_udt <> 'text' AND EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = role_udt
      AND t.typtype = 'e'
  ) THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''buyer''', role_udt);
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''seller''', role_udt);
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''admin''', role_udt);
  END IF;
END
$$;

-- 3) Ensure seller_status enum/text supports new request states
DO $$
DECLARE
  status_udt text;
BEGIN
  SELECT c.udt_name
  INTO status_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'users'
    AND c.column_name = 'seller_status';

  IF status_udt IS NULL THEN
    RAISE NOTICE 'users.seller_status column not found; skipping seller_status value updates.';
    RETURN;
  END IF;

  IF status_udt <> 'text' AND EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = status_udt
      AND t.typtype = 'e'
  ) THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''basic''', status_udt);
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''pending_seller''', status_udt);
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''pending_admin''', status_udt);
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''active''', status_udt);
  END IF;
END
$$;

-- 4) RLS policy helpers for users table operations used by app
--    - register upsert (own row)
--    - profile KYC status updates (own row)
--    - admin moderation updates
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'users_select_own_or_admin'
  ) THEN
    CREATE POLICY users_select_own_or_admin
      ON public.users
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.users admin_u
          WHERE admin_u.user_id = auth.uid()
            AND admin_u.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'users_insert_own'
  ) THEN
    CREATE POLICY users_insert_own
      ON public.users
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'users_update_own_or_admin'
  ) THEN
    CREATE POLICY users_update_own_or_admin
      ON public.users
      FOR UPDATE
      TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.users admin_u
          WHERE admin_u.user_id = auth.uid()
            AND admin_u.role = 'admin'
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.users admin_u
          WHERE admin_u.user_id = auth.uid()
            AND admin_u.role = 'admin'
        )
      );
  END IF;
END
$$;
