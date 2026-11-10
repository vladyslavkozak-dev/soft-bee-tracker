import { ALL_ROLES, GUEST_ONLY_ROUTES_LIST, NEXT_PARAM, PUBLIC_ROUTES_LIST, ROLE_RESTRICTED_ROUTES, ROUTES } from '@/constants';
import type { UserRole } from '@/lib/api/auth/types';

/**
 * Decides what the request guard does for a pathname and session.
 * - `allowed`: render the route
 * - `guest-only`: signed-in user on /login or /register, send them into the app
 * - `login`: no session on a protected route
 * - `denied`: signed in, but the role may not open this route
 */
export function getRouteAccess(pathname: string, session: RouteSession | null): RouteAccess {
  if (matchesRouteList(pathname, PUBLIC_ROUTES_LIST)) {
    return session && matchesRouteList(pathname, GUEST_ONLY_ROUTES_LIST) ? 'guest-only' : 'allowed';
  }

  if (!session) {
    return 'login';
  }

  return canRoleAccessRoute(pathname, session.role) ? 'allowed' : 'denied';
}

export function canRoleAccessRoute(pathname: string, role: UserRole | null): boolean {
  const allowedRoles = getAllowedRoles(pathname);

  // a missing or unknown role fails closed, matching private.is_manager_or_admin()
  return role !== null && allowedRoles.includes(role);
}

// the single source of truth for the role: the verified user_role JWT claim,
// the same value RLS reads through private.jwt_role(). the proxy, page guards
// and sidebar all build their session through this, never from public.users.
export function getRouteSessionFromClaim(roleClaim: string | null | undefined): RouteSession {
  return { role: parseUserRole(typeof roleClaim === 'string' ? roleClaim : null) };
}

export function parseUserRole(value: string | null | undefined): UserRole | null {
  return ALL_ROLES.find((role) => role === value) ?? null;
}

// login URL that brings the user back to where they were going after sign-in
export function buildLoginPath(nextPath: string): string {
  const safeNext = getSafeRedirectPath(nextPath);

  return safeNext ? `${ROUTES.LOGIN}?${NEXT_PARAM}=${encodeURIComponent(safeNext)}` : ROUTES.LOGIN;
}

// only same-origin app paths. the value is resolved with the URL parser first,
// so what we check is what the browser and router.push will use: tabs and
// newlines are dropped, //host and /\\host resolve to another origin and are
// rejected. auth pages are dropped so login can't send you back to login.
export function getSafeRedirectPath(value: string | null | undefined): string | null {
  if (!value?.startsWith('/')) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value, SAFE_REDIRECT_BASE);
  } catch {
    return null;
  }

  if (url.origin !== SAFE_REDIRECT_BASE) {
    return null;
  }

  if (url.pathname === '/' || matchesRouteList(url.pathname, PUBLIC_ROUTES_LIST)) {
    return null;
  }

  // the normalized form, never the raw input
  return `${url.pathname}${url.search}${url.hash}`;
}

export function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function matchesRouteList(pathname: string, routes: readonly string[]): boolean {
  return routes.some((route) => matchesRoute(pathname, route));
}

function getAllowedRoles(pathname: string): readonly UserRole[] {
  const restrictedRoute = Object.keys(ROLE_RESTRICTED_ROUTES).find((route) => matchesRoute(pathname, route));

  return restrictedRoute ? ROLE_RESTRICTED_ROUTES[restrictedRoute] : ALL_ROLES;
}

export type RouteAccess = 'allowed' | 'guest-only' | 'login' | 'denied';

export interface RouteSession {
  role: UserRole | null;
}

// placeholder origin: only used to tell whether a path escapes to another host
const SAFE_REDIRECT_BASE = 'http://app.internal';
