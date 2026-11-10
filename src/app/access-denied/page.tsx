import type { Metadata } from 'next';
import Link from 'next/link';

import { ROUTES } from '@/constants';
import { getRouteSession } from '@/lib/api/auth/server';

export const metadata: Metadata = {
  title: 'Access denied',
  robots: { index: false }
};

// rendered by the proxy (rewrite, 403) and by requireRouteAccess (redirect)
// when a signed-in user's role may not open the requested page.
export default async function AccessDeniedPage() {
  const session = await getRouteSession();
  // a session with no user_role claim is denied everywhere, Tracker included;
  // only a fresh sign-in picks up a new claim
  const hasNoRole = session !== null && session.role === null;

  return (
    <div className='mx-auto flex w-full max-w-lg flex-col gap-4 text-center'>
      <p className='text-muted-foreground text-sm font-medium'>403</p>
      <h1 className='text-3xl font-semibold tracking-tight'>Access denied</h1>
      {hasNoRole ? <MissingRoleContent /> : <WrongRoleContent />}
    </div>
  );
}

function MissingRoleContent() {
  return (
    <>
      <p className='text-muted-foreground text-sm'>
        Your session has no role yet. Sign in again to refresh it. If that doesn&apos;t help, ask an admin to check your account.
      </p>
      {/* plain <a>, not <Link>: a prefetch of the sign-out route would sign the user out */}
      <a className='text-muted-foreground hover:text-foreground text-sm transition-colors' href={ROUTES.SIGN_OUT}>
        Sign in again
      </a>
    </>
  );
}

function WrongRoleContent() {
  return (
    <>
      <p className='text-muted-foreground text-sm'>
        Your role doesn&apos;t have access to this page. Ask an admin if you think you need it.
      </p>
      <Link className='text-muted-foreground hover:text-foreground text-sm transition-colors' href={ROUTES.TRACKER}>
        Go to Tracker
      </Link>
    </>
  );
}
