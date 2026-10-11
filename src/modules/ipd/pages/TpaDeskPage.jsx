import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr, parseRupees } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useAdmissionsQuery,
  useAnswerQueryMutation,
  useEnhancementMutation,
  useFileClaimMutation,
  usePreauthQuery,
  usePreauthReplyMutation,
  usePreauthsQuery,
  useSendFinalMutation,
  useSendPreauthMutation,
  useSettleClaimMutation,
} from '../api.js';

const INSURED = ['INSURANCE', 'SCHEME', 'CORPORATE'];
const CASE_TONE = {
  SENT: 'info',
  QUERY: 'warning',
  APPROVED: 'success',
  DENIED: 'critical',
  ENHANCEMENT_SENT: 'info',
  FINAL_SENT: 'info',
  FINAL_APPROVED: 'success',
  CLAIMED: 'neutral',
  SETTLED: 'neutral',
};
const WAITING = ['SENT', 'ENHANCEMENT_SENT', 'FINAL_SENT'];
const rupees = (t) =>
  z.coerce
    .number({ error: t('ipd.tpa.errors.amount') })
    .positive(t('ipd.tpa.errors.amount'))
    .max(10_00_00_000, t('ipd.tpa.errors.amount'));
const paise = (r) => Math.round(Number(r) * 100);

/** One step of the case: a small form with its own error notice and the toast on success. */
function useStep() {
  const { toast } = useToast();
  const [failure, setFailure] = useState(null);
  const run = async (fn, title) => {
    setFailure(null);
    try {
      await fn();
      toast({ tone: 'success', title });
      return true;
    } catch (err) {
      setFailure(err);
      return false;
    }
  };
  return { failure, run };
}

/** The insurer replied: approved (amount), query (text) or denied. At FINAL_SENT only approval. */
function ReplyForm({ c }) {
  const { t } = useTranslation();
  const final = c.status === 'FINAL_SENT';
  const [outcome, setOutcome] = useState('APPROVED');
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');
  const [reply, state] = usePreauthReplyMutation();
  const { failure, run } = useStep();
  const amt = parseRupees(amount);
  const ready = outcome === 'APPROVED' ? amt > 0 : outcome === 'QUERY' ? text.trim() : true;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(
          () =>
            reply({
              id: c.id,
              outcome,
              amount: outcome === 'APPROVED' ? amt : undefined,
              text: text.trim() || undefined,
            }).unwrap(),
          t(`ipd.tpa.replied.${outcome}`),
        );
        if (ok) {
          setAmount('');
          setText('');
        }
      }}
    >
      <h3 className="font-semibold text-ink">
        {t(final ? 'ipd.tpa.finalReply' : 'ipd.tpa.reply')}
      </h3>
      <ApiErrorNotice error={failure} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!final && (
          <FormField label={t('ipd.tpa.outcome')}>
            <Select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              options={['APPROVED', 'QUERY', 'DENIED'].map((o) => ({
                value: o,
                label: t(`ipd.tpa.outcomes.${o}`),
              }))}
            />
          </FormField>
        )}
        {outcome === 'APPROVED' && (
          <FormField
            label={t(
              final
                ? 'ipd.tpa.finalAmount'
                : c.status === 'ENHANCEMENT_SENT'
                  ? 'ipd.tpa.addedAmount'
                  : 'ipd.tpa.approvedAmount',
            )}
            required
          >
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
        )}
        <FormField
          label={t(outcome === 'QUERY' ? 'ipd.tpa.queryText' : 'ipd.tpa.replyNote')}
          required={outcome === 'QUERY'}
          optional={outcome !== 'QUERY'}
          className="sm:col-span-2"
        >
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
      </div>
      {outcome === 'DENIED' && <Banner tone="warning">{t('ipd.tpa.deniedHint')}</Banner>}
      <div>
        <Button type="submit" loading={state.isLoading} disabled={!ready}>
          {t('ipd.tpa.saveReply')}
        </Button>
      </div>
    </form>
  );
}

function AnswerQuery({ c }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [answer, state] = useAnswerQueryMutation();
  const { failure, run } = useStep();
  const last = [...c.events].reverse().find((e) => e.kind === 'QUERY');
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-ink">{t('ipd.tpa.answerTitle')}</h3>
      {last?.text && <Banner tone="warning">{last.text}</Banner>}
      <ApiErrorNotice error={failure} />
      <FormField label={t('ipd.tpa.answer')} required>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </FormField>
      <div>
        <Button
          loading={state.isLoading}
          disabled={text.trim().length < 3}
          onClick={async () => {
            if (await run(() => answer({ id: c.id, text }).unwrap(), t('ipd.tpa.answered')))
              setText('');
          }}
        >
          {t('ipd.tpa.sendAnswer')}
        </Button>
      </div>
    </div>
  );
}

