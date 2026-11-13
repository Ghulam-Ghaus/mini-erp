import { zodResolver } from '@hookform/resolvers/zod';
import {
  setupAdminStepSchema,
  setupOrganizationStepSchema,
  type SetupInitializeInput,
} from '@mini-erp/shared';
import {
  AuthScreenLayout,
  Button,
  FileUpload,
  FormField,
  Select,
  StepIndicator,
  SurfaceCard,
  TextArea,
  TextInput,
  useToast,
} from '@mini-erp/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { initializeOrganization } from '../lib/api.js';

type OrgFormValues = z.infer<typeof setupOrganizationStepSchema>;
type AdminFormValues = z.infer<typeof setupAdminStepSchema>;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read logo file'));
    reader.readAsDataURL(file);
  });
}

export interface SetupWizardScreenProps {
  readonly statusBadge?: ReactNode;
  readonly onToggleLanguage: () => void;
  readonly onInitialized: () => void;
}

export function SetupWizardScreen({
  statusBadge,
  onToggleLanguage,
  onInitialized,
}: SetupWizardScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);

  const orgForm = useForm<OrgFormValues>({
    resolver: zodResolver(setupOrganizationStepSchema) as Resolver<OrgFormValues>,
    defaultValues: {
      name: '',
      nameUr: '',
      phone: '',
      address: '',
      email: '',
      taxNo: '',
      currency: 'PKR',
      dateFormat: 'DD/MM/YYYY',
      taxEnabled: false,
      taxName: 'GST',
      defaultTaxRate: '0.00',
      inactivityLockMinutes: 15,
    },
  });

  const adminForm = useForm<AdminFormValues>({
    resolver: zodResolver(setupAdminStepSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      username: 'admin',
      pin: '',
      confirmPin: '',
    },
  });

  const initMutation = useMutation({
    mutationFn: (payload: SetupInitializeInput) => initializeOrganization(payload),
    onSuccess: () => {
      showToast({ title: t('setup.completedToast'), tone: 'success' });
      onInitialized();
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Setup failed',
        tone: 'danger',
      });
    },
  });

  const handleNextFromStep1 = orgForm.handleSubmit(() => {
    setStep(2);
  });

  const handleNextFromStep2 = adminForm.handleSubmit(() => {
    setStep(3);
  });

  const handleFinish = () => {
    const orgValues = orgForm.getValues();
    const adminValues = adminForm.getValues();
    initMutation.mutate({
      organization: {
        ...orgValues,
        logoDataUrl,
      },
      admin: {
        firstName: adminValues.firstName,
        lastName: adminValues.lastName,
        username: adminValues.username,
        pin: adminValues.pin,
      },
    });
  };

  return (
    <AuthScreenLayout
      appName={t('app.name')}
      tagline={t('app.tagline')}
      languageLabel={t('shell.languageToggle')}
      onToggleLanguage={onToggleLanguage}
      statusBadge={statusBadge}
      footerText={t('app.developedBy')}
      maxWidthClass="max-w-2xl"
    >
      <SurfaceCard
        title={t('setup.title')}
        subtitle={t('setup.subtitle')}
        headerAction={
          <StepIndicator
            currentStep={step}
            steps={[
              { id: 1, label: t('setup.step1') },
              { id: 2, label: t('setup.step2') },
              { id: 3, label: t('setup.step3') },
            ]}
          />
        }
      >
        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleNextFromStep1();
            }}
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                label={t('setup.orgName')}
                htmlFor="setup-org-name"
                required
                error={orgForm.formState.errors.name?.message}
              >
                <TextInput
                  id="setup-org-name"
                  hasError={Boolean(orgForm.formState.errors.name)}
                  {...orgForm.register('name')}
                />
              </FormField>

              <FormField
                label={t('setup.orgNameUr')}
                htmlFor="setup-org-name-ur"
                error={orgForm.formState.errors.nameUr?.message}
              >
                <TextInput id="setup-org-name-ur" {...orgForm.register('nameUr')} />
              </FormField>

              <FormField
                label={t('setup.phone')}
                htmlFor="setup-phone"
                error={orgForm.formState.errors.phone?.message}
              >
                <TextInput id="setup-phone" {...orgForm.register('phone')} />
              </FormField>

              <FormField
                label={t('setup.email')}
                htmlFor="setup-email"
                error={orgForm.formState.errors.email?.message}
              >
                <TextInput id="setup-email" type="email" {...orgForm.register('email')} />
              </FormField>

              <FormField
                label={t('setup.taxNo')}
                htmlFor="setup-tax-no"
                error={orgForm.formState.errors.taxNo?.message}
              >
                <TextInput id="setup-tax-no" {...orgForm.register('taxNo')} />
              </FormField>

              <FormField label={t('setup.currency')} htmlFor="setup-currency" required>
                <Select
                  id="setup-currency"
                  options={[
                    { value: 'PKR', label: 'PKR (Pakistani Rupee)' },
                    { value: 'USD', label: 'USD' },
                  ]}
                  {...orgForm.register('currency')}
                />
              </FormField>

              <FormField label={t('setup.dateFormat')} htmlFor="setup-date-format" required>
                <Select
                  id="setup-date-format"
                  options={[
                    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                  ]}
                  {...orgForm.register('dateFormat')}
                />
              </FormField>

              <FormField label={t('setup.logo')} htmlFor="setup-logo">
                <FileUpload
                  id="setup-logo"
                  value={logoFile}
                  previewUrl={logoDataUrl ?? null}
                  chooseLabel={t('setup.chooseLogo')}
                  removeLabel={t('common.delete')}
                  hintLabel={t('setup.logoHint')}
                  onChange={(file) => {
                    setLogoFile(file);
                    if (file) {
                      void readFileAsDataUrl(file).then(setLogoDataUrl);
                    } else {
                      setLogoDataUrl(undefined);
                    }
                  }}
                />
              </FormField>

              <FormField label={t('setup.address')} htmlFor="setup-address" fullWidth>
                <TextArea id="setup-address" rows={2} {...orgForm.register('address')} />
              </FormField>
            </div>

            <div className="mt-5 flex justify-end border-t border-[#e4e2da] pt-3">
              <Button type="submit" variant="primary">
                {t('common.next')}
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleNextFromStep2();
            }}
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                label={t('setup.firstName')}
                htmlFor="setup-first-name"
                required
                error={adminForm.formState.errors.firstName?.message}
              >
                <TextInput
                  id="setup-first-name"
                  hasError={Boolean(adminForm.formState.errors.firstName)}
                  {...adminForm.register('firstName')}
                />
              </FormField>

              <FormField
                label={t('setup.lastName')}
                htmlFor="setup-last-name"
                required
                error={adminForm.formState.errors.lastName?.message}
              >
                <TextInput
                  id="setup-last-name"
                  hasError={Boolean(adminForm.formState.errors.lastName)}
                  {...adminForm.register('lastName')}
                />
              </FormField>

              <FormField
                label={t('setup.username')}
                htmlFor="setup-username"
                required
                fullWidth
                error={adminForm.formState.errors.username?.message}
              >
                <TextInput
                  id="setup-username"
                  hasError={Boolean(adminForm.formState.errors.username)}
                  {...adminForm.register('username')}
                />
              </FormField>

              <FormField
                label={t('setup.pin')}
                htmlFor="setup-pin"
                required
                error={adminForm.formState.errors.pin?.message}
              >
                <TextInput
                  id="setup-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  hasError={Boolean(adminForm.formState.errors.pin)}
                  {...adminForm.register('pin')}
                />
              </FormField>

              <FormField
                label={t('setup.confirmPin')}
                htmlFor="setup-confirm-pin"
                required
                error={adminForm.formState.errors.confirmPin?.message}
              >
                <TextInput
                  id="setup-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  hasError={Boolean(adminForm.formState.errors.confirmPin)}
                  {...adminForm.register('confirmPin')}
                />
              </FormField>
            </div>

            <div className="mt-5 flex justify-between border-t border-[#e4e2da] pt-3">
              <Button variant="secondary" onClick={() => setStep(1)}>
                {t('common.back')}
              </Button>
              <Button type="submit" variant="primary">
                {t('common.next')}
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#1f1e1b]">{t('setup.reviewTitle')}</h3>
              <p className="mt-1 text-xs text-[#5c5a53]">{t('setup.reviewDescription')}</p>
            </div>

            <dl className="grid grid-cols-1 gap-3 rounded border border-[#e4e2da] bg-[#faf9f5] p-3 text-xs md:grid-cols-2">
              <div>
                <dt className="text-[#8c8980]">{t('setup.orgName')}</dt>
                <dd className="font-semibold text-[#1f1e1b]">{orgForm.getValues('name')}</dd>
              </div>
              <div>
                <dt className="text-[#8c8980]">{t('setup.currency')}</dt>
                <dd className="font-semibold text-[#1f1e1b]">
                  {orgForm.getValues('currency')} · {orgForm.getValues('dateFormat')}
                </dd>
              </div>
              <div>
                <dt className="text-[#8c8980]">{t('setup.firstName')}</dt>
                <dd className="font-semibold text-[#1f1e1b]">
                  {adminForm.getValues('firstName')} {adminForm.getValues('lastName')}
                </dd>
              </div>
              <div>
                <dt className="text-[#8c8980]">{t('setup.username')}</dt>
                <dd className="font-semibold text-[#1f1e1b]">{adminForm.getValues('username')}</dd>
              </div>
            </dl>

            <div className="flex justify-between border-t border-[#e4e2da] pt-3">
              <Button
                variant="secondary"
                disabled={initMutation.isPending}
                onClick={() => setStep(2)}
              >
                {t('common.back')}
              </Button>
              <Button variant="primary" disabled={initMutation.isPending} onClick={handleFinish}>
                {t('setup.completeButton')}
              </Button>
            </div>
          </div>
        )}
      </SurfaceCard>
    </AuthScreenLayout>
  );
}
