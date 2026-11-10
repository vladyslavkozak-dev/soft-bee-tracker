import { describe, expect, it } from 'vitest';

import { ALL_ROLES, ROUTES } from '@/constants';
import type { UserRole } from '@/lib/api/auth/types';
import {
  buildLoginPath,
  canRoleAccessRoute,
  getRouteAccess,
  getSafeRedirectPath,
  parseUserRole,
  type RouteAccess
} from '@/lib/route-access';

const APP_ROUTES = [ROUTES.DASHBOARD, ROUTES.TRACKER, ROUTES.PROFILE, ROUTES.PROJECTS, ROUTES.CREW, ROUTES.REPORTS];

// the agreed matrix (SBT-49); a change here must be a deliberate product decision
const EXPECTED_ACCESS: Record<UserRole, Record<string, RouteAccess>> = {
  worker: {
    [ROUTES.DASHBOARD]: 'allowed',
    [ROUTES.TRACKER]: 'allowed',
    [ROUTES.PROFILE]: 'allowed',
    [ROUTES.PROJECTS]: 'allowed',
    [ROUTES.CREW]: 'denied',
    [ROUTES.REPORTS]: 'denied'
  },
  manager: {
    [ROUTES.DASHBOARD]: 'allowed',
    [ROUTES.TRACKER]: 'allowed',
    [ROUTES.PROFILE]: 'allowed',
    [ROUTES.PROJECTS]: 'allowed',
    [ROUTES.CREW]: 'allowed',
    [ROUTES.REPORTS]: 'allowed'
  },
  admin: {
    [ROUTES.DASHBOARD]: 'allowed',
    [ROUTES.TRACKER]: 'allowed',
    [ROUTES.PROFILE]: 'allowed',
    [ROUTES.PROJECTS]: 'allowed',
    [ROUTES.CREW]: 'allowed',
    [ROUTES.REPORTS]: 'allowed'
  }
};

// every ROUTES key must be classified here; the Record type fails typecheck
// when a route is added without a decision, so requireRouteAccess on a new page
// can't silently mean "any signed-in role" by accident
const ROUTE_CLASSIFICATION: Record<keyof typeof ROUTES, 'public' | readonly UserRole[]> = {
  HOME: ALL_ROLES,
  LOGIN: 'public',
  REGISTER: 'public',
  FORGOT_PASSWORD: 'public',
  AUTH_CONFIRM: 'public',
  UPDATE_PASSWORD: 'public',
  SIGN_OUT: 'public',
  ACCESS_DENIED: 'public',
  BLOCKED: 'public',
  TERMS: 'public',
  DASHBOARD: ALL_ROLES,
  PROJECTS: ALL_ROLES,
  TRACKER: ALL_ROLES,
  PROFILE: ALL_ROLES,
  CREW: ['manager', 'admin'],
  REPORTS: ['manager', 'admin']
};

describe('route classification', () => {
  it.each(Object.entries(ROUTE_CLASSIFICATION))('%s matches the route rules', (key, classification) => {
    const route = ROUTES[key as keyof typeof ROUTES];

    if (classification === 'public') {
      expect(getRouteAccess(route, null)).toBe('allowed');
      return;
    }

    expect(getRouteAccess(route, null)).toBe('login');
    for (const role of ALL_ROLES) {
      expect(canRoleAccessRoute(route, role)).toBe(classification.includes(role));
    }
  });
});

