import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Banner, Button, EmptyState, StatusBadge, useToast } from '@hms/ui';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useIssueCertificateMutation,
  useOpdDoctorsQuery,
  useOpdTemplatesQuery,
  useReferVisitMutation,
  useRequestAdmissionMutation,
} from '../api.js';
import { CERT_TYPES, URGENCIES, WARD_TYPES } from '../consult.js';
import { todayIST } from '../opd.js';

/** Specialty tab: switch the visit to a specialty form (antenatal, paediatrics …). */
export function SpecialtyTab({ form }) {
  const { t } = useTranslation();
  const specialty = useWatch({ control: form.control, name: 'specialty' });
  const templates = useOpdTemplatesQuery({ kind: 'SPECIALTY' });
  const items = templates.data?.items ?? [];
  const set = (value) => form.setValue('specialty', value, { shouldDirty: true });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('opd.consult.specialty.hint')}</p>
      {items.length === 0 && !templates.isFetching ? (
        <EmptyState title={t('opd.consult.specialty.none')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((tpl) => {
            const on = tpl.specialty === specialty;
            return (
              <li
                key={tpl.id}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-semibold text-ink">
                    {t(`opd.consult.specialty.names.${tpl.specialty}`)}
                  </strong>
                  {on && <StatusBadge tone="success" label={t('opd.consult.specialty.inUse')} />}
                </div>
                <p className="text-sm text-muted">
                  {t(`opd.consult.specialty.detail.${tpl.specialty}`)} · {tpl.department}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => set(on ? null : tpl.specialty)}
                >
                  {on
                    ? t('opd.consult.specialty.clear')
                    : t('opd.consult.specialty.use', {
                        name: t(`opd.consult.specialty.names.${tpl.specialty}`),
                      })}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const certSchema = (t) =>
  z
    .object({
      type: z.enum(CERT_TYPES),
      from: z.string().min(1),
      to: z.string().min(1),
      remarks: z.string().max(500).optional(),
    })
    .refine((v) => v.to >= v.from, { path: ['to'], message: t('opd.consult.cert.errors.dates') });

/** Certificates tab: the issued certificate, and "Preview and sign" for a new one. */
export function CertificatesTab({ visitId, certificate, canWrite }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [issue] = useIssueCertificateMutation();
  const today = todayIST();

  return (
    <div className="flex flex-col gap-4">
      {certificate && (
        <Banner tone="success">
          {t('opd.consult.cert.issued', {
            type: t(`opd.consult.cert.types.${certificate.type}`),
            no: certificate.no,
            by: certificate.signedBy,
          })}
          {' · '}
          {fmtDateTime(certificate.signedAt, localeOf(i18n))}
        </Banner>
      )}
      {canWrite && (
        <div>
          <Button onClick={() => setOpen(true)}>{t('opd.consult.cert.sign')}</Button>
        </div>
      )}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('opd.consult.cert.sign')}
        schema={certSchema(t)}
        defaultValues={{ type: 'SICK_LEAVE', from: today, to: today, remarks: '' }}
        fields={[
          {
            name: 'type',
            label: t('opd.consult.cert.type'),
            type: 'select',
            options: CERT_TYPES.map((c) => ({ value: c, label: t(`opd.consult.cert.types.${c}`) })),
          },
          { name: 'from', label: t('opd.consult.cert.from'), type: 'date', required: true },
          { name: 'to', label: t('opd.consult.cert.to'), type: 'date', required: true },
          {
            name: 'remarks',
            label: t('opd.consult.cert.remarks'),
            type: 'textarea',
            optional: true,
            span: 2,
          },
        ]}
        submitLabel={t('opd.consult.cert.sign')}
        onSubmit={(v) => issue({ id: visitId, ...v }).unwrap()}
        onDone={(cert) => toast({ tone: 'success', title: t('opd.consult.cert.signed', cert) })}
      />
    </div>
  );
}

const admitSchema = (t) =>
  z.object({
    wardType: z.enum(WARD_TYPES),
    urgency: z.enum(URGENCIES),
    reason: z.string().trim().min(3, t('opd.consult.admit.errors.reason')),
  });

/** "Request admission": hands the patient to the admission desk (IPD). */
export function AdmitDialog({ open, onOpenChange, visit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [request] = useRequestAdmissionMutation();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('opd.consult.admit.title', { name: visit.patient.name })}
      description={t('opd.consult.admit.hint')}
      schema={admitSchema(t)}
      defaultValues={{ wardType: 'GENERAL', urgency: 'TODAY', reason: '' }}
      fields={[
        {
          name: 'wardType',
          label: t('opd.consult.admit.ward'),
          type: 'select',
          options: WARD_TYPES.map((w) => ({ value: w, label: t(`opd.consult.admit.wards.${w}`) })),
        },
        {
          name: 'urgency',
          label: t('opd.consult.admit.urgency'),
          type: 'select',
          options: URGENCIES.map((u) => ({
            value: u,
            label: t(`opd.consult.admit.urgencies.${u}`),
          })),
        },
        {
          name: 'reason',
          label: t('opd.consult.admit.reason'),
          type: 'textarea',
          required: true,
          span: 2,
        },
      ]}
      submitLabel={t('opd.consult.admit.send')}
      onSubmit={(v) => request({ id: visit.id, ...v }).unwrap()}
      onDone={() =>
        toast({ tone: 'success', title: t('opd.consult.admit.sent', { name: visit.patient.name }) })
      }
    />
  );
}

const referSchema = (t) =>
  z.object({
    doctorId: z.string().min(1, t('opd.consult.refer.errors.doctor')),
    priority: z.enum(['ROUTINE', 'TODAY', 'STAT']),
    note: z.string().trim().min(3, t('opd.consult.refer.errors.note')),
  });

/** "Refer to doctor": a same-day slot with another doctor, with a note they can read. */
export function ReferDialog({ open, onOpenChange, visit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [refer] = useReferVisitMutation();
  const doctors = useOpdDoctorsQuery({}, { skip: !open });
  const options = (doctors.data?.items ?? [])
    .filter((d) => d.id !== visit.doctor?.id)
    .map((d) => ({ value: d.id, label: `${d.name} · ${d.department}` }));
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('opd.consult.refer.title', { name: visit.patient.name })}
      description={t('opd.consult.refer.hint')}
      schema={referSchema(t)}
      defaultValues={{ doctorId: '', priority: 'TODAY', note: '' }}
      fields={[
        {
          name: 'doctorId',
          label: t('opd.consult.refer.doctor'),
          type: 'select',
          placeholder: t('opd.consult.refer.doctorNone'),
          options,
          required: true,
        },
        {
          name: 'priority',
          label: t('opd.consult.refer.priority'),
          type: 'select',
          options: ['ROUTINE', 'TODAY', 'STAT'].map((p) => ({
            value: p,
            label: t(`opd.consult.orders.priorities.${p}`),
          })),
        },
        {
          name: 'note',
          label: t('opd.consult.refer.note'),
          type: 'textarea',
          required: true,
          span: 2,
        },
      ]}
      submitLabel={t('opd.consult.refer.send')}
      onSubmit={(v) => refer({ id: visit.id, ...v }).unwrap()}
      onDone={(r) =>
        toast({
          tone: 'success',
          title: r.slot
            ? t('opd.consult.refer.sentSlot', { doctor: r.doctor.name, slot: r.slot })
            : t('opd.consult.refer.sent', { doctor: r.doctor.name }),
        })
      }
    />
  );
}
