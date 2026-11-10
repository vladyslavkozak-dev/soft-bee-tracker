'use client';

import { Button } from '@ui/button';

// route error boundary: a failed server read (e.g. getSessionProfile on a
// database error) lands here instead of looking like a logout
export default function RouteError({ reset }: RouteErrorProps) {
  function handleRetryClick() {
    reset();
  }

  return (
    <div className='mx-auto flex w-full max-w-lg flex-col items-center gap-4 text-center'>
      <h1 className='text-3xl font-semibold tracking-tight'>Something went wrong</h1>
      <p className='text-muted-foreground text-sm'>We couldn&apos;t load this page. Try again in a moment.</p>
      <Button onClick={handleRetryClick}>Try again</Button>
    </div>
  );
}

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}
