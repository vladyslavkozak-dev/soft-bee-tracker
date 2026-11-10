import type { CookieOptions } from '@supabase/ssr';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { ALLOW_AUTHORIZED_ROUTES_LIST, PROTECTED_ROUTES_LIST, ROUTES } from '@/constants';
import { Database } from '@/types';

function pathnameMatchesRouteList(pathname: string, routes: readonly string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

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

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname } = request.nextUrl;

  // an access token minted before the block stays valid until it expires; rls already
  // denies it every row, so end the session here and show the blocked screen
  if (user && pathname !== ROUTES.BLOCKED) {
    const { data: isBlocked } = await supabase.rpc('current_user_is_blocked');

    if (isBlocked) {
      // global scope revokes every refresh token of this user, not just this browser's
      await supabase.auth.signOut({ scope: 'global' });
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ROUTES.BLOCKED;
      const redirectResponse = NextResponse.redirect(redirectUrl);
      applyResponseCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  if (!user && pathnameMatchesRouteList(pathname, PROTECTED_ROUTES_LIST)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.LOGIN;
    const redirectResponse = NextResponse.redirect(redirectUrl);
    applyResponseCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  if (user && pathnameMatchesRouteList(pathname, ALLOW_AUTHORIZED_ROUTES_LIST)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.DASHBOARD;
    const redirectResponse = NextResponse.redirect(redirectUrl);
    applyResponseCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  return supabaseResponse;
}
