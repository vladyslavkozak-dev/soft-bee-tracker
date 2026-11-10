import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from '@/constants';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => Promise.resolve({ auth: { signOut } })
}));

import { GET } from './route';

describe('sign-out route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it('signs out this browser only and returns to login', async () => {
    const response = await GET(buildRequest(ROUTES.SIGN_OUT));

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(response.headers.get('location')).toBe(`http://localhost:3000${ROUTES.LOGIN}`);
  });

  it('sends a blocked user to the blocked page', async () => {
    const response = await GET(buildRequest(`${ROUTES.SIGN_OUT}?reason=blocked`));

    expect(response.headers.get('location')).toBe(`http://localhost:3000${ROUTES.BLOCKED}`);
  });

  it('ignores an unknown reason', async () => {
    const response = await GET(buildRequest(`${ROUTES.SIGN_OUT}?reason=whatever`));

    expect(response.headers.get('location')).toBe(`http://localhost:3000${ROUTES.LOGIN}`);
  });

  it('expires every supabase cookie, including chunked ones', async () => {
    const response = await GET(buildRequest(ROUTES.SIGN_OUT, 'sb-127-auth-token.0=a; sb-127-auth-token.1=b; theme=dark'));

    expect(response.cookies.get('sb-127-auth-token.0')?.value).toBe('');
    expect(response.cookies.get('sb-127-auth-token.1')?.value).toBe('');
    expect(response.cookies.get('theme')).toBeUndefined();
  });
});

function buildRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), cookie ? { headers: { cookie } } : undefined);
}
