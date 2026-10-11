import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addAdminStrings } from '@hms/i18n/admin';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  IconButton,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inr } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useAdmissionQuery,
  useAdmissionsQuery,
  useAdviseDischargeMutation,
  useDischargeMutation,
  useSaveSummaryMutation,
  useSignSummaryMutation,
  useSummaryAddendumMutation,
} from '../api.js';
import { STAY_TONE } from '../ipd.js';
import { StayHeader } from '../components/StayHeader.jsx';

const OUTCOMES = ['NORMAL', 'LAMA', 'DEATH', 'ABSCONDED', 'REFERRED'];

/** Rows editor for diagnoses or medicines. */
function Rows({ label, rows, onChange, fields, addLabel, disabled }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          {fields.map(([k, l, w]) => (
            <FormField key={k} label={l} className={w}>
              <Input
                value={r[k] ?? ''}
                onChange={(e) =>
                  onChange(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                }
              />
            </FormField>
          ))}
          <IconButton
            size="sm"
            label={t('ipd.dis.removeRow')}
            icon={<X size={16} aria-hidden="true" />}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <div>
        <Button size="sm" variant="ghost" onClick={() => onChange([...rows, {}])}>
          <Plus size={14} aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}

function SummaryEditor({ stay }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const s = stay.summary ?? {};
  const signed = s.status === 'SIGNED';
  const [form, setForm] = useState({
    diagnoses: s.diagnoses ?? [],
    procedures: (s.procedures ?? []).join('\n'),
    course: s.course ?? '',
    condition: s.condition ?? '',
    medicines: s.medicines ?? [],
    followUpDate: s.followUp?.date ?? '',
    followUpNote: s.followUp?.note ?? '',
    advice: s.advice ?? '',
  });
  const [failure, setFailure] = useState(null);
  const [addendum, setAddendum] = useState('');
  const [save, saving] = useSaveSummaryMutation();
  const [sign, signing] = useSignSummaryMutation();
  const [addAddendum] = useSummaryAddendumMutation();
  const body = () => ({
    diagnoses: form.diagnoses.filter((d) => d.code && d.name),
    procedures: form.procedures
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
    course: form.course,
    condition: form.condition,
    medicines: form.medicines
      .filter((m) => m.name)
      .map((m) => ({ ...m, days: m.days ? Number(m.days) : undefined })),
    followUp: { date: form.followUpDate, note: form.followUpNote },
    advice: form.advice,
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card
      title={t('ipd.dis.summaryTitle', { ipNo: stay.ipNo })}
      actions={
        <StatusBadge
          tone={signed ? 'success' : 'warning'}
          label={signed ? t('ipd.dis.signedBy', { by: s.signedBy }) : t('ipd.dis.unsigned')}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <ApiErrorNotice error={failure} />
        <Rows
          label={t('ipd.dis.diagnoses')}
          rows={form.diagnoses}
          onChange={set('diagnoses')}
          disabled={signed}
          addLabel={t('ipd.dis.addDiagnosis')}
          fields={[
            ['code', t('ipd.dis.icd'), 'w-28'],
            ['name', t('ipd.dis.diagnosis'), 'min-w-64 flex-1'],
          ]}
        />
        <fieldset disabled={signed} className="flex flex-col gap-4">
          <FormField label={t('ipd.dis.procedures')} hint={t('ipd.dis.oneLine')}>
            <Textarea
              rows={2}
              value={form.procedures}
              onChange={(e) => set('procedures')(e.target.value)}
            />
          </FormField>
          <FormField label={t('ipd.dis.course')}>
            <Textarea
              rows={4}
              value={form.course}
              onChange={(e) => set('course')(e.target.value)}
            />
          </FormField>
          <FormField label={t('ipd.dis.condition')}>
            <Input value={form.condition} onChange={(e) => set('condition')(e.target.value)} />
          </FormField>
        </fieldset>
        <Rows
          label={t('ipd.dis.medicines')}
          rows={form.medicines}
          onChange={set('medicines')}
          disabled={signed}
          addLabel={t('ipd.dis.addMedicine')}
          fields={[
            ['name', t('ipd.dis.medicine'), 'min-w-56 flex-1'],
            ['dose', t('ipd.orders.dose'), 'w-28'],
            ['frequency', t('ipd.orders.frequency'), 'w-32'],
            ['days', t('ipd.orders.days'), 'w-20'],
          ]}
        />
        <fieldset disabled={signed} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label={t('ipd.dis.followUpDate')} optional>
            <Input
              type="date"
              value={form.followUpDate}
              onChange={(e) => set('followUpDate')(e.target.value)}
            />
          </FormField>
          <FormField label={t('ipd.dis.followUpNote')} className="md:col-span-2" optional>
            <Input
              value={form.followUpNote}
              onChange={(e) => set('followUpNote')(e.target.value)}
            />
          </FormField>
          <FormField label={t('ipd.dis.advice')} className="md:col-span-3" optional>
            <Textarea
              rows={2}
              value={form.advice}
              onChange={(e) => set('advice')(e.target.value)}
            />
          </FormField>
        </fieldset>
        {!signed ? (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button
              variant="secondary"
              loading={saving.isLoading}
              onClick={async () => {
                setFailure(null);
                try {
                  await save({ id: stay.id, ...body() }).unwrap();
                  toast({ tone: 'success', title: t('ipd.dis.draftSaved') });
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('ipd.dis.saveDraft')}
            </Button>
            {can('ipd:discharge:sign') && (
              <Button
                loading={signing.isLoading}
                onClick={async () => {
                  setFailure(null);
                  try {
                    await save({ id: stay.id, ...body() }).unwrap();
                    await sign({ id: stay.id }).unwrap();
                    toast({ tone: 'success', title: t('ipd.dis.signed') });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('ipd.dis.sign')}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {(s.addenda ?? []).map((a) => (
              <p key={a.at} className="text-sm">
                {a.text} <span className="text-muted">· {a.by}</span>
              </p>
            ))}
            {can('ipd:discharge:sign') && (
              <div className="flex flex-wrap items-end gap-2">
                <FormField label={t('ipd.dis.addendum')} className="min-w-72 flex-1">
                  <Input value={addendum} onChange={(e) => setAddendum(e.target.value)} />
                </FormField>
                <Button
                  variant="secondary"
                  disabled={addendum.trim().length < 2}
                  onClick={() =>
                    addAddendum({ id: stay.id, text: addendum })
                      .unwrap()
                      .then(() => setAddendum(''))
                  }
                >
                  {t('ipd.dis.addAddendum')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Discharge advice, bill status and the patient leaving (outcomes; dues go for approval). */
function LeaveCard({ stay }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [outcome, setOutcome] = useState('NORMAL');
  const [lama, setLama] = useState({ risksExplained: false, witness: '', signedBy: '' });
  const [death, setDeath] = useState({ at: '', cause: '' });
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState(null);
  const [pending, setPending] = useState(null);
  const [advise, advising] = useAdviseDischargeMutation();
  const [leave, leaving] = useDischargeMutation();
  const bill = stay.bill;
  if (stay.status === 'DISCHARGED')
    return (
      <Banner
        tone="success"
        title={t('ipd.dis.left', {
          outcome: t(`ipd.dis.outcome.${stay.outcome}`),
          time: fmtDateTime(stay.leftAt, localeOf(i18n)),
        })}
      >
        {t('ipd.dis.leftHint')}
      </Banner>
    );
  return (
    <Card title={t('ipd.dis.leaveTitle')}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted">{t('ipd.dis.bill')}</dt>
          <dd>
            {inr(bill?.total ?? 0)} ·{' '}
            {bill?.status === 'FINAL'
              ? t('ipd.dis.billFinal', { no: bill.billNo })
              : t('ipd.dis.billRunning')}
          </dd>
          <dt className="text-muted">{t('ipd.dis.deposit')}</dt>
          <dd>{inr(bill?.deposit ?? 0)}</dd>
          <dt className="text-muted">{t('ipd.dis.advised')}</dt>
          <dd>
            {stay.dischargeAdviceAt
              ? fmtDateTime(stay.dischargeAdviceAt, localeOf(i18n))
              : t('ipd.dis.notYet')}
          </dd>
        </dl>
        <ApiErrorNotice error={failure} />
        {pending && (
          <PendingApprovalNotice approvalId={pending}>
            {t('ipd.dis.duesPending')}
          </PendingApprovalNotice>
        )}
        {stay.status !== 'DISCHARGE_STARTED' && can('ipd:discharge:update') && (
          <div>
            <Button
              variant="secondary"
              loading={advising.isLoading}
              onClick={() => advise({ id: stay.id }).unwrap().catch(setFailure)}
            >
              {t('ipd.dis.advise')}
            </Button>
          </div>
        )}
        {stay.status === 'DISCHARGE_STARTED' && bill?.status !== 'FINAL' && (
          <Link
            className="text-sm font-semibold text-primary underline"
            to={`/ipd/bills?id=${stay.id}`}
          >
            {t('ipd.dis.toBill')}
          </Link>
        )}
        {can('ipd:discharge:complete') || can('billing:ip:finalize') ? (
          <form
            noValidate
            className="flex flex-col gap-3 border-t border-line pt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setFailure(null);
              try {
                const r = await leave({
                  id: stay.id,
                  outcome,
                  reason: reason || undefined,
                  lama: outcome === 'LAMA' ? lama : undefined,
                  death:
                    outcome === 'DEATH'
                      ? { at: new Date(death.at).toISOString(), cause: death.cause }
                      : undefined,
                }).unwrap();
                if (r.approvalId) setPending(r.approvalId);
                else
                  toast({
                    tone: 'success',
                    title: t('ipd.dis.discharged', { name: stay.patient.name }),
                  });
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            <FormField label={t('ipd.dis.type')} className="w-64">
              <Select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                options={OUTCOMES.map((o) => ({ value: o, label: t(`ipd.dis.outcome.${o}`) }))}
              />
            </FormField>
            {outcome === 'LAMA' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Checkbox
                  label={t('ipd.dis.lamaRisks')}
                  checked={lama.risksExplained}
                  onChange={(e) => setLama((l) => ({ ...l, risksExplained: e.target.checked }))}
                />
                <FormField label={t('ipd.dis.lamaSigned')}>
                  <Input
                    value={lama.signedBy}
                    onChange={(e) => setLama((l) => ({ ...l, signedBy: e.target.value }))}
                  />
                </FormField>
                <FormField label={t('ipd.dis.lamaWitness')}>
                  <Input
                    value={lama.witness}
                    onChange={(e) => setLama((l) => ({ ...l, witness: e.target.value }))}
                  />
                </FormField>
              </div>
            )}
            {outcome === 'DEATH' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField label={t('ipd.dis.deathAt')}>
                  <Input
                    type="datetime-local"
                    value={death.at}
                    onChange={(e) => setDeath((d) => ({ ...d, at: e.target.value }))}
                  />
                </FormField>
                <FormField label={t('ipd.dis.deathCause')}>
                  <Input
                    value={death.cause}
                    onChange={(e) => setDeath((d) => ({ ...d, cause: e.target.value }))}
                  />
                </FormField>
                <p className="text-sm text-muted md:col-span-2">{t('ipd.dis.deathHint')}</p>
              </div>
            )}
            <FormField label={t('ipd.dis.duesReason')} hint={t('ipd.dis.duesHint')} optional>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
            <div>
              <Button type="submit" loading={leaving.isLoading}>
                {t('ipd.dis.complete')}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Discharge (board Discharge, route /ipd/discharge): planned and started discharges, the
 * discharge summary (consultant-signed; rule R14), discharge advice and the patient leaving
 * (rules R17, R18, R20).
 */
export default function DischargePage() {
  useStrings(addAdminStrings, addPatientsStrings, addDxkitStrings, addIpdStrings);
  const { t } = useTranslation();
  const [id, setId] = useUrlState('id', '');
  const [all, setAll] = useUrlState('all', '');
  const list = useAdmissionsQuery(all ? {} : { status: 'DISCHARGE_PLANNED,DISCHARGE_STARTED' });
  const items = list.data?.items ?? [];
  const current = id || items[0]?.id || '';
  const stay = useAdmissionQuery(current, { skip: !current });
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.dis.title') }]}
        title={t('ipd.dis.title')}
        description={t('ipd.dis.description')}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card
          title={
            all
              ? t('ipd.rounds.all', { count: items.length })
              : t('ipd.dis.planned', { count: items.length })
          }
          actions={
            <Checkbox
              label={t('ipd.dis.showAll')}
              checked={Boolean(all)}
              onChange={(e) => setAll(e.target.checked ? '1' : '')}
            />
          }
        >
          <QueryView
            query={list}
            empty={<EmptyState bordered={false} title={t('ipd.dis.none')} />}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <PickList
                label={t('ipd.dis.title')}
                selectedId={current}
                onPick={setId}
                items={d.items.map((a) => ({
                  id: a.id,
                  lead: a.bed.code,
                  title: a.patient.name,
                  sub: a.ipNo,
                  badge: { tone: STAY_TONE[a.status], label: t(`ipd.stay.${a.status}`) },
                }))}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <QueryView query={stay} rows={8}>
            {(a) => (
              <div className="flex flex-col gap-4">
                <Card>
                  <StayHeader stay={a} />
                </Card>
                <SummaryEditor key={`${a.id}:${a.summary?.status ?? 'NONE'}`} stay={a} />
                <LeaveCard stay={a} />
              </div>
            )}
          </QueryView>
        ) : (
          <EmptyState title={t('ipd.dis.pick')} />
        )}
      </div>
    </Page>
  );
}
