-- Catalog evidence only. Output belongs in the private release record.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;

WITH namespaces AS (
  SELECT oid, nspname, nspowner, nspacl
  FROM pg_namespace
  WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
), relations AS (
  SELECT c.*, n.nspname
  FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f','S')
), inventory(section, identity, evidence) AS (
  SELECT 'server', 'postgresql', jsonb_build_object('major',current_setting('server_version_num')::int/10000)
  UNION ALL
  SELECT 'schema', nspname, jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl)
  FROM namespaces
  UNION ALL
  SELECT 'relation', format('%I.%I',nspname,relname),
         jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),
           'rls',relrowsecurity,'force_rls',relforcerowsecurity,'acl',relacl,
           'options_hash',md5(coalesce(reloptions::text,'')),
           'view_hash',CASE WHEN relkind IN ('v','m') THEN md5(pg_get_viewdef(oid)) END)
  FROM relations
  UNION ALL
  SELECT 'column',format('%I.%I.%I',r.nspname,r.relname,a.attname),
         jsonb_build_object('position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),
           'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl,
           'default_hash',md5(pg_get_expr(d.adbin,d.adrelid)))
  FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'policy',format('%I.%I.%I',p.schemaname,p.tablename,p.policyname),
         jsonb_build_object('mode',p.permissive,'command',p.cmd,'roles',p.roles,
           'using_hash',md5(p.qual),'check_hash',md5(p.with_check))
  FROM pg_policies p JOIN namespaces n ON n.nspname=p.schemaname
  UNION ALL
  SELECT 'function',p.oid::regprocedure::text,
         jsonb_build_object('owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
           'execute',coalesce(p.proacl,acldefault('f',p.proowner)),
           'definition_hash',md5(pg_get_functiondef(p.oid)),
           'configuration_hash',md5(coalesce(p.proconfig::text,'')))
  FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p')
  UNION ALL
  SELECT 'constraint',format('%I.%I.%I',r.nspname,r.relname,k.conname),
         jsonb_build_object('definition_hash',md5(pg_get_constraintdef(k.oid)),'validated',k.convalidated)
  FROM pg_constraint k JOIN relations r ON r.oid=k.conrelid
  UNION ALL
  SELECT 'index',i.indexrelid::regclass::text,
         jsonb_build_object('definition_hash',md5(pg_get_indexdef(i.indexrelid)),'valid',i.indisvalid)
  FROM pg_index i JOIN relations r ON r.oid=i.indrelid
  UNION ALL
  SELECT 'trigger',format('%I.%I.%I',r.nspname,r.relname,t.tgname),
         jsonb_build_object('definition_hash',md5(pg_get_triggerdef(t.oid)),'enabled',t.tgenabled)
  FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'role',rolname,jsonb_build_object('superuser',rolsuper,'bypass_rls',rolbypassrls,
         'inherit',rolinherit,'can_login',rolcanlogin,'create_role',rolcreaterole,
         'configuration_hash',md5(coalesce(rolconfig::text,'')))
  FROM pg_roles WHERE rolname NOT LIKE 'pg_%'
  UNION ALL
  SELECT 'membership',format('%I/%I/%I',pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor)),
         jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set_role',set_option)
  FROM pg_auth_members
  UNION ALL
  SELECT 'default_acl',format('%I/%I/%s',pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype),
         jsonb_build_object('acl',d.defaclacl)
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  UNION ALL
  SELECT 'migration_ledger','supabase_migrations.schema_migrations',
         CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
           jsonb_build_object('versions',xpath('//version/text()',
             query_to_xml('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version',false,false,''))::text[])
         ELSE jsonb_build_object('present',false) END
)
SELECT jsonb_build_object('section',section,'identity',identity,'evidence',evidence)
FROM inventory ORDER BY section COLLATE "C", identity COLLATE "C";
COMMIT;
