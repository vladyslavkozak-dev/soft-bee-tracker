import Link from 'next/link';

import { LoginForm } from '@/components/auth/login-form/login-form';
import { AuthHeading } from '@components/layout/auth-shell/auth-heading';
import { HOME_ROUTE, NEXT_PARAM, ROUTES } from '@/constants';
import { getSafeRedirectPath } from '@/lib/route-access';
import content from './content.json';

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextParam = params[NEXT_PARAM];
  // the proxy and page guards put the requested page in ?next=; never trust it blindly
  const redirectTo = getSafeRedirectPath(typeof nextParam === 'string' ? nextParam : null) ?? HOME_ROUTE;

  return (
    <div className='mx-auto flex w-full max-w-sm flex-col gap-8'>
      <AuthHeading title={content.title} description={content.description} />

      <LoginForm redirectTo={redirectTo} />

      <p className='text-muted-foreground text-center text-xs'>
        {content.termsPrefix}{' '}
        <Link className='text-foreground font-medium underline-offset-4 hover:underline' href={ROUTES.TERMS}>
          {content.termsLink}
        </Link>
        .
      </p>
    </div>
  );
}

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
