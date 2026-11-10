-- Apply after 20261110_block_description_contact_details.sql.
-- Reuse the description detector so title/description rules stay identical.
CREATE OR REPLACE FUNCTION public.guard_property_title_contacts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title THEN RETURN NEW; END IF;
  END IF;
  IF public.description_has_contact_details(NEW.title) THEN
    RAISE EXCEPTION 'Remove phone numbers, email addresses, websites and social/contact links from the title. Use the Contact Seller panel.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_property_title_contacts ON public.properties;
CREATE TRIGGER guard_property_title_contacts
BEFORE INSERT OR UPDATE OF title ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_title_contacts();
