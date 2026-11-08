import { zodResolver } from '@hookform/resolvers/zod';
import {
  updateOrganizationSchema,
  type OrganizationDto,
  type UpdateOrganizationInput,
} from '@mini-erp/shared';
import {
  CheckboxField,
  FileUpload,
  FormField,
  FormLayout,
  NumberInput,
  PageHeader,
  Select,
  SurfaceCard,
  TextArea,
  TextInput,
  useToast,
} from '@mini-erp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { updateOrganization } from '../lib/api.js';

export interface SettingsScreenProps {
  readonly organization: OrganizationDto;
  readonly canEdit: boolean;
  readonly onUpdated: (org: OrganizationDto) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function SettingsScreen({ organization, canEdit, onUpdated }: SettingsScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(
    organization.logoPath ?? undefined,
  );

  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema) as Resolver<UpdateOrganizationInput>,
    defaultValues: {
      name: organization.name,
      nameUr: organization.nameUr ?? '',
      phone: organization.phone ?? '',
      address: organization.address ?? '',
      email: organization.email ?? '',
      taxNo: organization.taxNo ?? '',
      currency: organization.currency,
      dateFormat: organization.dateFormat as 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY',
      taxEnabled: organization.settings.taxEnabled,
      taxName: organization.settings.taxName,
      defaultTaxRate: organization.settings.defaultTaxRate,
      inactivityLockMinutes: organization.settings.inactivityLockMinutes,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateOrganizationInput) => updateOrganization(payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['session'] });
      onUpdated(updated);
      showToast({ title: t('settings.savedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to save settings',
        tone: 'danger',
      });
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    if (!canEdit) return;
    saveMutation.mutate({
      ...values,
      logoDataUrl: logoDataUrl ?? '',
    });
  });

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="p-5">
        <SurfaceCard>
          <FormLayout
            onSubmit={() => void handleSubmit()}
            onCancel={() => form.reset()}
            isSubmitting={saveMutation.isPending || !canEdit}
            labels={{
              save: t('common.save'),
              cancel: t('common.cancel'),
            }}
          >
            <FormField
              label={t('setup.orgName')}
              htmlFor="org-name"
              required
              error={form.formState.errors.name?.message}
            >
              <TextInput
                id="org-name"
                disabled={!canEdit}
                hasError={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
            </FormField>

            <FormField label={t('setup.orgNameUr')} htmlFor="org-name-ur">
              <TextInput id="org-name-ur" disabled={!canEdit} {...form.register('nameUr')} />
            </FormField>

            <FormField label={t('setup.phone')} htmlFor="org-phone">
              <TextInput id="org-phone" disabled={!canEdit} {...form.register('phone')} />
            </FormField>

            <FormField
              label={t('setup.email')}
              htmlFor="org-email"
              error={form.formState.errors.email?.message}
            >
              <TextInput
                id="org-email"
                type="email"
                disabled={!canEdit}
                {...form.register('email')}
              />
            </FormField>

            <FormField label={t('setup.taxNo')} htmlFor="org-tax-no">
              <TextInput id="org-tax-no" disabled={!canEdit} {...form.register('taxNo')} />
            </FormField>

            <FormField label={t('setup.currency')} htmlFor="org-currency" required>
              <Select
                id="org-currency"
                disabled={!canEdit}
                options={[
                  { value: 'PKR', label: 'PKR (Pakistani Rupee)' },
                  { value: 'USD', label: 'USD' },
                ]}
                {...form.register('currency')}
              />
            </FormField>

            <FormField label={t('setup.dateFormat')} htmlFor="org-date-format" required>
              <Select
                id="org-date-format"
                disabled={!canEdit}
                options={[
                  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                ]}
                {...form.register('dateFormat')}
              />
            </FormField>

            <FormField label={t('settings.inactivityLockMinutes')} htmlFor="org-lock-mins" required>
              <TextInput
                id="org-lock-mins"
                type="number"
                min={1}
                max={240}
                disabled={!canEdit}
                {...form.register('inactivityLockMinutes', { valueAsNumber: true })}
              />
            </FormField>

            <div className="md:col-span-2">
              <CheckboxField
                id="org-tax-enabled"
                label={t('settings.taxEnabled')}
                disabled={!canEdit}
                checked={Boolean(form.watch('taxEnabled'))}
                onChange={(checked) => form.setValue('taxEnabled', checked)}
              />
            </div>

            {form.watch('taxEnabled') && (
              <>
                <FormField label={t('settings.taxName')} htmlFor="org-tax-name">
                  <TextInput id="org-tax-name" disabled={!canEdit} {...form.register('taxName')} />
                </FormField>

                <FormField label={t('settings.defaultTaxRate')} htmlFor="org-tax-rate">
                  <NumberInput
                    id="org-tax-rate"
                    precision="percent"
                    suffix="%"
                    disabled={!canEdit}
                    value={form.watch('defaultTaxRate') ?? '0.00'}
                    onChange={(val) => form.setValue('defaultTaxRate', val)}
                  />
                </FormField>
              </>
            )}

            <FormField label={t('setup.logo')} htmlFor="org-logo" fullWidth>
              <FileUpload
                id="org-logo"
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

            <FormField label={t('setup.address')} htmlFor="org-address" fullWidth>
              <TextArea
                id="org-address"
                rows={2}
                disabled={!canEdit}
                {...form.register('address')}
              />
            </FormField>
          </FormLayout>
        </SurfaceCard>
      </div>
    </div>
  );
}
