ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS security_deposit numeric(14,2),
  ADD COLUMN IF NOT EXISTS brokerage_charge numeric(14,2),
  ADD COLUMN IF NOT EXISTS parking_charge numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_monthly_charges numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_one_time_charges numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_charges_note text,
  ADD COLUMN IF NOT EXISTS price_negotiable boolean,
  ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS available_from date,
  ADD COLUMN IF NOT EXISTS availability_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_rental_availability()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.availability_status NOT IN ('unknown','available','available_from','rented','sold','unavailable') THEN
    RAISE EXCEPTION 'Invalid availability status.' USING ERRCODE='23514';
  END IF;
  IF NEW.availability_status='available_from' AND NEW.available_from IS NULL THEN
    RAISE EXCEPTION 'An available-from date is required.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF nullif(NEW.maintenance_charges::text, '')::numeric < 0 THEN RAISE EXCEPTION 'Maintenance cannot be negative.' USING ERRCODE='23514'; END IF;
  ELSIF NEW.maintenance_charges IS DISTINCT FROM OLD.maintenance_charges AND nullif(NEW.maintenance_charges::text, '')::numeric < 0 THEN
    RAISE EXCEPTION 'Maintenance cannot be negative.' USING ERRCODE='23514';
  END IF;
  IF NEW.security_deposit < 0 OR NEW.brokerage_charge < 0 OR NEW.parking_charge < 0 OR NEW.other_monthly_charges < 0 OR NEW.other_one_time_charges < 0 THEN
    RAISE EXCEPTION 'Rental charges cannot be negative.' USING ERRCODE='23514';
  END IF;
  IF char_length(NEW.other_charges_note)>500 OR public.description_has_contact_details(NEW.other_charges_note) THEN
    RAISE EXCEPTION 'Charge details must be at most 500 characters without contact details.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.availability_confirmed_at := CASE WHEN NEW.availability_status='unknown' THEN NULL ELSE now() END;
  ELSIF NEW.availability_status IS DISTINCT FROM OLD.availability_status OR NEW.available_from IS DISTINCT FROM OLD.available_from THEN
    NEW.availability_confirmed_at := CASE WHEN NEW.availability_status='unknown' THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_rental_availability ON public.properties;
CREATE TRIGGER guard_rental_availability BEFORE INSERT OR UPDATE OF availability_status, available_from, security_deposit, brokerage_charge, parking_charge, other_monthly_charges, other_one_time_charges, other_charges_note, maintenance_charges
ON public.properties FOR EACH ROW EXECUTE FUNCTION public.guard_rental_availability();

CREATE OR REPLACE FUNCTION public.confirm_property_availability(p_property_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE confirmed timestamptz;
BEGIN
  UPDATE public.properties p
  SET availability_status=CASE WHEN p.availability_status='unknown' THEN 'available' ELSE p.availability_status END,
      availability_confirmed_at=now()
  WHERE p.id=p_property_id AND p.deleted_at IS NULL
    AND p.availability_status IN ('unknown','available','available_from')
    AND auth.uid() IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND (u.id=p.seller_id OR u.role::text='admin'))
  RETURNING p.availability_confirmed_at INTO confirmed;
  IF confirmed IS NULL THEN RAISE EXCEPTION 'Only the owner or admin can confirm a current listing.' USING ERRCODE='42501'; END IF;
  RETURN confirmed;
END $$;
REVOKE ALL ON FUNCTION public.confirm_property_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_property_availability(uuid) TO authenticated;
CREATE INDEX IF NOT EXISTS properties_availability_status_idx ON public.properties(availability_status);
