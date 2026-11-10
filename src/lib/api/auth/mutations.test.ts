import { beforeEach, describe, expect, it, vi } from 'vitest';

import content from './content.json';
import { signInWithPassword, updateProfile } from './mutations';
import type { UpdateProfileRequest } from './types';

const createBrowserClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/client', () => ({ createBrowserClient }));

const profileRequest: UpdateProfileRequest = {
  username: 'worker',
  firstName: 'Wim',
  lastName: 'Workerman',
  phone: null,
  avatarUrl: null,
  linkedin: null,
  upwork: null
};

interface AuthMock {
  signInWithPassword: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
}

function mockClient({
  signInError = null,
  isBlocked = false,
  updateError = null
}: {
  signInError?: { message: string; status: number } | null;
  isBlocked?: boolean;
  updateError?: { code: string; message: string } | null;
} = {}) {
  const auth: AuthMock = {
    signInWithPassword: vi.fn().mockResolvedValue({ error: signInError }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  };
  const rpc = vi.fn().mockResolvedValue({ data: isBlocked, error: null });
  const single = vi.fn().mockResolvedValue({ data: null, error: updateError });
  const update = vi.fn<(row: Record<string, unknown>) => object>(() => ({ eq: () => ({ select: () => ({ single }) }) }));
  const from = vi.fn(() => ({ update }));

  createBrowserClient.mockReturnValue({ auth, rpc, from });

  return { auth, rpc, update };
}

describe('signInWithPassword', () => {
  beforeEach(() => {
    createBrowserClient.mockReset();
  });

  it('reports a blocked account when the access token hook refuses the sign-in', async () => {
    const { rpc } = mockClient({ signInError: { message: 'hook error', status: 403 } });

    await expect(signInWithPassword({ email: 'w@x.dev', password: 'p' })).rejects.toEqual({
      message: content.blocked,
      statusCode: 403
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('signs a blocked user back out when the hook is not enabled', async () => {
    const { auth, rpc } = mockClient({ isBlocked: true });

    await expect(signInWithPassword({ email: 'w@x.dev', password: 'p' })).rejects.toEqual({
      message: content.blocked,
      statusCode: 403
    });
    expect(rpc).toHaveBeenCalledWith('current_user_is_blocked');
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('lets an active user in', async () => {
    const { auth } = mockClient();

    await expect(signInWithPassword({ email: 'w@x.dev', password: 'p' })).resolves.toBeUndefined();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('keeps wrong credentials as a 401', async () => {
    mockClient({ signInError: { message: 'Invalid login credentials', status: 400 } });

    await expect(signInWithPassword({ email: 'w@x.dev', password: 'p' })).rejects.toEqual({
      message: 'Invalid login credentials',
      statusCode: 401
    });
  });
});

describe('updateProfile', () => {
  beforeEach(() => {
    createBrowserClient.mockReset();
  });

  it('only sends self-service columns, never role, salary or account flags', async () => {
    const { update } = mockClient({ updateError: { code: '23505', message: 'dup' } });

    await expect(updateProfile(profileRequest)).rejects.toBeDefined();

    expect(Object.keys(update.mock.calls[0][0]).sort()).toEqual(
      ['avatar_url', 'first_name', 'last_name', 'linkedin', 'phone', 'upwork', 'username'].sort()
    );
  });

  it.each([
    ['23505', content.usernameTaken, 409],
    ['42501', content.forbiddenProfileChange, 403],
    ['PGRST116', content.blocked, 403],
    ['XX000', 'boom', 500]
  ])('maps database error %s to a safe api error', async (code, message, statusCode) => {
    mockClient({ updateError: { code, message: 'boom' } });

    await expect(updateProfile(profileRequest)).rejects.toEqual({ message, statusCode });
  });
});
