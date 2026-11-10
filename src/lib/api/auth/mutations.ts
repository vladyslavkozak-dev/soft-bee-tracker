'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ROUTES } from '@/constants';
import { authKeys, fetchIsCurrentUserBlocked } from '@/lib/api/auth/queries';
import { mapProfileUpdateToUserRow, mapUserRowToProfile, USER_COLUMNS } from '@/lib/api/auth/mappers';
import { createBrowserClient } from '@/lib/supabase/client';
import { clearSupabaseAuthCookies } from '@/lib/supabase/cookies';
import { resetClientState } from '@/lib/api/reset-client-state';
import type {
  RecoverPasswordRequest,
  SignInRequest,
  SignUpMetadata,
  SignUpRequest,
  UpdatePasswordRequest,
  UpdateProfileRequest,
  UserProfile
} from '@/lib/api/auth/types';
import type { ApiError } from '@/types/api-error';
import content from './content.json';

interface UseAuthMutationOptions {
  onSuccess?: () => void;
  successMessage?: string;
}

export async function signInWithPassword(params: SignInRequest): Promise<void> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password
  });

  // the custom access token hook refuses to mint tokens for blocked users (403)
  if (error?.status === 403) {
    throw {
      message: content.blocked,
      statusCode: 403
    } satisfies ApiError;
  }

  if (error) {
    throw {
      message: error.message,
      statusCode: 401
    } satisfies ApiError;
  }

  // fallback when the hook is not enabled in an environment: blocked users must not
  // enter the app. rls hides a blocked user's own row, so ask the dedicated rpc.
  const isBlocked = await fetchIsCurrentUserBlocked();

  if (isBlocked) {
    await supabase.auth.signOut();
    throw {
      message: content.blocked,
      statusCode: 403
    } satisfies ApiError;
  }
}

export function useSignIn(options?: UseAuthMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signInWithPassword,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.all });
      options?.onSuccess?.();
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    }
  });
}

export async function signOutUser(): Promise<void> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signOut();

  // a session that is already gone is the outcome we wanted, not a failure to report
  if (error && error.name !== 'AuthSessionMissingError') {
    throw {
      message: error.message,
      statusCode: error.status
    } satisfies ApiError;
  }

  clearSupabaseAuthCookies();
}

export function useSignOut(options?: UseAuthMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOutUser,
    onSuccess: () => {
      resetClientState(queryClient);
      options?.onSuccess?.();
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    }
  });
}

export async function signUpWithProfile(params: SignUpRequest): Promise<void> {
  const supabase = createBrowserClient();

  // metadata keys mirror public.users columns so the handle_new_user trigger maps them 1:1;
  // role/is_confirmed/is_blocked are server-enforced by the trigger regardless of these values
  const metadata: SignUpMetadata = {
    role: 'worker',
    username: params.username,
    first_name: params.firstName,
    last_name: params.lastName,
    phone: params.phone || null,
    linkedin: params.linkedin || null,
    upwork: params.upwork || null,
    is_confirmed: false,
    is_blocked: false
  };

  const { error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: metadata
    }
  });

  if (error) {
    throw {
      message: error.message,
      statusCode: error.status
    } satisfies ApiError;
  }
}

export function useSignUp(options?: UseAuthMutationOptions) {
  return useMutation({
    mutationFn: signUpWithProfile,
    onSuccess: () => {
      toast.success(content.signUpSuccess);
      options?.onSuccess?.();
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    }
  });
}

export async function recoverPassword(params: RecoverPasswordRequest): Promise<void> {
  const supabase = createBrowserClient();

  // the customized recovery email template links straight to /auth/confirm with a
  // token_hash; redirectTo is the fallback target when the default template is active
  const { error } = await supabase.auth.resetPasswordForEmail(params.email, {
    redirectTo: `${window.location.origin}/auth/confirm?next=${ROUTES.UPDATE_PASSWORD}`
  });

  if (error) {
    throw {
      message: error.message,
      statusCode: error.status
    } satisfies ApiError;
  }
}

export function useRecoverPassword(options?: UseAuthMutationOptions) {
  return useMutation({
    mutationFn: recoverPassword,
    onSuccess: () => {
      toast.success(content.resetLinkSent);
      options?.onSuccess?.();
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    }
  });
}

export async function updatePassword(params: UpdatePasswordRequest): Promise<void> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.updateUser({
    password: params.password
  });

  if (error) {
    throw {
      message: error.message,
      statusCode: error.status
    } satisfies ApiError;
  }
}

export function useUpdatePassword(options?: UseAuthMutationOptions) {
  return useMutation({
    mutationFn: updatePassword,
    onSuccess: () => {
      toast.success(options?.successMessage ?? content.passwordChanged);
      options?.onSuccess?.();
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    }
  });
}

export async function updateProfile(params: UpdateProfileRequest): Promise<UserProfile> {
  const supabase = createBrowserClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw {
      message: content.sessionExpired,
      statusCode: 401
    } satisfies ApiError;
  }

  const { data, error } = await supabase
    .from('users')
    .update(mapProfileUpdateToUserRow(params))
    .eq('id', userData.user.id)
    .select(USER_COLUMNS)
    .single();

  if (error) {
    throw mapProfileUpdateError(error.code, error.message);
  }

  return mapUserRowToProfile(data);
}

function mapProfileUpdateError(code: string, message: string): ApiError {
  // 23505 is the unique violation on users.username; the raw text leaks the constraint name
  if (code === '23505') {
    return { message: content.usernameTaken, statusCode: 409 };
  }

  // 42501 comes from the privileged-column guard on public.users
  if (code === '42501') {
    return { message: content.forbiddenProfileChange, statusCode: 403 };
  }

  // PGRST116: rls returned no row to update, which for one's own row means the account is blocked
  if (code === 'PGRST116') {
    return { message: content.blocked, statusCode: 403 };
  }

  return { message, statusCode: 500 };
}