/** Approved: ask for more (rule R9) or send the final bill for discharge approval (3-hour clock). */
function ApprovedActions({ c }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [enhance, enhancing] = useEnhancementMutation();
  const [sendFinal, sending] = useSendFinalMutation();
  const { failure, run } = useStep();
  const amt = parseRupees(amount);
  return (
    <div className="flex flex-col gap-4">
      <ApiErrorNotice error={failure} />
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold text-ink">{t('ipd.tpa.enhanceTitle')}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
          <FormField label={t('ipd.tpa.enhanceAmount')} required>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label={t('ipd.tpa.enhanceReason')} required>
            <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        </div>
        <div>
          <Button
            variant="secondary"
            loading={enhancing.isLoading}
            disabled={!(amt > 0) || reason.trim().length < 3}
            onClick={async () => {
              if (
                await run(
                  () => enhance({ id: c.id, amount: amt, reason }).unwrap(),
                  t('ipd.tpa.enhanceSent'),
                )
              ) {
                setAmount('');
                setReason('');
              }
            }}
          >
            {t('ipd.tpa.sendEnhance')}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="font-semibold text-ink">{t('ipd.tpa.finalTitle')}</h3>
        <p className="text-sm text-muted">{t('ipd.tpa.finalHint')}</p>
        <div>
          <Button
            loading={sending.isLoading}
            onClick={() => run(() => sendFinal({ id: c.id }).unwrap(), t('ipd.tpa.finalSent'))}
          >
            {t('ipd.tpa.sendFinal')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ClaimForm({ c }) {
  const { t } = useTranslation();
  const [no, setNo] = useState('');
  const [file, state] = useFileClaimMutation();
  const { failure, run } = useStep();
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-ink">{t('ipd.tpa.claimTitle')}</h3>
      <ApiErrorNotice error={failure} />
      <FormField label={t('ipd.tpa.claimNo')} required className="max-w-xs">
        <Input mono value={no} maxLength={60} onChange={(e) => setNo(e.target.value)} />
      </FormField>
      <div>
        <Button
          loading={state.isLoading}
          disabled={no.trim().length < 2}
          onClick={() =>
            run(() => file({ id: c.id, claimNo: no.trim() }).unwrap(), t('ipd.tpa.claimFiled'))
          }
        >
          {t('ipd.tpa.fileClaim')}
        </Button>
      </div>
    </div>
  );
}

/** Settlement against the claim; a short payment must be explained line by line. */
function SettleForm({ c }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(() => String((c.finalApproved ?? 0) / 100));
  const [utr, setUtr] = useState('');
  const [rows, setRows] = useState([]);
  const [settle, state] = useSettleClaimMutation();
  const { failure, run } = useStep();
  const amt = parseRupees(amount);
  const short = Math.max(0, (c.finalApproved ?? 0) - (amt || 0));
  const listed = rows.reduce((s, r) => s + (parseRupees(r.amount) || 0), 0);
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-ink">{t('ipd.tpa.settleTitle')}</h3>
      <ApiErrorNotice error={failure} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t('ipd.tpa.settledAmount')} required>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label={t('ipd.tpa.utr')} required>
          <Input mono value={utr} maxLength={40} onChange={(e) => setUtr(e.target.value)} />
        </FormField>
      </div>
      {short > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            {t('ipd.tpa.short', { amount: inr(short), listed: inr(listed) })}
          </p>
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
              <FormField label={t('ipd.tpa.deductionReason')}>
                <Input value={r.reason} onChange={(e) => setRow(i, 'reason', e.target.value)} />
              </FormField>
              <FormField label={t('ipd.tpa.deductionAmount')}>
                <Input
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) => setRow(i, 'amount', e.target.value)}
                />
              </FormField>
              <Button
                variant="ghost"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                aria-label={t('ipd.dis.removeRow')}
              >
                ×
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRows((rs) => [...rs, { key: Date.now(), reason: '', amount: '' }])}
            >
              {t('ipd.tpa.addDeduction')}
            </Button>
          </div>
        </div>
      )}
      <div>
        <Button
          loading={state.isLoading}
          disabled={
            !Number.isFinite(amt) || utr.trim().length < 4 || (short > 0 && listed !== short)
          }
          onClick={() =>
            run(
              () =>
                settle({
                  id: c.id,
                  amount: amt,
                  utr: utr.trim(),
                  deductions: rows.map((r) => ({
                    reason: r.reason.trim(),
                    amount: parseRupees(r.amount),
                  })),
                }).unwrap(),
              t('ipd.tpa.settled'),
            )
          }
        >
          {t('ipd.tpa.recordSettle')}
        </Button>
      </div>
    </div>
  );
}

