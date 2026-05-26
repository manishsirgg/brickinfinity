DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    WITH overlapping AS (
      SELECT o2.id AS order_id, o1.property_id, o1.id AS anchor_order_id, o1.featured_ends_at AS anchor_end, o2.duration_days
      FROM public.property_featured_orders o1
      JOIN public.property_featured_orders o2 ON o1.property_id = o2.property_id
      WHERE o1.payment_status='paid' AND o1.activation_status='active' AND o2.payment_status='paid' AND o2.activation_status='active'
        AND o1.id <> o2.id
        AND o1.featured_starts_at <= o2.featured_starts_at
        AND o2.featured_starts_at < o1.featured_ends_at
    )
    SELECT DISTINCT ON (order_id) * FROM overlapping ORDER BY order_id, anchor_end ASC
  LOOP
    UPDATE public.property_featured_orders
    SET activation_status='scheduled',
        featured_starts_at=rec.anchor_end,
        featured_ends_at=rec.anchor_end + make_interval(days => GREATEST(COALESCE(rec.duration_days,1),1)),
        updated_at=now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('repair','overlap_scheduled','repair_at',now())
    WHERE id=rec.order_id;
    RAISE NOTICE '[featured-finalize/repair] updated order %, property %, anchor %', rec.order_id, rec.property_id, rec.anchor_order_id;
  END LOOP;
END $$;
