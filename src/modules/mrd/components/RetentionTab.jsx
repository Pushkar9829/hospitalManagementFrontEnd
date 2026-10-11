import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  Button,
  Card,
  Checkbox,
  DataTable,
  FormField,
  Input,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { useCan } from '../../../lib/useCan.js';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import {
  useDestructionsQuery,
  useLegalHoldMutation,
  useMrdSettingsQuery,
  useProposeDestructionMutation,
  useSaveMrdSettingsMutation,
  useRecordDestroyedMutation,
  useRetentionDueQuery,
} from '../api.js';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const BATCH_TONE = {
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  REJECTED: 'critical',
  DESTROYED: 'neutral',
};

const RETENTION_FIELDS = ['retentionYears', 'mlcRetentionYears', 'fileDueDays'];

/** How long records are kept (state rules differ) and when issued files are due back. */
function RetentionSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const q = useMrdSettingsQuery();
  const [save, state] = useSaveMrdSettingsMutation();
  const [f, setF] = useState(null);
  if (!q.data) return <QueryView query={q} rows={1} />;
  const v = f ?? Object.fromEntries(RETENTION_FIELDS.map((k) => [k, String(q.data[k])]));
  const edit = can('mrd:settings:update');
  return (
    <Card title={t('mrd.ret.settings')} description={t('mrd.ret.settingsHint')}>
      {state.error && <ApiErrorNotice error={state.error} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {RETENTION_FIELDS.map((k) => (
          <FormField key={k} label={t(`mrd.ret.${k}`)}>
            <Input
              inputMode="numeric"
              value={v[k]}
              disabled={!edit}
              onChange={(e) => setF({ ...v, [k]: e.target.value })}
            />
          </FormField>
        ))}
      </div>
      {edit && (
        <Button
          className="mt-3"
          disabled={!f}
          loading={state.isLoading}
          onClick={async () => {
            await save({
              ...Object.fromEntries(RETENTION_FIELDS.map((k) => [k, Number(v[k])])),
              version: q.data.version,
            }).unwrap();
            setF(null);
            toast({ tone: 'success', title: t('mrd.ret.settingsSaved') });
          }}
        >
          {t('mrd.ret.saveSettings')}
        </Button>
      )}
    </Card>
  );
}

/**
 * Records past their retention period: pick the ones to destroy (MLC, held, open or issued files
 * cannot be picked), put a record on legal hold, and record an approved batch as destroyed.
 */
