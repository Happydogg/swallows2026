-- Disposable clone only. Snapshot the installed ACLs before operational use.
-- This rehearsal verifies temporary ACL containment and rolls it back.
BEGIN;
DO $containment$
DECLARE entry record;
BEGIN
  FOR entry IN
    SELECT p.oid, p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND (starts_with(p.proname,'sdl_v5_') OR starts_with(p.proname,'sdl_004_'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',entry.signature);
    IF has_function_privilege('anon',entry.oid,'EXECUTE')
       OR has_function_privilege('authenticated',entry.oid,'EXECUTE')
       OR has_function_privilege('service_role',entry.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Remaining inherited execution privilege for %',entry.signature;
    END IF;
  END LOOP;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expected SDL RPCs are missing'; END IF;
END;
$containment$;
ROLLBACK;
