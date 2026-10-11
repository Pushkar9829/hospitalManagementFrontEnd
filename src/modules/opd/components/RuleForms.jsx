import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, Card, FormField, Input, Select, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { CheckboxList } from '../../../components/CheckboxList.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { applyFieldErrors, cleanResolver } from '../../../lib/forms.js';
import { useOpdDepartmentsQuery, useSaveOpdSettingsMutation } from '../api.js';
import { approvalIdOf } from '../opdSettings.js';

const int = (min, max) =>
  z.coerce
    .number({ error: 'opd.cfg.errors.number' })
    .int('opd.cfg.errors.number')
    .min(min, 'opd.cfg.errors.range')
    .max(max, 'opd.cfg.errors.range');

const bookingSchema = z.object({
  bookAheadDays: int(1, 180),
  latestBeforeMin: int(0, 1440),
  holdMin: int(1, 30),
  maxFuturePerDoctor: int(1, 10),
  walkInEvery: int(1, 10),
  lateGraceMin: int(0, 60),
  prepayOnline: z.enum(['OPTIONAL', 'REQUIRED', 'OFF']),
  triageRequired: z.array(z.string()),
});

const cancellationSchema = z.object({
  freeUntilHours: int(0, 72),
  keepPercent: int(0, 100),
  noShowAfterMin: int(5, 240),
  noShowRefund: z.enum(['CREDIT', 'REFUND', 'NONE']),
  prepayAfterNoShows: int(1, 10),
  prepayWindowDays: int(7, 365),
  hospitalChange: z.enum(['FULL_REFUND_OR_FREE_RESCHEDULE', 'FREE_RESCHEDULE']),
});

/** A number field with a unit after it ("30 days"), its error under it. */
function NumberField({ form, name, unit, hint }) {
  const { t } = useTranslation();
  const error = form.formState.errors[name]?.message;
  return (
    <FormField label={t(`opd.cfg.rules.${name}`)} hint={hint} error={error ? t(error) : undefined}>
      <div className="flex items-center gap-2">
        <Input type="number" inputMode="numeric" className="max-w-32" {...form.register(name)} />
        {unit && <span className="text-sm text-muted">{t(`opd.cfg.units.${unit}`)}</span>}
      </div>
    </FormField>
  );
}

function EnumField({ form, name, values }) {
  const { t } = useTranslation();
  return (
    <FormField label={t(`opd.cfg.rules.${name}`)}>
      <Select
        options={values.map((v) => ({ value: v, label: t(`opd.cfg.rules.values.${v}`) }))}
        {...form.register(name)}
      />
    </FormField>
  );
}

/** Saves one section of PUT /opd/settings; a 202 shows the approval notice. */
function useSection(section, form) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [save] = useSaveOpdSettingsMutation();
  const [failure, setFailure] = useState(null);
  const [approvalId, setApprovalId] = useState(null);
  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const r = await save({ [section]: values }).unwrap();
      const id = approvalIdOf(r);
      setApprovalId(id);
      toast({ tone: 'success', title: t(id ? 'opd.cfg.savedPending' : 'opd.cfg.saved') });
    } catch (e) {
      setFailure(applyFieldErrors(e, form.setError, Object.keys(form.getValues())));
    }
  });
  return { onSubmit, failure, approvalId };
}

/** Booking rules: how far ahead, holds, walk-in mixing, late grace, prepay, triage (R2 to R6, R12). */
export function BookingRulesForm({ settings, canEdit }) {
  const { t } = useTranslation();
  const departments = useOpdDepartmentsQuery();
  const form = useForm({
    resolver: cleanResolver(bookingSchema),
    defaultValues: settings.booking,
    mode: 'onBlur',
  });
  const { onSubmit, failure } = useSection('booking', form);
  return (
    <Card title={t('opd.cfg.tabs.booking')} description={t('opd.cfg.rules.bookingHint')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ApiErrorNotice error={failure} />
        <fieldset
          disabled={!canEdit}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <NumberField form={form} name="bookAheadDays" unit="days" />
          <NumberField form={form} name="latestBeforeMin" unit="minBefore" />
          <NumberField form={form} name="holdMin" unit="minutes" />
          <NumberField form={form} name="maxFuturePerDoctor" />
          <NumberField
            form={form}
            name="walkInEvery"
            unit="booked"
            hint={t('opd.cfg.rules.walkInHint')}
          />
          <NumberField form={form} name="lateGraceMin" unit="minutes" />
          <EnumField form={form} name="prepayOnline" values={['OPTIONAL', 'REQUIRED', 'OFF']} />
          <Controller
            control={form.control}
            name="triageRequired"
            render={({ field }) => (
              <CheckboxList
                className="md:col-span-2 xl:col-span-3"
                legend={t('opd.cfg.rules.triageRequired')}
                hint={t('opd.cfg.rules.triageHint')}
                columns={3}
                options={(departments.data?.items ?? []).map((d) => ({
                  value: d.name,
                  label: d.name,
                }))}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </fieldset>
        {canEdit && (
          <div className="border-t border-line pt-4">
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('opd.cfg.save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

/** Cancellation, no-show and refunds (R7 to R9). Saved as a request for Super Admin approval. */
export function CancellationForm({ settings, canEdit }) {
  const { t } = useTranslation();
  const form = useForm({
    resolver: cleanResolver(cancellationSchema),
    defaultValues: settings.cancellation,
    mode: 'onBlur',
  });
  const { onSubmit, failure, approvalId } = useSection('cancellation', form);
  const pending = settings.pending?.section === 'cancellation' ? settings.pending : null;
  return (
    <Card title={t('opd.cfg.tabs.cancellation')} description={t('opd.cfg.rules.cancellationHint')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {(approvalId || pending) && (
          <PendingApprovalNotice approvalId={approvalId ?? pending.approvalId} />
        )}
        <ApiErrorNotice error={failure} />
        <fieldset
          disabled={!canEdit}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <NumberField form={form} name="freeUntilHours" unit="hoursBefore" />
          <NumberField form={form} name="keepPercent" unit="percent" />
          <NumberField form={form} name="noShowAfterMin" unit="minAfter" />
          <EnumField form={form} name="noShowRefund" values={['CREDIT', 'REFUND', 'NONE']} />
          <NumberField form={form} name="prepayAfterNoShows" unit="noShows" />
          <NumberField form={form} name="prepayWindowDays" unit="days" />
          <EnumField
            form={form}
            name="hospitalChange"
            values={['FULL_REFUND_OR_FREE_RESCHEDULE', 'FREE_RESCHEDULE']}
          />
        </fieldset>
        {canEdit && (
          <div className="border-t border-line pt-4">
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('opd.cfg.saveApproval')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