describe('getRouteAccess', () => {
  describe.each(Object.entries(EXPECTED_ACCESS))('as %s', (role, expectations) => {
    it.each(Object.entries(expectations))('%s → %s', (route, expected) => {
      expect(getRouteAccess(route, { role: role as UserRole })).toBe(expected);
    });
  });

  it.each(APP_ROUTES)('sends signed-out users on %s to login', (route) => {
    expect(getRouteAccess(route, null)).toBe('login');
  });

  it('protects unlisted routes and the root by default', () => {
    expect(getRouteAccess('/', null)).toBe('login');
    expect(getRouteAccess('/some-new-page', null)).toBe('login');
    expect(getRouteAccess('/some-new-page', { role: 'worker' })).toBe('allowed');
  });

  it('applies restrictions to nested paths but not to lookalike prefixes', () => {
    expect(getRouteAccess('/crew/42', { role: 'worker' })).toBe('denied');
    expect(getRouteAccess('/reports/2026/11', { role: 'worker' })).toBe('denied');
    expect(getRouteAccess('/crewmates', { role: 'worker' })).toBe('allowed');
  });

  it('denies restricted routes when the role claim is missing (fail closed)', () => {
    expect(getRouteAccess(ROUTES.CREW, { role: null })).toBe('denied');
  });

  it('keeps auth routes reachable without a session', () => {
    for (const route of [
      ROUTES.LOGIN,
      ROUTES.REGISTER,
      ROUTES.FORGOT_PASSWORD,
      ROUTES.AUTH_CONFIRM,
      ROUTES.UPDATE_PASSWORD,
      ROUTES.SIGN_OUT,
      ROUTES.ACCESS_DENIED,
      ROUTES.BLOCKED,
      ROUTES.TERMS
    ]) {
      expect(getRouteAccess(route, null)).toBe('allowed');
    }
  });

  it('bounces signed-in users away from login only', () => {
    expect(getRouteAccess(ROUTES.LOGIN, { role: 'worker' })).toBe('guest-only');
    expect(getRouteAccess(ROUTES.UPDATE_PASSWORD, { role: 'worker' })).toBe('allowed');
    expect(getRouteAccess(ROUTES.UPDATE_PASSWORD, { role: 'worker' })).toBe('allowed');
    expect(getRouteAccess(ROUTES.ACCESS_DENIED, { role: 'worker' })).toBe('allowed');
  });

  // an invite link signs the user in; they finish registration while signed in
  it('keeps register open to a signed-in user for the invite flow', () => {
    expect(getRouteAccess(ROUTES.REGISTER, { role: 'worker' })).toBe('allowed');
  });

  it('lets a session without a role reach sign-out so it can be reset', () => {
    expect(getRouteAccess(ROUTES.SIGN_OUT, { role: null })).toBe('allowed');
  });
});

describe('canRoleAccessRoute', () => {
  it('fails closed for a null role', () => {
    expect(canRoleAccessRoute(ROUTES.TRACKER, null)).toBe(false);
  });
});

describe('parseUserRole', () => {
  it.each(['worker', 'manager', 'admin'])('accepts %s', (role) => {
    expect(parseUserRole(role)).toBe(role);
  });

  it.each([null, undefined, '', 'Admin', 'superuser'])('rejects %s', (value) => {
    expect(parseUserRole(value)).toBeNull();
  });
});

describe('getSafeRedirectPath', () => {
  it.each(['/crew', '/tracker?tab=week', '/users/42/edit#top'])('keeps the app path %s', (value) => {
    expect(getSafeRedirectPath(value)).toBe(value);
  });

  it.each([
    null,
    undefined,
    '',
    'crew',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r\n/evil.example',
    '/\t\\evil.example',
    '/',
    ROUTES.LOGIN,
    `${ROUTES.LOGIN}?next=/crew`,
    ROUTES.SIGN_OUT
  ])('rejects %s', (value) => {
    expect(getSafeRedirectPath(value)).toBeNull();
  });
});

describe('getSafeRedirectPath normalization', () => {
  it('returns the parsed path, not the raw input', () => {
    expect(getSafeRedirectPath('/tracker/../crew?tab=week')).toBe('/crew?tab=week');
  });

  it('rejects a path that normalizes to an auth page', () => {
    expect(getSafeRedirectPath('/crew/../login')).toBeNull();
  });
});

describe('buildLoginPath', () => {
  it('carries the requested page in next', () => {
    expect(buildLoginPath('/tracker?tab=week')).toBe(`${ROUTES.LOGIN}?next=%2Ftracker%3Ftab%3Dweek`);
  });

  it('drops an unsafe or pointless next', () => {
    expect(buildLoginPath('/')).toBe(ROUTES.LOGIN);
    expect(buildLoginPath('//evil.example')).toBe(ROUTES.LOGIN);
  });
});
