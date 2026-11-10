-- Validate new descriptions without rewriting existing listings or blocking
-- unrelated updates (such as moderation) to legacy descriptions.
CREATE OR REPLACE FUNCTION public.description_has_contact_details(description text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT translate(
      regexp_replace(normalize(coalesce(description, ''), NFKC), U&'[\200B-\200D\FEFF]', '', 'g'),
      '०१२३४५६७८९٠١٢٣٤٥٦٧٨٩', '01234567890123456789'
    ) AS value
  )
  SELECT value ~* '(^|[^0-9])\+?[0-9]([[:space:]().-]*[0-9]){9,14}([^0-9]|$)'
    OR value ~* '[a-z0-9._%+-]+[[:space:]]*@[[:space:]]*[a-z0-9.-]+[[:space:]]*\.[[:space:]]*[a-z]{2,}'
    OR value ~* 'https?://|www\.|(wa\.me|t\.me)/|(mailto|tel):'
    OR value ~* '[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|in|org|net|co|io|me|biz|info|app|dev|online|site)(\y|/)'
    OR value ~* '(^|[[:space:]])@[a-z0-9_][a-z0-9_.]{1,}'
  FROM normalized;
$$;

CREATE OR REPLACE FUNCTION public.guard_property_description_contacts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.description IS NOT DISTINCT FROM OLD.description THEN RETURN NEW; END IF;
  END IF;
  IF public.description_has_contact_details(NEW.description) THEN
    RAISE EXCEPTION 'Remove phone numbers, email addresses, websites and social/contact links from the description. Use the Contact Seller panel.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_property_description_contacts ON public.properties;
CREATE TRIGGER guard_property_description_contacts
BEFORE INSERT OR UPDATE OF description ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_description_contacts();
