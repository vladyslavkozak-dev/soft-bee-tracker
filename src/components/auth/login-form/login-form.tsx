'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { ArrowRightIcon, Loader2Icon, MailIcon } from 'lucide-react';

import { FormField } from '@components/common/form/form-field';
import { IconInput } from '@components/common/form/icon-input';
import { PasswordInput } from '@components/common/form/password-input';
import { Button } from '@ui/button';
import { ROUTES } from '@/constants';
import { useSignIn } from '@/lib/api/auth';
import { loginFormSchema, type LoginFormValues } from '@/lib/schemas/login-form.schema';
import content from './content.json';

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const signIn = useSignIn({
    onSuccess: () => {
      router.push(redirectTo);
      router.refresh();
    }
  });

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: '',
      password: ''
    },
    resolver: zodResolver(loginFormSchema)
  });

  function handleLoginSubmit(values: LoginFormValues) {
    signIn.mutate(values);
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    void handleSubmit(handleLoginSubmit)(event);
  }

  const isBusy = isSubmitting || signIn.isPending;

  return (
    <form className='flex flex-col gap-5' onSubmit={handleFormSubmit} noValidate>
      <FormField label={content.emailLabel} htmlFor='email' error={errors.email}>
        <IconInput
          id='email'
          icon={MailIcon}
          type='email'
          autoComplete='email'
          placeholder={content.emailPlaceholder}
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </FormField>

      <FormField label={content.passwordLabel} htmlFor='password' error={errors.password}>
        <PasswordInput
          id='password'
          autoComplete='current-password'
          placeholder={content.passwordPlaceholder}
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </FormField>

      <Button className='w-full' size='xl' disabled={isBusy} type='submit'>
        {isBusy ? <Loader2Icon data-icon='inline-start' className='animate-spin' /> : null}
        {content.submitButton}
        {isBusy ? null : <ArrowRightIcon data-icon='inline-end' />}
      </Button>

      <div className='flex flex-col gap-2 text-center text-sm'>
        <Link
          className='text-muted-foreground hover:text-foreground underline-offset-4 transition-colors hover:underline'
          href={ROUTES.FORGOT_PASSWORD}
        >
          {content.forgotPasswordLink}
        </Link>
      </div>
    </form>
  );
}

interface LoginFormProps {
  // already validated by getSafeRedirectPath on the server
  redirectTo: string;
}
