-- BrickInfinity: non-breaking schema cleanup
-- Goal: remove redundant objects introduced/observed during rollout.

-- 1) Drop redundant unique index on users.user_id only when a UNIQUE constraint already exists.
DO $$
DECLARE
  has_unique_constraint boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND c.contype = 'u'
      AND a.attnum = ANY (c.conkey)
      AND a.attname = 'user_id'
  )
  INTO has_unique_constraint;

  IF has_unique_constraint
     AND EXISTS (
       SELECT 1
       FROM pg_class i
       JOIN pg_namespace n ON n.oid = i.relnamespace
       WHERE n.nspname = 'public'
         AND i.relname = 'users_user_id_unique_idx'
         AND i.relkind = 'i'
     ) THEN
    DROP INDEX public.users_user_id_unique_idx;
  END IF;
END
$$;

-- 2) Remove duplicate FK on users.user_id -> auth.users(id) when both known constraints exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_user'
      AND conrelid = 'public.users'::regclass
  )
  AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_fk'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT fk_user;
  END IF;
END
$$;
