CREATE OR REPLACE FUNCTION public.property_description_word_count(value text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Match the whitespace recognized by the form's JavaScript word counter.
  SELECT count(*)::integer FROM regexp_matches(coalesce(value, ''),
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', 'g');
$$;

CREATE OR REPLACE FUNCTION public.guard_property_text_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF char_length(NEW.title) > 100 THEN
      RAISE EXCEPTION 'Property title must be 100 characters or fewer.' USING ERRCODE = '23514';
    END IF;
    IF public.property_description_word_count(NEW.description) > 3000 THEN
      RAISE EXCEPTION 'Property description must be 3,000 words or fewer.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.title IS DISTINCT FROM OLD.title AND char_length(NEW.title) > 100 THEN
      RAISE EXCEPTION 'Property title must be 100 characters or fewer.' USING ERRCODE = '23514';
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description AND public.property_description_word_count(NEW.description) > 3000 THEN
      RAISE EXCEPTION 'Property description must be 3,000 words or fewer.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_property_text_limits ON public.properties;
CREATE TRIGGER guard_property_text_limits
BEFORE INSERT OR UPDATE OF title, description ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_text_limits();
