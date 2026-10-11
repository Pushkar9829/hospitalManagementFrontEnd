import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { applyFieldErrors, cleanResolver } from '../../../lib/forms.js';
import { parseRupees, rupeesText } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { useIpdSettingsQuery, useSaveIpdSettingsMutation } from '../api.js';
import { CATEGORIES } from '../ipd.js';

const int = (min, max) =>
  z.coerce
    .number({ error: 'ipd.cfg.errors.number' })
    .int('ipd.cfg.errors.number')
    .min(min, 'ipd.cfg.errors.range')
    .max(max, 'ipd.cfg.errors.range');
const money = z
  .string()
  .optional()
  .refine((v) => !v || Number.isFinite(parseRupees(v)), 'ipd.cfg.errors.money');

const schema = z.object({
  deposits: z.object(Object.fromEntries(CATEGORIES.map((c) => [c, money]))),
  depositAlertPct: int(10, 100),
  topUpPct: int(50, 200),
  emergencyDepositHours: int(1, 72),
  roomRentMethod: z.enum(['MIDNIGHT', 'HOURS_24']),
  icuFullDayHours: int(1, 24),
  enhancementPct: int(50, 100),
  reservationHoldMin: int(15, 1440),
  targets: z.object({
    dischargeMin: int(30, 1440),
    billMin: int(10, 600),
    cleaningMin: int(10, 600),
    isolationCleaningMin: int(10, 600),
  }),
  visitingHours: z.string().max(60).optional(),
});

const toForm = (s) => ({
  ...s,
  deposits: Object.fromEntries(CATEGORIES.map((c) => [c, rupeesText(s.deposits?.[c])])),
  targets: { ...s.targets },
  visitingHours: s.visitingHours ?? '',
});

/** A number with its unit after it; the error key comes from the schema. */
function Num({ form, name, unit, hint }) {
  const { t } = useTranslation();
  const error = name.split('.').reduce((e, k) => e?.[k], form.formState.errors)?.message;
  return (
    <FormField label={t(`ipd.cfg.f.${name}`)} hint={hint} error={error ? t(error) : undefined}>
      <div className="flex items-center gap-2">
        <Input type="number" inputMode="numeric" className="max-w-32" {...form.register(name)} />
        {unit && <span className="text-sm text-muted">{t(`ipd.cfg.units.${unit}`)}</span>}
      </div>
    </FormField>
  );
}

function SettingsForm({ settings, canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [save, state] = useSaveIpdSettingsMutation();
  const [failure, setFailure] = useState(null);
  const form = useForm({
    resolver: cleanResolver(schema),
    defaultValues: toForm(settings),
    mode: 'onBlur',
  });
  const onSubmit = form.handleSubmit(async (v) => {
    setFailure(null);
    const deposits = Object.fromEntries(
      Object.entries(v.deposits ?? {})
        .filter(([, r]) => r)
        .map(([c, r]) => [c, parseRupees(r)]),
    );
    try {
      const saved = await save({ ...v, deposits }).unwrap();
      form.reset(toForm(saved));
      toast({ tone: 'success', title: t('ipd.cfg.saved') });
    } catch (e) {
      setFailure(applyFieldErrors(e, form.setError, Object.keys(form.getValues())));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {!canEdit && <Banner tone="info">{t('ipd.cfg.readOnly')}</Banner>}
      <ApiErrorNotice error={failure} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Card title={t('ipd.cfg.depositsTitle')} description={t('ipd.cfg.depositsHint')}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {CATEGORIES.map((c) => {
              const error = form.formState.errors.deposits?.[c]?.message;
              return (
                <FormField
                  key={c}
                  label={t(`ipd.category.${c}`)}
                  error={error ? t(error) : undefined}
                >
                  <Input inputMode="decimal" placeholder="0" {...form.register(`deposits.${c}`)} />
                </FormField>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Num form={form} name="depositAlertPct" unit="pctUsed" />
            <Num form={form} name="topUpPct" unit="pct" />
            <Num form={form} name="emergencyDepositHours" unit="hours" />
          </div>
        </Card>
        <Card title={t('ipd.cfg.roomTitle')} description={t('ipd.cfg.roomHint')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormField label={t('ipd.cfg.f.roomRentMethod')}>
              <Select
                options={['MIDNIGHT', 'HOURS_24'].map((m) => ({
                  value: m,
                  label: t(`ipd.cfg.rent.${m}`),
                }))}
                {...form.register('roomRentMethod')}
              />
            </FormField>
            <Num form={form} name="icuFullDayHours" unit="hours" />
            <Num form={form} name="reservationHoldMin" unit="minutes" />
            <Num
              form={form}
              name="enhancementPct"
              unit="pctApproval"
              hint={t('ipd.cfg.enhancementHint')}
            />
            <FormField label={t('ipd.cfg.f.visitingHours')} className="md:col-span-2">
              <Input maxLength={60} {...form.register('visitingHours')} />
            </FormField>
          </div>
        </Card>
        <Card title={t('ipd.cfg.targetsTitle')} description={t('ipd.cfg.targetsHint')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Num form={form} name="targets.dischargeMin" unit="minutes" />
            <Num form={form} name="targets.billMin" unit="minutes" />
            <Num form={form} name="targets.cleaningMin" unit="minutes" />
            <Num form={form} name="targets.isolationCleaningMin" unit="minutes" />
          </div>
        </Card>
      </fieldset>
      {canEdit && (
        <div>
          <Button type="submit" loading={state.isLoading} disabled={!form.formState.isDirty}>
            {t('ipd.cfg.save')}
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * IPD settings (board IpdConfig, route /settings/ipd): deposits by bed category, the deposit
 * alert and top-up, room rent counting, the enhancement trigger (rule R9), bed hold and the
 * turnaround targets (PUT /ipd/settings). Wards, beds and packages are kept in hospital setup.
 */
export default function IpdSettingsPage() {
  useStrings(addDxkitStrings, addIpdStrings);
  const { t } = useTranslation();
  const can = useCan();
  const q = useIpdSettingsQuery();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.cfg.crumb') }, { label: t('ipd.cfg.title') }]}
        title={t('ipd.cfg.title')}
        description={t('ipd.cfg.description')}
        actions={
          <Link
            className="text-sm font-semibold text-primary underline"
            to="/settings/masters?tab=wards"
          >
            {t('ipd.cfg.wardsLink')}
          </Link>
        }
      />
      <QueryView query={q} rows={8}>
        {(s) => <SettingsForm key={s.version} settings={s} canEdit={can('ipd:settings:update')} />}
      </QueryView>
    </Page>
  );
}
