import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, DataTable, StatusBadge, useToast } from '@hms/ui';
import { useCan } from '../../../lib/useCan.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import {
  usePatientConsentsQuery,
  useRecordConsentMutation,
  useWithdrawConsentMutation,
} from '../api.js';

const TYPES = [
  'TREATMENT',
  'ADMISSION',
  'PROCEDURE',
  'ANAESTHESIA',
  'BLOOD_TRANSFUSION',
  'HIV_TEST',
  'ABHA_LINKING',
  'DATA_SHARING',
  'RESEARCH',
  'SMS',
  'WHATSAPP',
  'MARKETING',
];
const CHANNELS = ['TABLET_SIGNATURE', 'PAPER', 'OTP', 'REGISTRATION_FORM', 'VERBAL_WITNESSED'];
const TONE = { ACTIVE: 'success', EXPIRED: 'warning', WITHDRAWN: 'neutral' };

/** A patient's consents (board Patient profile, "Consents"): record, see validity, withdraw. */
export function ConsentsTab({ patientId }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const edit = can('patients:patient:update');
  const q = usePatientConsentsQuery(patientId);
  const [record] = useRecordConsentMutation();
  const [withdraw] = useWithdrawConsentMutation();
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{t('patients.consents.hint')}</p>
        {edit && <Button onClick={() => setAdding(true)}>{t('patients.consents.record')}</Button>}
      </div>
      <QueryView query={q} rows={3}>
        {(d) => (
          <DataTable
            caption={t('patients.consents.tab')}
            data={d.items}
            empty={t('patients.consents.none')}
            columns={[
              {
                id: 'type',
                header: t('patients.consents.type'),
                cell: ({ row }) => t(`patients.consents.types.${row.original.type}`),
              },
              {
                id: 'given',
                header: t('patients.consents.given'),
                cell: ({ row }) => fmtDate(row.original.givenAt, locale),
              },
              {
                id: 'channel',
                header: t('patients.consents.channel'),
                cell: ({ row }) => t(`patients.consents.channels.${row.original.channel}`),
              },
              {
                id: 'valid',
                header: t('patients.consents.validUntil'),
                cell: ({ row }) =>
                  row.original.validUntil
                    ? fmtDate(row.original.validUntil, locale)
                    : t('patients.consents.untilWithdrawn'),
              },
              {
                id: 'scope',
                header: t('patients.consents.scope'),
                cell: ({ row }) => row.original.scope ?? '',
              },
              {
                id: 'status',
                header: t('common.status'),
                cell: ({ row }) => (
                  <StatusBadge
                    tone={TONE[row.original.status]}
                    label={t(`patients.consents.status.${row.original.status}`)}
                  />
                ),
              },
              edit && {
                id: 'act',
                header: '',
                cell: ({ row }) =>
                  row.original.status === 'ACTIVE' ? (
                    <Button size="sm" variant="ghost" onClick={() => setLeaving(row.original)}>
                      {t('patients.consents.withdraw')}
                    </Button>
                  ) : null,
              },
            ].filter(Boolean)}
          />
        )}
      </QueryView>
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('patients.consents.recordTitle')}
        schema={z.object({
          type: z.enum(TYPES),
          channel: z.enum(CHANNELS),
          validUntil: z.string().optional(),
          scope: z.string().max(200).optional(),
          givenBy: z.string().max(120).optional(),
          witness: z.string().max(120).optional(),
        })}
        defaultValues={{
          type: 'TREATMENT',
          channel: 'TABLET_SIGNATURE',
          validUntil: '',
          scope: '',
          givenBy: '',
          witness: '',
        }}
        fields={[
          {
            name: 'type',
            label: t('patients.consents.type'),
            type: 'select',
            options: TYPES.map((v) => ({ value: v, label: t(`patients.consents.types.${v}`) })),
          },
          {
            name: 'channel',
            label: t('patients.consents.channel'),
            type: 'select',
            options: CHANNELS.map((v) => ({
              value: v,
              label: t(`patients.consents.channels.${v}`),
            })),
          },
          {
            name: 'validUntil',
            label: t('patients.consents.validUntil'),
            type: 'date',
            optional: true,
          },
          { name: 'scope', label: t('patients.consents.scope'), optional: true },
          { name: 'givenBy', label: t('patients.consents.givenBy'), optional: true },
          { name: 'witness', label: t('patients.consents.witness'), optional: true },
        ]}
        submitLabel={t('patients.consents.record')}
        onSubmit={(v) =>
          record({
            patientId,
            type: v.type,
            channel: v.channel,
            validUntil: v.validUntil || undefined,
            scope: v.scope || undefined,
            givenBy: v.givenBy || undefined,
            witness: v.witness || undefined,
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('patients.consents.recorded') })}
      />
      <FormDialog
        open={Boolean(leaving)}
        onOpenChange={(o) => !o && setLeaving(null)}
        title={t('patients.consents.withdrawTitle')}
        description={leaving ? t(`patients.consents.types.${leaving.type}`) : ''}
        destructive
        schema={z.object({ reason: z.string().trim().min(3).max(300) })}
        defaultValues={{ reason: '' }}
        fields={[
          {
            name: 'reason',
            label: t('patients.consents.reason'),
            type: 'textarea',
            required: true,
          },
        ]}
        submitLabel={t('patients.consents.withdraw')}
        onSubmit={(v) =>
          withdraw({
            patientId,
            id: leaving.id,
            version: leaving.version,
            reason: v.reason,
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('patients.consents.withdrawn') })}
      />
    </div>
  );
}