export function RetentionTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const due = useRetentionDueQuery();
  const batches = useDestructionsQuery();
  const [propose] = useProposeDestructionMutation();
  const [hold] = useLegalHoldMutation();
  const [destroyed] = useRecordDestroyedMutation();
  const [picked, setPicked] = useState(new Set());
  const [proposing, setProposing] = useState(false);
  const [holding, setHolding] = useState(null);
  const [recording, setRecording] = useState(null);
  const [pending, setPending] = useState(null);
  const [failure, setFailure] = useState(null);
  const toggle = (id) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  return (
    <div className="flex flex-col gap-4">
      <RetentionSettings />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{t('mrd.ret.hint')}</p>
        <Button disabled={!picked.size} onClick={() => setProposing(true)}>
          {t('mrd.ret.propose', { count: picked.size })}
        </Button>
      </div>
      {pending && <PendingApprovalNotice approvalId={pending} approver={t('mrd.ret.approver')} />}
      <ApiErrorNotice error={failure} />
      <QueryView query={due} rows={4}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('mrd.ret.due')}
              data={d.items}
              empty={t('mrd.ret.none')}
              columns={[
                {
                  id: 'pick',
                  header: '',
                  cell: ({ row }) => (
                    <Checkbox
                      aria-label={t('mrd.ret.pick', { ipNo: row.original.ipNo })}
                      disabled={Boolean(row.original.blockedBy)}
                      checked={picked.has(row.original.id)}
                      onChange={() => toggle(row.original.id)}
                    />
                  ),
                },
                {
                  id: 'ip',
                  header: t('mrd.ret.ipNo'),
                  cell: ({ row }) => <span className="font-mono">{row.original.ipNo}</span>,
                },
                {
                  id: 'patient',
                  header: t('mrd.ret.patient'),
                  cell: ({ row }) =>
                    `${row.original.patient.name} · ${row.original.patient.uhid ?? ''}`,
                },
                {
                  id: 'until',
                  header: t('mrd.ret.until'),
                  cell: ({ row }) => fmtDate(row.original.retainUntil, locale),
                },
                {
                  id: 'block',
                  header: t('mrd.ret.status'),
                  cell: ({ row }) =>
                    row.original.blockedBy ? (
                      <StatusBadge
                        tone={row.original.blockedBy === 'IN_BATCH' ? 'info' : 'warning'}
                        label={t(`mrd.ret.blocked.${row.original.blockedBy}`)}
                      />
                    ) : (
                      <StatusBadge tone="neutral" label={t('mrd.ret.ready')} />
                    ),
                },
                {
                  id: 'hold',
                  header: '',
                  cell: ({ row }) =>
                    row.original.mlc ? null : (
                      <Button size="sm" variant="ghost" onClick={() => setHolding(row.original)}>
                        {row.original.legalHold ? t('mrd.ret.lift') : t('mrd.ret.hold')}
                      </Button>
                    ),
                },
              ]}
            />
          </Card>
        )}
      </QueryView>
      <Card title={t('mrd.ret.batches')} padding={false}>
        <QueryView query={batches} rows={3}>
          {(d) => (
            <DataTable
              caption={t('mrd.ret.batches')}
              data={d.items}
              empty={t('mrd.ret.noBatches')}
              columns={[
                {
                  id: 'no',
                  header: t('mrd.ret.batch'),
                  cell: ({ row }) => <span className="font-mono">{row.original.batchNo}</span>,
                },
                {
                  id: 'count',
                  header: t('mrd.ret.records'),
                  cell: ({ row }) => row.original.items.length,
                },
                {
                  id: 'method',
                  header: t('mrd.ret.method'),
                  cell: ({ row }) => t(`mrd.ret.methods.${row.original.method}`),
                },
                {
                  id: 'status',
                  header: t('mrd.ret.status'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={BATCH_TONE[row.original.status]}
                      label={t(`mrd.ret.batchStatus.${row.original.status}`)}
                    />
                  ),
                },
                {
                  id: 'cert',
                  header: t('mrd.ret.certificate'),
                  cell: ({ row }) =>
                    row.original.destroyedAt
                      ? `${fmtDate(row.original.destroyedAt, locale)} · ${row.original.certificateNo ?? ''} · ${row.original.witness}`
                      : '',
                },
                {
                  id: 'act',
                  header: '',
                  cell: ({ row }) =>
                    row.original.status === 'APPROVED' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRecording(row.original)}
                      >
                        {t('mrd.ret.recordDestroyed')}
                      </Button>
                    ) : null,
                },
              ]}
            />
          )}
        </QueryView>
      </Card>
      <FormDialog
        open={proposing}
        onOpenChange={setProposing}
        title={t('mrd.ret.proposeTitle', { count: picked.size })}
        description={t('mrd.ret.proposeHint')}
        schema={z.object({
          method: z.enum(['SHREDDING', 'INCINERATION', 'PULPING']),
          reason: z.string().trim().min(5).max(300),
        })}
        defaultValues={{ method: 'SHREDDING', reason: t('mrd.ret.defaultReason') }}
        fields={[
          {
            name: 'method',
            label: t('mrd.ret.method'),
            type: 'select',
            options: ['SHREDDING', 'INCINERATION', 'PULPING'].map((m) => ({
              value: m,
              label: t(`mrd.ret.methods.${m}`),
            })),
          },
          { name: 'reason', label: t('mrd.ret.reason'), required: true },
        ]}
        submitLabel={t('mrd.ret.send')}
        onSubmit={(v) => propose({ recordIds: [...picked], ...v }).unwrap()}
        onDone={(b) => {
          setPicked(new Set());
          setFailure(null);
          if (b.approvalId) setPending(b.approvalId);
          toast({ tone: 'info', title: t('mrd.ret.sent', { batchNo: b.batchNo }) });
        }}
      />
      <FormDialog
        open={Boolean(holding)}
        onOpenChange={(o) => !o && setHolding(null)}
        title={
          holding
            ? t(holding.legalHold ? 'mrd.ret.liftTitle' : 'mrd.ret.holdTitle', {
                ipNo: holding.ipNo,
              })
            : ''
        }
        schema={z.object({ reason: z.string().trim().min(5).max(300) })}
        defaultValues={{ reason: '' }}
        fields={[{ name: 'reason', label: t('mrd.ret.holdReason'), required: true }]}
        submitLabel={holding?.legalHold ? t('mrd.ret.lift') : t('mrd.ret.hold')}
        onSubmit={(v) =>
          hold({ id: holding.id, on: !holding.legalHold, reason: v.reason }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('mrd.ret.holdSaved') })}
      />
      <FormDialog
        open={Boolean(recording)}
        onOpenChange={(o) => !o && setRecording(null)}
        title={recording ? t('mrd.ret.destroyedTitle', { batchNo: recording.batchNo }) : ''}
        schema={z.object({
          destroyedOn: z.string().min(10),
          witness: z.string().trim().min(3).max(120),
          vendor: z.string().max(120).optional(),
          certificateNo: z.string().max(60).optional(),
        })}
        defaultValues={{ destroyedOn: istToday(), witness: '', vendor: '', certificateNo: '' }}
        fields={[
          { name: 'destroyedOn', label: t('mrd.ret.destroyedOn'), type: 'date' },
          { name: 'witness', label: t('mrd.ret.witness'), required: true },
          { name: 'vendor', label: t('mrd.ret.vendor'), optional: true },
          { name: 'certificateNo', label: t('mrd.ret.certificate'), optional: true, mono: true },
        ]}
        submitLabel={t('mrd.ret.recordDestroyed')}
        onSubmit={(v) =>
          destroyed({
            id: recording.id,
            version: recording.version,
            destroyedOn: v.destroyedOn,
            witness: v.witness,
            ...(v.vendor ? { vendor: v.vendor } : {}),
            ...(v.certificateNo ? { certificateNo: v.certificateNo } : {}),
          }).unwrap()
        }
        onDone={(r) =>
          toast({
            tone: 'success',
            title: r.skipped?.length
              ? t('mrd.ret.destroyedSkipped', { list: r.skipped.join(', ') })
              : t('mrd.ret.destroyedDone'),
          })
        }
      />
    </div>
  );
}
