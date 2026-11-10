import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from '@/constants';
import { updateSession } from './session';

const createServerClient = vi.hoisted(() => vi.fn());

vi.mock('@supabase/ssr', () => ({ createServerClient }));

function mockSupabase({ hasSession, isBlocked }: { hasSession: boolean; isBlocked: boolean }) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: isBlocked, error: null });

  createServerClient.mockReturnValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: hasSession ? { claims: { sub: 'user-1' } } : null }),
      signOut
    },
    rpc
  });

  return { signOut, rpc };
}

function request(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'));
}

describe('updateSession', () => {
  beforeEach(() => {
    createServerClient.mockReset();
  });

  it('ends a blocked user session and redirects to the blocked screen', async () => {
    const { signOut } = mockSupabase({ hasSession: true, isBlocked: true });

    const response = await updateSession(request(ROUTES.TRACKER));

    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe(ROUTES.BLOCKED);
  });

  it('does not loop on the blocked screen itself', async () => {
    const { rpc } = mockSupabase({ hasSession: true, isBlocked: true });

    const response = await updateSession(request(ROUTES.BLOCKED));

    expect(rpc).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBeNull();
  });

  it('lets an active user through', async () => {
    const { signOut } = mockSupabase({ hasSession: true, isBlocked: false });

    const response = await updateSession(request(ROUTES.TRACKER));

    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBeNull();
  });

  it('skips the block check for anonymous visitors', async () => {
    const { rpc } = mockSupabase({ hasSession: false, isBlocked: false });

    await updateSession(request(ROUTES.LOGIN));

    expect(rpc).not.toHaveBeenCalled();
  });
});
