import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from '@/constants';
import type { UserRole } from '@/lib/api/auth/types';

const { getClaims, getUser, single, rpc, redirect } = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  single: vi.fn(),
  // next/navigation's redirect throws to stop rendering; mirror that
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  })
}));

vi.mock('next/navigation', () => ({ redirect }));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () =>
    Promise.resolve({
      auth: { getClaims, getUser },
      rpc,
      from: () => ({ select: () => ({ eq: () => ({ single }) }) })
    })
}));

// node-only unit test of the server helper; the rule guards client bundles
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getRouteSession, getSessionProfile, requireRouteAccess } from '@/lib/api/auth/server';

describe('getSessionProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without a user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getSessionProfile()).resolves.toBeNull();
    expect(single).not.toHaveBeenCalled();
  });

  it('returns null without a session cookie', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });

    await expect(getSessionProfile()).resolves.toBeNull();
  });

  it.each([401, 403])('returns null when the Auth server rejects the JWT with %i', async (status) => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('session not found', status, 'session_not_found') });

    await expect(getSessionProfile()).resolves.toBeNull();
  });

  it('throws instead of signing out when the Auth server is unreachable', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) });

    await expect(getSessionProfile()).rejects.toEqual({ message: 'fetch failed', statusCode: 503 });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('throws instead of signing out on an Auth server 5xx', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('upstream error', 502, 'unexpected_failure') });

    await expect(getSessionProfile()).rejects.toEqual({ message: 'upstream error', statusCode: 502 });
  });

  it('resets the session when the profile row is missing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(getSessionProfile()).rejects.toThrow(new Error(`NEXT_REDIRECT:${ROUTES.SIGN_OUT}`));
  });

  it('sends a blocked user to the blocked screen when rls hides their row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(getSessionProfile()).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.SIGN_OUT}?reason=blocked`);
    expect(rpc).toHaveBeenCalledWith('current_user_is_blocked');
  });

  it('resets the session of a blocked user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    single.mockResolvedValue({ data: buildUserRow({ is_blocked: true }), error: null });

    await expect(getSessionProfile()).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.SIGN_OUT}?reason=blocked`);
  });

  it('returns the profile of an active user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    single.mockResolvedValue({ data: buildUserRow(), error: null });

    await expect(getSessionProfile()).resolves.toMatchObject({ id: 'user-1', isBlocked: false });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('throws instead of signing out on other database errors', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    single.mockResolvedValue({ data: null, error: { code: '57014', message: 'statement timeout' } });

    await expect(getSessionProfile()).rejects.toEqual({ message: 'statement timeout', statusCode: 500 });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('getRouteSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without valid claims', async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error('invalid jwt') });

    await expect(getRouteSession()).resolves.toBeNull();
  });

  it('reads the role from the user_role claim', async () => {
    signInAs('manager');

    await expect(getRouteSession()).resolves.toEqual({ role: 'manager' });
  });

  it('fails closed on a missing or unknown claim', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1', user_role: 'owner' } }, error: null });

    await expect(getRouteSession()).resolves.toEqual({ role: null });
  });
});

describe('requireRouteAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to login with the page in next without a session', async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    await expect(requireRouteAccess(ROUTES.CREW)).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.LOGIN}?next=%2Fcrew`);
  });

  it.each<[string, UserRole]>([
    [ROUTES.CREW, 'worker'],
    [ROUTES.REPORTS, 'worker']
  ])('redirects %s for %s to access denied', async (route, role) => {
    signInAs(role);

    await expect(requireRouteAccess(route)).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.ACCESS_DENIED}`);
  });

  it('redirects to access denied when the claim is missing', async () => {
    signInAs('worker');
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });

    await expect(requireRouteAccess(ROUTES.CREW)).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.ACCESS_DENIED}`);
  });

  it.each<[string, UserRole]>([
    [ROUTES.CREW, 'manager'],
    [ROUTES.REPORTS, 'manager'],
    [ROUTES.CREW, 'admin']
  ])('allows %s for %s', async (route, role) => {
    signInAs(role);

    await expect(requireRouteAccess(route)).resolves.toMatchObject({ id: 'user-1' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('resets the session of a blocked user with an allowed role', async () => {
    signInAs('admin', { is_blocked: true });

    await expect(requireRouteAccess(ROUTES.CREW)).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.SIGN_OUT}?reason=blocked`);
  });

  it('lets every role open a session-only page', async () => {
    signInAs('worker');

    await expect(requireRouteAccess(ROUTES.TRACKER)).resolves.toMatchObject({ id: 'user-1' });
  });

  // redirecting to /login here would loop: the proxy still trusts the JWT and
  // bounces /login back to the app
  it('resets the session when the Auth server rejects a still-valid JWT', async () => {
    signInAs('worker');
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('session not found', 403, 'session_not_found') });

    await expect(requireRouteAccess(ROUTES.DASHBOARD)).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.SIGN_OUT}`);
  });

  it('signs out a blocked user on a restricted page instead of showing access denied', async () => {
    signInAs('worker', { is_blocked: true });

    await expect(requireRouteAccess(ROUTES.CREW)).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.SIGN_OUT}`);
  });

  it('signs out a revoked session on a restricted page instead of showing access denied', async () => {
    signInAs('worker');
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('session not found', 403, 'session_not_found') });

    await expect(requireRouteAccess(ROUTES.CREW)).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.SIGN_OUT}`);
  });
});

function signInAs(role: UserRole, row: Partial<UserRow> = {}) {
  getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1', user_role: role } }, error: null });
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  single.mockResolvedValue({ data: buildUserRow(row), error: null });
}

// role is deliberately 'worker' here: the guard must use the claim, not this row
function buildUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    created_at: '',
    updated_at: '',
    username: 'test',
    email: 'test@softbee.dev',
    first_name: 'Test',
    last_name: 'User',
    phone: null,
    avatar_url: null,
    role: 'worker',
    date_employment: null,
    positions: null,
    salary: null,
    salary_info: null,
    type_salary: null,
    linkedin: null,
    upwork: null,
    is_confirmed: true,
    is_blocked: false,
    ...overrides
  };
}

type UserRow = Record<string, string | number | boolean | null | string[]>;
