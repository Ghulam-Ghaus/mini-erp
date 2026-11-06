import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, verifyPinSchema, type AuthSessionResponse } from '@mini-erp/shared';
import {
  AuthScreenLayout,
  Button,
  FormField,
  SurfaceCard,
  TextInput,
  useToast,
} from '@mini-erp/ui';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { loginWithPin, verifyCurrentPin } from '../lib/api.js';

type LoginFormValues = z.infer<typeof loginSchema>;
type UnlockFormValues = z.infer<typeof verifyPinSchema>;

export interface LoginScreenProps {
  readonly statusBadge?: ReactNode;
  readonly onToggleLanguage: () => void;
  readonly onLoggedIn: (session: AuthSessionResponse) => void;
}

export function LoginScreen({ statusBadge, onToggleLanguage, onLoggedIn }: LoginScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: 'admin',
      pin: '',
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginWithPin,
    onSuccess: (session) => {
      showToast({
        title: t('auth.welcomeToast', {
          name: `${session.user.firstName} ${session.user.lastName}`,
        }),
        tone: 'success',
      });
      onLoggedIn(session);
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Login failed',
        tone: 'danger',
      });
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    loginMutation.mutate(values);
  });

  return (
    <AuthScreenLayout
      appName={t('app.name')}
      tagline={t('app.tagline')}
      languageLabel={t('shell.languageToggle')}
      onToggleLanguage={onToggleLanguage}
      statusBadge={statusBadge}
      maxWidthClass="max-w-sm"
    >
      <SurfaceCard title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          <FormField
            label={t('auth.username')}
            htmlFor="login-username"
            required
            error={form.formState.errors.username?.message}
          >
            <TextInput
              id="login-username"
              autoFocus
              hasError={Boolean(form.formState.errors.username)}
              {...form.register('username')}
            />
          </FormField>

          <FormField
            label={t('auth.pin')}
            htmlFor="login-pin"
            required
            error={form.formState.errors.pin?.message}
          >
            <TextInput
              id="login-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              hasError={Boolean(form.formState.errors.pin)}
              {...form.register('pin')}
            />
          </FormField>

          <Button
            type="submit"
            variant="primary"
            disabled={loginMutation.isPending}
            className="w-full"
          >
            {t('auth.signInButton')}
          </Button>
        </form>
      </SurfaceCard>
    </AuthScreenLayout>
  );
}

export interface LockScreenProps {
  readonly username: string;
  readonly statusBadge?: ReactNode;
  readonly onToggleLanguage: () => void;
  readonly onUnlocked: () => void;
  readonly onLogout: () => void;
}

export function LockScreen({
  username,
  statusBadge,
  onToggleLanguage,
  onUnlocked,
  onLogout,
}: LockScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const form = useForm<UnlockFormValues>({
    resolver: zodResolver(verifyPinSchema),
    defaultValues: { pin: '' },
  });

  const unlockMutation = useMutation({
    mutationFn: verifyCurrentPin,
    onSuccess: () => {
      form.reset();
      onUnlocked();
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Incorrect PIN',
        tone: 'danger',
      });
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    unlockMutation.mutate(values);
  });

  return (
    <AuthScreenLayout
      appName={t('app.name')}
      tagline={t('app.tagline')}
      languageLabel={t('shell.languageToggle')}
      onToggleLanguage={onToggleLanguage}
      statusBadge={statusBadge}
      maxWidthClass="max-w-sm"
    >
      <SurfaceCard title={t('auth.lockTitle')} subtitle={t('auth.lockSubtitle', { username })}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          <FormField
            label={t('auth.pin')}
            htmlFor="unlock-pin"
            required
            error={form.formState.errors.pin?.message}
          >
            <TextInput
              id="unlock-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              hasError={Boolean(form.formState.errors.pin)}
              {...form.register('pin')}
            />
          </FormField>

          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={unlockMutation.isPending}
              className="w-full"
            >
              {t('auth.unlockButton')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="w-full">
              {t('auth.switchUser')}
            </Button>
          </div>
        </form>
      </SurfaceCard>
    </AuthScreenLayout>
  );
}
