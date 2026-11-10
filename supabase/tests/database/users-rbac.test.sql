-- rbac and account blocking on public.users (and every table via private.is_secure()).
-- uses the seeded accounts from supabase/seeds/01_users.sql:
--   a01 admin, a02 manager, a03 worker
begin;

select plan(24);

-- impersonate an api user the way postgrest does: role + signed jwt claims
create function pg_temp.act_as(user_id uuid, user_role text)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated', 'user_role', user_role)::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

-- ---------------------------------------------------------------------------
-- worker: self-service columns only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000a03', 'worker');

select lives_ok(
  $$ update public.users
     set first_name = 'Wimmy', last_name = 'W', username = 'worker2', phone = '+380000000',
         avatar_url = 'https://example.com/a.png', linkedin = 'https://linkedin.com/in/w',
         upwork = 'https://upwork.com/w'
     where id = '00000000-0000-0000-0000-000000000a03' $$,
  'worker can update every self-service profile column'
);

select throws_ok(
  $$ update public.users set role = 'admin' where id = '00000000-0000-0000-0000-000000000a03' $$,
  '42501', null, 'worker cannot promote their own role'
);

select throws_ok(
  $$ update public.users set salary = 99999 where id = '00000000-0000-0000-0000-000000000a03' $$,
  '42501', null, 'worker cannot change their own salary'
);

select throws_ok(
  $$ update public.users set salary_info = 'x', type_salary = 'fixed' where id = '00000000-0000-0000-0000-000000000a03' $$,
  '42501', null, 'worker cannot change salary info or salary type'
);

select throws_ok(
  $$ update public.users set is_confirmed = false where id = '00000000-0000-0000-0000-000000000a03' $$,
  '42501', null, 'worker cannot change their confirmation flag'
);

select throws_ok(
  $$ update public.users set email = 'evil@example.com' where id = '00000000-0000-0000-0000-000000000a03' $$,
  '42501', null, 'worker cannot change their email'
);

select throws_ok(
  $$ update public.users set positions = '{"titles":["CTO"]}', date_employment = '2020-01-01'
     where id = '00000000-0000-0000-0000-000000000a03' $$,
  '42501', null, 'worker cannot change positions or employment date'
);

select throws_ok(
  $$ update public.users set first_name = 'Ok', role = 'admin' where id = '00000000-0000-0000-0000-000000000a03' $$,
  '42501', null, 'mixing an allowed column with a privileged one is rejected as a whole'
);

select is_empty(
  $$ update public.users set first_name = 'Hacked' where id = '00000000-0000-0000-0000-000000000a01' returning id $$,
  'worker cannot update another user''s profile'
);

select results_eq(
  $$ select id::text from public.users $$,
  $$ values ('00000000-0000-0000-0000-000000000a03') $$,
  'worker only sees their own profile'
);

-- a forged user_role claim cannot exist without the jwt secret; an unsigned
-- "worker" claim is the strongest thing a worker can send
reset role;

select results_eq(
  $$ select role::text, first_name from public.users where id = '00000000-0000-0000-0000-000000000a03' $$,
  $$ values ('worker', 'Wimmy') $$,
  'worker row kept its role and received the self-service change'
);

-- ---------------------------------------------------------------------------
-- manager: same self-service rules as a worker for their own row
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000a02', 'manager');

select throws_ok(
  $$ update public.users set role = 'admin' where id = '00000000-0000-0000-0000-000000000a02' $$,
  '42501', null, 'manager cannot promote themselves to admin'
);

select is_empty(
  $$ update public.users set is_blocked = true where id = '00000000-0000-0000-0000-000000000a03' returning id $$,
  'manager cannot block other users'
);

reset role;

-- ---------------------------------------------------------------------------
-- admin: full access
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000a01', 'admin');

select is(
  (select count(*)::int from public.users where email like '%@softbee.dev'),
  3,
  'admin sees every profile'
);

select lives_ok(
  $$ update public.users
     set role = 'manager', salary = 1234, salary_info = 'raise', type_salary = 'hourly',
         is_confirmed = true, first_name = 'Wim'
     where id = '00000000-0000-0000-0000-000000000a03' $$,
  'admin can edit role, salary and profile fields of another user'
);

select lives_ok(
  $$ update public.users set is_blocked = true where id = '00000000-0000-0000-0000-000000000a03' $$,
  'admin can block a user'
);

reset role;

select results_eq(
  $$ select role::text, salary, is_blocked from public.users where id = '00000000-0000-0000-0000-000000000a03' $$,
  $$ values ('manager', 1234::numeric, true) $$,
  'admin changes were persisted'
);

-- ---------------------------------------------------------------------------
-- blocked user: locked out everywhere, even with a token minted before the block
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000a03', 'worker');

select ok(not private.is_secure(), 'the secure-session gate rejects a blocked user');

select is_empty(
  $$ select id from public.users $$,
  'blocked user cannot read their own profile'
);

select is_empty(
  $$ update public.users set first_name = 'Still here' where id = '00000000-0000-0000-0000-000000000a03' returning id $$,
  'blocked user cannot update their profile'
);

select is(
  (select count(*)::int from public.trackers) + (select count(*)::int from public.projects)
    + (select count(*)::int from public.project_rates),
  0,
  'blocked user cannot read trackers, projects or project rates'
);

select ok(public.current_user_is_blocked(), 'blocked user can learn that they are blocked');

reset role;

select is(
  public.custom_access_token_hook(
    jsonb_build_object('user_id', '00000000-0000-0000-0000-000000000a03', 'claims', '{}'::jsonb)
  ) -> 'error' ->> 'http_code',
  '403',
  'access token hook refuses to mint tokens for a blocked user'
);

select is(
  public.custom_access_token_hook(
    jsonb_build_object('user_id', '00000000-0000-0000-0000-000000000a01', 'claims', '{}'::jsonb)
  ) -> 'claims' ->> 'user_role',
  'admin',
  'access token hook still issues role claims for active users'
);

select * from finish();

rollback;
