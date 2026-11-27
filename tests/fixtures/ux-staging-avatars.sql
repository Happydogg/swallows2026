-- SDL-004-AVATAR-001 | PRIVATE staging avatars, role-scoped uploads and audit
-- Apply ONLY to project wvurolqbjhuckkkjiiiv (swallows-datalab-staging).
-- Never migrate production without a separate verified release.
-- No updates to official statistics, auth.users, existing RLS or private video R2.
BEGIN;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('sdl-avatars-staging','sdl-avatars-staging',false,1048576,ARRAY['image/jpeg']::text[])
ON CONFLICT (id) DO NOTHING;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id='sdl-avatars-staging' AND public=false
      AND file_size_limit=1048576
      AND allowed_mime_types=ARRAY['image/jpeg']::text[]
  ) THEN
    RAISE EXCEPTION 'SDL avatar bucket exists with unexpected security settings';
  END IF;
END;
$check$;

CREATE OR REPLACE FUNCTION public.sdl_ux_avatar_valid_path(p_path text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $fn$
  SELECT coalesce(p_path ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$',false);
$fn$;

CREATE OR REPLACE FUNCTION public.sdl_ux_avatar_can_manage(p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT p_player IS NOT NULL
   AND public.sdl_004_session_active()
   AND EXISTS (
     SELECT 1 FROM public.players p
     WHERE p.id=p_player AND p.organization_id IS NOT NULL
       AND (
         public.sdl_004_guardian_for((SELECT auth.uid()),p.id)
         OR public.sdl_004_coach_for((SELECT auth.uid()),p.id)
         OR public.sdl_004_club_admin(p.organization_id)
       )
   );
$fn$;

REVOKE ALL ON FUNCTION public.sdl_ux_avatar_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdl_ux_avatar_can_manage(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.sdl_ux_avatar_valid_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdl_ux_avatar_valid_path(text) TO authenticated;

-- Private object GET/signed URL and new-only POST. No UPDATE, DELETE, anonymous or public listing.
CREATE POLICY sdl_ux_avatar_select ON storage.objects
 FOR SELECT TO authenticated
 USING (
   CASE WHEN bucket_id='sdl-avatars-staging' AND public.sdl_ux_avatar_valid_path(name)
     THEN public.sdl_ux_avatar_can_manage(split_part(name,'/',1)::uuid)
     ELSE false END
 );

CREATE POLICY sdl_ux_avatar_insert ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (
   CASE WHEN bucket_id='sdl-avatars-staging'
       AND public.sdl_ux_avatar_valid_path(name)
       AND owner_id=(SELECT auth.uid())::text
     THEN public.sdl_ux_avatar_can_manage(split_part(name,'/',1)::uuid)
     ELSE false END
 );

CREATE TABLE IF NOT EXISTS public.sdl_ux_avatar_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.players(id),
  actor_id uuid NOT NULL,
  old_reference text,
  new_reference text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sdl_ux_avatar_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sdl_ux_avatar_audit FROM PUBLIC,anon,authenticated;
-- Deliberately no direct RLS policies on the audit table.

CREATE OR REPLACE FUNCTION public.sdl_ux_avatar_managed_players()
RETURNS TABLE (id uuid,preferred_name text,jersey text,"position" text,photo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT p.id,p.preferred_name,p.jersey,p.position,p.photo_url
  FROM public.players p
  WHERE public.sdl_ux_avatar_can_manage(p.id)
  ORDER BY p.preferred_name,p.id
  LIMIT 1000;
$fn$;

CREATE OR REPLACE FUNCTION public.sdl_ux_avatar_save(
  p_player uuid, p_object_path text
)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_old text;
  v_ref text;
BEGIN
  IF NOT public.sdl_ux_avatar_can_manage(p_player) THEN
    RAISE EXCEPTION 'Avatar update forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.sdl_ux_avatar_valid_path(p_object_path)
    OR split_part(p_object_path,'/',1) IS DISTINCT FROM p_player::text THEN
    RAISE EXCEPTION 'Invalid avatar path' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='sdl-avatars-staging'
      AND o.name=p_object_path
      AND o.owner_id=(SELECT auth.uid())::text
      AND o.metadata->>'mimetype'='image/jpeg'
  ) THEN
    RAISE EXCEPTION 'Avatar object not found or owned by another user' USING ERRCODE='42501';
  END IF;

  SELECT p.photo_url INTO v_old FROM public.players p WHERE p.id=p_player FOR UPDATE;
  v_ref := 'sdl-private-avatar:'||p_object_path;
  UPDATE public.players SET photo_url=v_ref WHERE id=p_player;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.sdl_ux_avatar_audit(player_id,actor_id,old_reference,new_reference)
  VALUES (p_player,(SELECT auth.uid()),v_old,v_ref);
  RETURN v_ref;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sdl_ux_avatar_managed_players() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sdl_ux_avatar_save(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sdl_ux_avatar_managed_players() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sdl_ux_avatar_save(uuid,text) TO authenticated;

COMMIT;
