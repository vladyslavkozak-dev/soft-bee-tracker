import 'server-only';

import { isAuthApiError, isAuthSessionMissingError, type AuthError } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { ROUTES, SIGN_OUT_REASON_BLOCKED, SIGN_OUT_REASON_PARAM } from '@/constants';
import { createServerClient } from '@/lib/supabase/server';
import { mapUserRowToProfile, USER_COLUMNS } from '@/lib/api/auth/mappers';
import type { UserProfile } from '@/lib/api/auth/types';
import type { ApiError } from '@/types/api-error';
import { buildLoginPath, getRouteAccess, getRouteSessionFromClaim, type RouteSession } from '@/lib/route-access';

// server-component/route-handler counterpart of useSessionProfile.
// imported via '@/lib/api/auth/server' (not the barrel) so client bundles
// never pull in next/headers.
// cache() dedupes it per request: the root layout and requireRouteAccess on the
// page share one getUser() and one users query
export const getSessionProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError && !isInvalidSessionError(userError)) {
    // timeout, 5xx or rate limit from the Auth server: like the database errors
    // below, surface it to the error boundary instead of logging the user out
    throw {
      message: userError.message,
      statusCode: isAuthApiError(userError) ? userError.status : 503
    } satisfies ApiError;
  }

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase.from('users').select(USER_COLUMNS).eq('id', userData.user.id).single();

  // no profile row: the session can never use the app. server components can't
  // write cookies, so hand off to the route handler that clears them.
  // rls also hides a blocked user's own row, so tell that case apart via the rpc
  if (error?.code === NO_ROWS_ERROR_CODE) {
    const { data: isBlocked } = await supabase.rpc('current_user_is_blocked');

    redirect(isBlocked ? `${ROUTES.SIGN_OUT}?${SIGN_OUT_REASON_PARAM}=${SIGN_OUT_REASON_BLOCKED}` : ROUTES.SIGN_OUT);
  }

  // anything else (timeout, network, RLS) is likely transient: surface it to the
  // error boundary instead of logging the user out
  if (error) {
    throw {
      message: error.message,
      statusCode: 500
    } satisfies ApiError;
  }

  const profile = mapUserRowToProfile(data);

  // defensive: rls normally hides a blocked row (handled above) and the proxy
  // signs blocked users out first; kept in case the row is ever readable
  if (profile.isBlocked) {
    redirect(`${ROUTES.SIGN_OUT}?${SIGN_OUT_REASON_PARAM}=${SIGN_OUT_REASON_BLOCKED}`);
  }

  return profile;
});

// server counterpart of the proxy session: role from the verified user_role
// claim, so the sidebar, page guards, proxy and RLS never disagree.
// null means no valid session. cached per request like getSessionProfile.
export const getRouteSession = cache(async (): Promise<RouteSession | null> => {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getClaims();

  return error || !data ? null : getRouteSessionFromClaim(data.claims.user_role);
});

/**
 * Page guard; call it at the top of every app page.tsx.
 *
 * It does not decide roles itself: it applies ROLE_RESTRICTED_ROUTES through
 * getRouteAccess, the same decision and the same user_role claim the proxy
 * uses. A route missing from that map is open to every signed-in role, so
 * restricting a page means adding it there (route-access.test.ts enforces a
 * decision for every ROUTES entry).
 *
 * On top of the proxy it adds two checks the claim can't carry: getUser() asks
 * the Auth server, so a revoked session is caught even when getClaims verified
 * the JWT locally, and getSessionProfile() cuts blocked users. The role itself
 * never comes from public.users. Those session checks run before the role
 * check, so a revoked or blocked user is signed out rather than shown access
 * denied.
 *
 * pathname is the route the page serves, used for the role decision and the
 * login ?next= target. Pass ROUTES.X for a static page; a dynamic route (e.g.
 * /projects/[id]) must pass its real path, built from params, so the role
 * match and the post-login redirect point at the right page.
 */
export async function requireRouteAccess(pathname: string): Promise<UserProfile> {
  const access = getRouteAccess(pathname, await getRouteSession());

  if (access === 'login') {
    redirect(buildLoginPath(pathname));
  }

  const profile = await getSessionProfile();

  // the claim said "signed in" but the Auth server says no (revoked session or
  // deleted user). /login would bounce straight back here, because the proxy
  // still sees a valid JWT and treats /login as guest-only, so clear the stale
  // cookies first
  if (!profile) {
    redirect(ROUTES.SIGN_OUT);
  }

  if (access === 'denied') {
    redirect(ROUTES.ACCESS_DENIED);
  }

  return profile;
}

// only these mean the session is really gone: no cookie at all, or the Auth
// server rejecting the JWT (401/403 covers bad_jwt, session_not_found and
// user_not_found). anything else is the Auth server being unavailable
function isInvalidSessionError(error: AuthError): boolean {
  return isAuthSessionMissingError(error) || (isAuthApiError(error) && INVALID_SESSION_STATUSES.includes(error.status));
}

// postgREST code for .single() matching zero rows
const NO_ROWS_ERROR_CODE = 'PGRST116';

const INVALID_SESSION_STATUSES: readonly number[] = [401, 403];
