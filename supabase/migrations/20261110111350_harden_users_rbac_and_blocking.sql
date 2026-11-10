-- migration: harden users rbac and account blocking
-- purpose:
--   1. workers (and managers) may only change their own self-service profile columns
--      (username, first_name, last_name, phone, avatar_url, linkedin, upwork). until now
--      "grant update on public.users" + an owner-only rls policy let any user set their
--      own role, salary, is_blocked, is_confirmed or email straight through the data api,
--      and the access token hook then minted an admin jwt from the forged role.
--   2. admins may read and update every profile row.
--   3. blocked users lose access to every rls-protected table immediately, including
--      sessions whose access token was issued before the block, and cannot obtain new
--      tokens (sign-in and refresh are rejected by the access token hook).
-- affected objects: function private.guard_users_privileged_columns() + trigger
--   guard_users_privileged_columns on public.users; policies "admins can view all profiles",
--   "admins can update any profile" on public.users; function private.is_secure() (replaced);
--   function public.custom_access_token_hook(jsonb) (replaced);
--   function public.current_user_is_blocked()
-- special risks:
--   - private.is_secure() now reads public.users once per statement (initplan via
--     "(select private.is_secure())"); it switches to security definer so the lookup
--     bypasses rls and cannot recurse into the public.users policies.
--   - blocking takes effect on the next statement for every table; the custom access
--     token hook must be enabled (config.toml locally, auth dashboard in prod) for
--     sign-in/refresh to be refused.
--   - "create or replace" keeps existing grants on the replaced functions.

-- ---------------------------------------------------------------------------
-- 1. column-level guard for self-service profile updates
-- ---------------------------------------------------------------------------

-- a trigger instead of column grants: column grants apply to the whole
-- "authenticated" role, so they would also block admins, who share that role.
-- the allow-list is inverted on purpose (compare everything except the
-- self-service columns) so columns added later are protected by default.
create or replace function private.guard_users_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  self_service_columns text[] := array[
    'username',
    'first_name',
    'last_name',
    'phone',
    'avatar_url',
    'linkedin',
    'upwork',
    -- maintained by set_users_updated_at, never meaningful from the client
    'updated_at'
  ];
begin
  -- only api roles are restricted; migrations, seeds and service_role/backend
  -- jobs (postgres, supabase_admin, service_role) keep full write access.
  -- current_user is intentional here: this is a trigger, not an rls policy, and the
  -- question is which database role issued the write.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (select private.jwt_role()) = 'admin' then
    return new;
  end if;

  if (to_jsonb(new) - self_service_columns) is distinct from (to_jsonb(old) - self_service_columns) then
    raise exception 'only administrators can change role, salary, email or account status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.guard_users_privileged_columns() is
  'before update trigger: non-admin api users may only change self-service profile columns';

grant execute on function private.guard_users_privileged_columns() to authenticated;

create trigger guard_users_privileged_columns
  before update on public.users
  for each row execute function private.guard_users_privileged_columns();

-- ---------------------------------------------------------------------------
-- 2. admin visibility and edit rights
-- ---------------------------------------------------------------------------

-- admins manage every account (role, salary, blocking); jwt claim, not a table lookup
create policy "admins can view all profiles"
  on public.users
  for select
  to authenticated
  using ((select private.jwt_role()) = 'admin');

create policy "admins can update any profile"
  on public.users
  for update
  to authenticated
  using ((select private.jwt_role()) = 'admin')
  with check ((select private.jwt_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- 3. blocked users lose access everywhere
-- ---------------------------------------------------------------------------

-- every table carries the restrictive "require secure session" policy, so refusing
-- blocked users here locks them out of all protected rows at once, including
-- requests made with an access token that was issued before the block.
-- security definer justification: the lookup must read public.users past rls
-- (a blocked user cannot see their own row) and must not re-enter the
-- public.users policies, which call this function themselves.
create or replace function private.is_secure()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(auth.role(), '') in ('anon', 'authenticated', 'service_role')
    and not exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_blocked
    )
$$;

comment on function private.is_secure() is
  'restrictive session gate for every table: supabase api role and account not blocked';

-- refuse to mint access tokens for blocked users: sign-in and refresh both fail,
-- so existing sessions die no later than the current access token expiry, and the
-- is_secure() gate above already denies data access before that.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  user_role public.user_role;
  user_is_blocked boolean;
begin
  select u.role, u.is_blocked
  into user_role, user_is_blocked
  from public.users u
  where u.id = (event ->> 'user_id')::uuid;

  if coalesce(user_is_blocked, false) then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'Your account has been blocked. Please contact an administrator.'
      )
    );
  end if;

  claims := event -> 'claims';

  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  else
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- lets the app tell "blocked" apart from "no profile" once is_secure() hides the row.
-- security definer justification: a blocked user can no longer read public.users;
-- the function only ever reports the caller's own flag.
create or replace function public.current_user_is_blocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.is_blocked from public.users u where u.id = (select auth.uid())),
    false
  )
$$;

comment on function public.current_user_is_blocked() is
  'true when the signed-in user is blocked; only reveals the caller''s own status';

revoke execute on function public.current_user_is_blocked() from public, anon;

grant execute on function public.current_user_is_blocked() to authenticated, service_role;
