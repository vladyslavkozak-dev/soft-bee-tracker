import type { UserRole } from '@/lib/api/auth/types';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  AUTH_CONFIRM: '/auth/confirm',
  UPDATE_PASSWORD: '/auth/update-password',
  SIGN_OUT: '/auth/sign-out',
  ACCESS_DENIED: '/access-denied',
  BLOCKED: '/blocked',
  TERMS: '/terms',
  DASHBOARD: '/dashboard',
  PROJECTS: '/projects',
  TRACKER: '/tracker',
  CREW: '/crew',
  REPORTS: '/reports',
  PROFILE: '/profile'
} as const;

// where the app starts for a signed-in user (/ and /dashboard redirect here)
export const HOME_ROUTE = ROUTES.TRACKER;

// reachable without a session; signed-in users are bounced from GUEST_ONLY_ROUTES_LIST
export const PUBLIC_ROUTES_LIST = [
  ROUTES.LOGIN,
  ROUTES.REGISTER,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.AUTH_CONFIRM,
  ROUTES.UPDATE_PASSWORD,
  ROUTES.SIGN_OUT,
  ROUTES.ACCESS_DENIED,
  ROUTES.BLOCKED,
  ROUTES.TERMS
];

// query param carrying the page a signed-out user asked for, back to it after login
export const NEXT_PARAM = 'next';

// query param on the sign-out route saying why the session was cut
export const SIGN_OUT_REASON_PARAM = 'reason';
export const SIGN_OUT_REASON_BLOCKED = 'blocked';

// /register is not guest-only: an invite link signs the user in, and they set
// their password there while signed in
export const GUEST_ONLY_ROUTES_LIST = [ROUTES.LOGIN];

export const ALL_ROLES: readonly UserRole[] = ['worker', 'manager', 'admin'];

// role-restricted routes. any route not public and not listed here only needs a
// session, for every role. route-access.test.ts classifies every ROUTES entry,
// so adding a route forces a decision here.
// keep in sync with RLS: hiding a page is UX, the database still enforces data access.
export const ROLE_RESTRICTED_ROUTES: Record<string, readonly UserRole[]> = {
  [ROUTES.CREW]: ['manager', 'admin'],
  [ROUTES.REPORTS]: ['manager', 'admin']
};