function Amount({ label, value, tone }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`tabular text-lg font-semibold ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  );
}

function CaseDetail({ id, canEdit }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const q = usePreauthQuery(id);
  return (
    <QueryView query={q} rows={8}>
      {(c) => (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-ink">{c.patient.name}</h2>
                <p className="text-sm text-muted">
                  {c.patient.uhid} · {c.ipNo} · {c.payer.name}
                  {c.policyNo && ` · ${t('ipd.tpa.policy', { no: c.policyNo })}`}
                </p>
                {c.diagnosis && <p className="text-sm">{c.diagnosis}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={CASE_TONE[c.status]} label={t(`ipd.tpa.status.${c.status}`)} />
                {c.overdue && <StatusBadge tone="critical" label={t('ipd.tpa.overdue')} />}
              </div>
            </div>
            {WAITING.includes(c.status) && c.replyDueAt && (
              <Banner tone={c.overdue ? 'critical' : 'info'}>
                {t(c.overdue ? 'ipd.tpa.overdueHint' : 'ipd.tpa.dueBy', {
                  time: fmtDateTime(c.replyDueAt, locale),
                })}
              </Banner>
            )}
            {c.enhancementDue && (
              <Banner tone="warning">{t('ipd.tpa.enhanceDue', { pct: c.billPct })}</Banner>
            )}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Amount label={t('ipd.tpa.requested')} value={inr(c.requested)} />
              <Amount label={t('ipd.tpa.approved')} value={inr(c.approved)} />
              <Amount
                label={t('ipd.tpa.billSoFar')}
                value={inr(c.billTotal)}
                tone={c.billPct >= 100 ? 'text-critical' : undefined}
              />
              {c.finalApproved != null ? (
                <Amount
                  label={t('ipd.tpa.patientShare')}
                  value={inr(c.patientShare ?? 0)}
                  tone={c.patientShare ? 'text-warning' : undefined}
                />
              ) : (
                <Amount
                  label={t('ipd.tpa.used')}
                  value={c.billPct != null ? `${c.billPct}%` : '-'}
                />
              )}
            </dl>
            {canEdit && (
              <div className="border-t border-line pt-3">
                {WAITING.includes(c.status) && <ReplyForm key={c.status} c={c} />}
                {c.status === 'QUERY' && <AnswerQuery c={c} />}
                {c.status === 'APPROVED' && <ApprovedActions c={c} />}
                {c.status === 'FINAL_APPROVED' && <ClaimForm c={c} />}
                {c.status === 'CLAIMED' && <SettleForm c={c} />}
                {c.status === 'DENIED' && <Banner tone="warning">{t('ipd.tpa.deniedDone')}</Banner>}
                {c.status === 'SETTLED' && (
                  <p className="text-sm text-muted">
                    {t('ipd.tpa.settledDone', { amount: inr(c.settled ?? 0) })}
                  </p>
                )}
              </div>
            )}
            <div className="border-t border-line pt-3">
              <h3 className="mb-2 font-semibold text-ink">{t('ipd.tpa.history')}</h3>
              <ol className="flex flex-col gap-2">
                {[...c.events].reverse().map((e) => (
                  <li key={`${e.kind}-${e.at}`} className="text-sm">
                    <span className="font-semibold text-ink">{t(`ipd.tpa.event.${e.kind}`)}</span>
                    {e.amount != null && ` · ${inr(e.amount)}`}
                    {e.text && ` · ${e.text}`}
                    <span className="text-muted">
                      {' '}
                      · {e.by} · {fmtDateTime(e.at, locale)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Card>
      )}
    </QueryView>
  );
}

/** Start a cashless request for an insured stay (rule R8: the insurer's 1-hour reply clock). */
function NewCaseDialog({ open, onOpenChange, onCreated }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const stays = useAdmissionsQuery({ limit: 100 }, { skip: !open });
  const [send] = useSendPreauthMutation();
  const insured = (stays.data?.items ?? []).filter((a) => INSURED.includes(a.payer?.kind));
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('ipd.tpa.new')}
      description={t('ipd.tpa.newHint')}
      schema={z.object({
        admissionId: z.string().min(1, t('ipd.tpa.errors.stay')),
        requested: rupees(t),
        diagnosis: z.string().max(300).optional(),
        plannedTreatment: z.string().max(500).optional(),
        memberId: z.string().max(40).optional(),
      })}
      defaultValues={{
        admissionId: '',
        requested: '',
        diagnosis: '',
        plannedTreatment: '',
        memberId: '',
      }}
      fields={[
        {
          name: 'admissionId',
          label: t('ipd.tpa.stay'),
          type: 'select',
          required: true,
          span: 2,
          hint: insured.length ? undefined : t('ipd.tpa.noInsured'),
          options: insured.map((a) => ({
            value: a.id,
            label: `${a.bed?.code ?? ''} · ${a.patient.name} · ${a.ipNo}`,
          })),
        },
        { name: 'requested', label: t('ipd.tpa.requestedRupees'), type: 'number', required: true },
        { name: 'memberId', label: t('ipd.tpa.memberId'), optional: true, mono: true },
        { name: 'diagnosis', label: t('ipd.tpa.diagnosis'), optional: true, span: 2 },
        {
          name: 'plannedTreatment',
          label: t('ipd.tpa.planned'),
          type: 'textarea',
          optional: true,
          span: 2,
        },
      ]}
      submitLabel={t('ipd.tpa.send')}
      onSubmit={({ admissionId, requested, ...v }) =>
        send({ id: admissionId, requested: paise(requested), ...v }).unwrap()
      }
      onDone={(c) => {
        toast({ tone: 'success', title: t('ipd.tpa.sent', { name: c.patient.name }) });
        onCreated(c.id);
      }}
    />
  );
}

/**
 * Insurance and TPA desk (board IpdTpa, route /ipd/insurance): open cashless cases with the
 * insurer's reply clock (overdue first), then each case from pre-auth through enhancement, final
 * approval, claim and settlement (GET/POST /ipd/preauths).
 */
export default function TpaDeskPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addIpdStrings);
  const { t } = useTranslation();
  const can = useCan();
  const canEdit = can('ipd:preauth:update');
  const [id, setId] = useUrlState('id', '');
  const [show, setShow] = useUrlState('show', 'open');
  const [creating, setCreating] = useState(false);
  const list = usePreauthsQuery({ open: show === 'open' });
  const items = list.data?.items ?? [];
  const current = id || items[0]?.id || '';
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.tpa.title') }]}
        title={t('ipd.tpa.title')}
        description={t('ipd.tpa.description')}
        actions={
          can('ipd:preauth:create') && (
            <Button onClick={() => setCreating(true)}>{t('ipd.tpa.new')}</Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title={t('ipd.tpa.cases', { count: items.length })}>
          <div className="mb-3">
            <Select
              aria-label={t('ipd.tpa.show')}
              value={show}
              onChange={(e) => setShow(e.target.value, { reset: ['id'] })}
              options={[
                { value: 'open', label: t('ipd.tpa.showOpen') },
                { value: 'all', label: t('ipd.tpa.showAll') },
              ]}
            />
          </div>
          <QueryView
            query={list}
            empty={<EmptyState bordered={false} title={t('ipd.tpa.none')} />}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <PickList
                label={t('ipd.tpa.title')}
                selectedId={current}
                onPick={(v) => setId(v)}
                items={d.items.map((c) => ({
                  id: c.id,
                  title: c.patient.name,
                  sub: `${c.payer.name} · ${c.ipNo}`,
                  badge: c.overdue
                    ? { tone: 'critical', label: t('ipd.tpa.overdue') }
                    : c.enhancementDue
                      ? { tone: 'warning', label: t('ipd.tpa.enhanceBadge') }
                      : { tone: CASE_TONE[c.status], label: t(`ipd.tpa.status.${c.status}`) },
                }))}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <CaseDetail key={current} id={current} canEdit={canEdit} />
        ) : (
          <EmptyState title={t('ipd.tpa.pick')} />
        )}
      </div>
      <NewCaseDialog open={creating} onOpenChange={setCreating} onCreated={(v) => setId(v)} />
    </Page>
  );
}
