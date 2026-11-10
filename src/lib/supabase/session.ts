import type { CookieOptions } from '@supabase/ssr';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { HOME_ROUTE, NEXT_PARAM, ROUTES } from '@/constants';
import { buildLoginPath, getRouteAccess, getRouteSessionFromClaim, getSafeRedirectPath } from '@/lib/route-access';
import { Database } from '@/types';

function applyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request
  });

  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({
          request
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      }
    }
  });

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  // getClaims verifies the JWT (and refreshes it through setAll above), so the
  // role read here is the same claims.user_role that RLS checks.
  const { data, error } = await supabase.auth.getClaims();
  const session = error || !data ? null : getRouteSessionFromClaim(data.claims.user_role);

  const access = getRouteAccess(request.nextUrl.pathname, session);

  // an access token minted before the block stays valid until it expires; rls already
  // denies it every row, so end the session here and show the blocked screen
  if (session && request.nextUrl.pathname !== ROUTES.BLOCKED) {
    const { data: isBlocked } = await supabase.rpc('current_user_is_blocked');

    if (isBlocked) {
      // global scope revokes every refresh token of this user, not just this browser's
      await supabase.auth.signOut({ scope: 'global' });
      return withSessionCookies(supabaseResponse, NextResponse.redirect(buildUrl(request, ROUTES.BLOCKED)));
    }
  }

  if (access === 'login') {
    const { pathname, search } = request.nextUrl;
    return withSessionCookies(supabaseResponse, NextResponse.redirect(new URL(buildLoginPath(`${pathname}${search}`), request.url)));
  }

  if (access === 'guest-only') {
    // already signed in (e.g. a second tab): finish the deep link instead of the dashboard
    const nextPath = getSafeRedirectPath(request.nextUrl.searchParams.get(NEXT_PARAM)) ?? HOME_ROUTE;
    return withSessionCookies(supabaseResponse, NextResponse.redirect(new URL(nextPath, request.url)));
  }

  if (access === 'denied') {
    // rewrite keeps the requested URL in the address bar. a document load
    // answers 403; a client navigation (RSC fetch) must answer 200, because the
    // app router drops a non-OK RSC response and the click silently does nothing
    const init = isDocumentRequest(request) ? { status: 403 } : undefined;
    return withSessionCookies(supabaseResponse, NextResponse.rewrite(buildUrl(request, ROUTES.ACCESS_DENIED), init));
  }

  return supabaseResponse;
}

// next strips its own rsc header before the proxy runs, so use the browser's
// sec-fetch-dest: 'document' for page loads, 'empty' for router fetches.
// clients that don't send it (curl, old browsers) get the document answer.
function isDocumentRequest(request: NextRequest): boolean {
  const fetchDest = request.headers.get('sec-fetch-dest');
  return fetchDest === null || fetchDest === 'document';
}

function buildUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return url;
}

function withSessionCookies(source: NextResponse, target: NextResponse): NextResponse {
  applyResponseCookies(source, target);
  return target;
}
