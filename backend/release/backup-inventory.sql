-- Only run with approved staging-export or isolated-validation permission. Metadata/counts, never row contents.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH relations AS (
 SELECT c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner_name,
 (SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]') FROM unnest(c.relacl) x) acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND NOT c.relispartition
 AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
 AND n.nspname NOT LIKE 'pg_temp%'
 AND (NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 OR EXISTS(SELECT 1 FROM pg_extension e WHERE c.oid=ANY(e.extconfig)))
), counts AS (
 SELECT nspname||'.'||relname name,
 ((xpath('//n/text()',query_to_xml(format('SELECT count(*) AS n FROM %I.%I',nspname,relname),false,true,'')))[1]::text)::bigint n
 FROM relations
)
SELECT jsonb_build_object(
 'server_major',current_setting('server_version_num')::int/10000,
 'database',current_database(),'role',current_user,
 'tls',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'counts',(SELECT coalesce(jsonb_object_agg(name,n),'{}') FROM counts),
 'schemas',(SELECT jsonb_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_%'),
 'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',nspname||'.'||relname,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'owner',owner_name,'acl',acl) ORDER BY nspname,relname),'[]') FROM relations),
 'columns',(SELECT jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'name',column_name,'type',udt_name,'nullable',is_nullable,'default_hash',md5(coalesce(column_default,''))) ORDER BY table_schema,table_name,ordinal_position) FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_%'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition_hash',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND p.prokind IN ('f','p')),
 'policies',(SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'cmd',cmd,'using_hash',md5(coalesce(qual,'')),'check_hash',md5(coalesce(with_check,''))) ORDER BY schemaname,tablename,policyname) FROM pg_policies),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition_hash',md5(pg_get_constraintdef(c.oid))) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'),
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
 'roles',(SELECT jsonb_object_agg(rolname,jsonb_build_object('super',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass_rls',rolbypassrls,'config_hash',md5(coalesce(rolconfig::text,'')))) FROM pg_roles),
 'role_memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin_option',admin_option,'inherit_option',inherit_option,'set_option',set_option) ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member)),'[]') FROM pg_auth_members),
 'history_exists',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
) AS inventory;
COMMIT;
