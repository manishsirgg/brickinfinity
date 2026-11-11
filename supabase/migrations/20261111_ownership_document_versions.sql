-- Ownership evidence is append-only: replacements/supporting files have separate
-- document IDs, while immutable reviews retain the exact earlier file/ID.
-- The old one-document-per-property/type rule prevents these legitimate inserts.
DO $ownership_document_versions$
DECLARE legacy record;keys text[];
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 LOCK TABLE public.documents IN SHARE ROW EXCLUSIVE MODE;
 SELECT i.indexrelid,i.indisunique,i.indisprimary,i.indpred,i.indexprs,
  i.indnkeyatts,i.indnatts,i.indnullsnotdistinct,c.oid AS constraint_id,c.contype
 INTO legacy
 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
 JOIN pg_namespace n ON n.oid=idx.relnamespace
 LEFT JOIN pg_constraint c ON c.conindid=i.indexrelid AND c.conrelid=i.indrelid
 WHERE i.indrelid='public.documents'::regclass AND n.nspname='public'
  AND idx.relname='documents_property_type_unique';
 IF NOT FOUND THEN
  RAISE NOTICE 'Legacy ownership uniqueness rule is already absent; no change needed.';
  RETURN;
 END IF;
 SELECT array_agg(a.attname::text ORDER BY a.attname) INTO keys
 FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) AS k(attnum)
 JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
 WHERE i.indexrelid=legacy.indexrelid;
 IF NOT legacy.indisunique OR legacy.indisprimary OR legacy.indpred IS NOT NULL
  OR legacy.indexprs IS NOT NULL OR legacy.indnkeyatts<>2 OR legacy.indnatts<>2
  OR legacy.indnullsnotdistinct OR keys IS DISTINCT FROM ARRAY['document_type','property_id']::text[]
  OR (legacy.constraint_id IS NOT NULL AND legacy.contype<>'u') THEN
  RAISE EXCEPTION 'Unexpected documents_property_type_unique definition. No changes applied; inspect this index/constraint before retrying.';
 END IF;
 IF to_regclass('public.documents_non_ownership_property_type_unique') IS NOT NULL THEN
  RAISE EXCEPTION 'Replacement index name already exists while the legacy rule is active. No changes applied; inspect both definitions.';
 END IF;
 -- Do not cast an enum document_type to text: such casts are not immutable and
 -- cannot be used in a partial-index predicate. The literal works for enum/text.
 CREATE UNIQUE INDEX documents_non_ownership_property_type_unique
  ON public.documents(property_id,document_type) WHERE document_type <> 'ownership';
 IF legacy.constraint_id IS NOT NULL THEN
  ALTER TABLE public.documents DROP CONSTRAINT documents_property_type_unique;
 ELSE
  DROP INDEX public.documents_property_type_unique;
 END IF;
 -- Keep FK/history/identity uniqueness and every security/review trigger intact.
END;
$ownership_document_versions$;
