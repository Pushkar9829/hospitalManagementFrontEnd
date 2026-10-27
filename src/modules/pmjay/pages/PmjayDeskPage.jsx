import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addPmjayStrings } from '@hms/i18n/pmjay';
import {
  Banner,
  Button,
  Card,
  Checkbox,
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
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import { FileField } from '../../files/FileField.jsx';
import {
  usePmjAddDocumentMutation,
  usePmjCaseQuery,
  usePmjCasesQuery,
  usePmjPackagesQuery,
  usePmjRegisterMutation,
  usePmjSaveSettingsMutation,
  usePmjSavePackageMutation,
  usePmjSetPackagesMutation,
  usePmjSettingsQuery,
  usePmjStaysQuery,
  usePmjStepMutation,
  usePmjSummaryQuery,
} from '../api.js';

const TONE = {
  REGISTERED: 'info',
  PREAUTH_SENT: 'info',
  PREAUTH_QUERY: 'warning',
  PREAUTH_APPROVED: 'success',
  PREAUTH_REJECTED: 'critical',
  DISCHARGED: 'warning',
  CLAIM_SUBMITTED: 'info',
  CLAIM_QUERY: 'warning',
  CLAIM_APPROVED: 'success',
  CLAIM_REJECTED: 'critical',
  PAID: 'neutral',
  CANCELLED: 'neutral',
};
const CLOSED = ['PAID', 'CANCELLED', 'PREAUTH_REJECTED', 'CLAIM_REJECTED'];
const lines = (s) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/** Runs one action: error notice under the form, toast on success. */
function useAction() {
  const { toast } = useToast();
  const [failure, setFailure] = useState(null);
  const run = async (fn, title) => {
    setFailure(null);
    try {
      await fn();
      if (title) toast({ tone: 'success', title });
      return true;
    } catch (err) {
      setFailure(err);
      return false;
    }
  };
  return { failure, run };
}

function Status({ status }) {
  const { t } = useTranslation();
  return <StatusBadge tone={TONE[status]} label={t(`pmjay.status.${status}`)} />;
}

function Clock({ c }) {
  const { t, i18n } = useTranslation();
  if (!c.dueAt) return <span className="text-muted">{t('pmjay.case.none')}</span>;
  return (
    <span className={c.overdue ? 'font-semibold text-critical' : 'text-ink'}>
      {t(`pmjay.due.${c.dueKind}`)} {fmtDateTime(c.dueAt, localeOf(i18n))}
      {c.atRisk ? ` · ${t('pmjay.due.atRisk')}` : c.overdue ? ` · ${t('pmjay.due.overdue')}` : ''}
    </span>
  );
}

// ---------------------------------------------------------------- case steps

function PackagesStep({ c }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(c.packages.map((p) => p.packageId));
  const [diagnosis, setDiagnosis] = useState(c.diagnosis ?? '');
  const [planned, setPlanned] = useState(c.plannedTreatment ?? '');
  const pkgs = usePmjPackagesQuery({ q: q || undefined });
  const [save, state] = usePmjSetPackagesMutation();
  const { failure, run } = useAction();
  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            save({
              id: c.id,
              packageIds: picked,
              diagnosis: diagnosis || undefined,
              plannedTreatment: planned || undefined,
            }).unwrap(),
          t('pmjay.pkg.saved'),
        );
      }}
    >
      <h3 className="font-semibold text-ink">{t('pmjay.pkg.choose')}</h3>
      <ApiErrorNotice error={failure} />
      <Input
        aria-label={t('pmjay.pkg.search')}
        placeholder={t('pmjay.pkg.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-56 overflow-y-auto rounded-card border border-line p-2">
        {(pkgs.data?.items ?? []).map((p) => (
          <Checkbox
            key={p.id}
            checked={picked.includes(p.id)}
            onChange={() => toggle(p.id)}
            label={`${p.code} · ${p.name} · ${inr(p.rate)}`}
            description={[
              p.specialty,
              p.preauthRequired ? null : t('pmjay.pkg.noPreauth'),
              p.reservedForPublic ? t('pmjay.pkg.publicOnly') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t('pmjay.pkg.diagnosis')}>
          <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </FormField>
        <FormField label={t('pmjay.pkg.planned')}>
          <Input value={planned} onChange={(e) => setPlanned(e.target.value)} />
        </FormField>
      </div>
      <div>
        <Button type="submit" disabled={!picked.length} loading={state.isLoading}>
          {t('pmjay.pkg.save')}
        </Button>
      </div>
    </form>
  );
}

function Documents({ c, stage }) {
  const { t } = useTranslation();
  const [add] = usePmjAddDocumentMutation();
  const { failure, run } = useAction();
  const missing = stage === 'PREAUTH' ? c.missing?.preauth : c.missing?.claim;
  const have = c.documents.filter((d) =>
    stage === 'PREAUTH' ? d.stage === 'PREAUTH' : d.stage !== 'PREAUTH',
  );
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold text-ink">
        {t('pmjay.docs.title')} ·{' '}
        {t(stage === 'PREAUTH' ? 'pmjay.docs.preauth' : 'pmjay.docs.claim')}
      </h3>
      <ApiErrorNotice error={failure} />
      {missing?.length ? (
        <Banner tone="warning">{t('pmjay.docs.missing', { list: missing.join(', ') })}</Banner>
      ) : (
        <Banner tone="success">{t('pmjay.docs.complete')}</Banner>
      )}
      {have.length > 0 && (
        <ul className="text-sm text-muted">
          {have.map((d) => (
            <li key={d.id}>
              ✓ {d.name} · {t('pmjay.docs.attached')}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(missing ?? []).map((name) => (
          <FileField
            key={name}
            label={t('pmjay.docs.upload', { name })}
            purpose="patient-document"
            onChange={(fileId) =>
              run(() =>
                add({
                  id: c.id,
                  stage:
                    stage === 'PREAUTH'
                      ? 'PREAUTH'
                      : ['Final bill'].includes(name)
                        ? 'CLAIM'
                        : 'DISCHARGE',
                  name,
                  fileId,
                }).unwrap(),
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

/** A step that takes one text or number and posts it. */
function StepForm({ c, step, title, hint, fields, submit, done, extra }) {
  const [values, setValues] = useState({});
  const [go, state] = usePmjStepMutation();
  const { failure, run } = useAction();
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = {};
        for (const f of fields) {
          const v = values[f.name];
          if (v === undefined || v === '') continue;
          body[f.name] = f.money ? parseRupees(v) : v;
        }
        const ok = await run(() => go({ id: c.id, step, ...extra, ...body }).unwrap(), done);
        if (ok) setValues({});
      }}
    >
      <h3 className="font-semibold text-ink">{title}</h3>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <ApiErrorNotice error={failure} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <FormField key={f.name} label={f.label} hint={f.hint}>
            {f.long ? (
              <Textarea
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            ) : (
              <Input
                inputMode={f.money ? 'decimal' : undefined}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </FormField>
        ))}
      </div>
      <div>
        <Button type="submit" loading={state.isLoading}>
          {submit}
        </Button>
      </div>
    </form>
  );
}

/** Payer decision: typed from TMS, or played by the mock payer for an NHCX case in mock mode. */
function DecisionForm({ c, use, mock }) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState('APPROVED');
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [go, state] = usePmjStepMutation();
  const { failure, run } = useAction();
  const claim = use === 'claim';
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const amt = parseRupees(amount) ?? undefined;
        const short = claim && amt != null ? c.amounts.claimed - amt : 0;
        const body = {
          id: c.id,
          step: mock ? 'nhcx/mock-response' : `${claim ? 'claim' : 'preauth'}/decision`,
          outcome,
          amount: outcome === 'APPROVED' ? amt : undefined,
          text: text || undefined,
          ...(mock ? { use: claim ? 'claim' : 'preauthorization' } : {}),
          ...(claim && !mock && short > 0 && reason
            ? { deductions: [{ reason, amount: short }] }
            : {}),
        };
        const ok = await run(() => go(body).unwrap(), t('pmjay.steps.recorded'));
        if (ok) {
          setAmount('');
          setText('');
          setReason('');
        }
      }}
    >
      <h3 className="font-semibold text-ink">
        {mock ? t('pmjay.steps.simulate') : t('pmjay.steps.decision')}
      </h3>
      <ApiErrorNotice error={failure} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t('pmjay.steps.outcome')}>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {['APPROVED', 'QUERY', 'REJECTED'].map((o) => (
              <option key={o} value={o}>
                {t(`pmjay.steps.${o}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {outcome === 'APPROVED' && (
          <FormField label={t('pmjay.steps.amount')} hint={t('pmjay.steps.amountHint')}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
        )}
        <FormField label={t('pmjay.steps.text')}>
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
        {claim && !mock && outcome === 'APPROVED' && (
          <FormField label={t('pmjay.steps.deductionReason')}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        )}
      </div>
      <div>
        <Button type="submit" loading={state.isLoading}>
          {t('pmjay.steps.record')}
        </Button>
      </div>
    </form>
  );
}

function NextStep({ c, settings }) {
  const { t } = useTranslation();
  const tms = c.channel === 'TMS';
  const mock = c.channel === 'NHCX' && settings?.nhcx?.mode === 'MOCK';
  switch (c.status) {
    case 'REGISTERED':
      return (
        <>
          <PackagesStep c={c} />
          {c.packages.length > 0 && <Documents c={c} stage="PREAUTH" />}
          {c.packages.length > 0 && (
            <StepForm
              c={c}
              step="preauth"
              title={t('pmjay.steps.preauth')}
              hint={t(tms ? 'pmjay.steps.preauthHintTms' : 'pmjay.steps.preauthHintNhcx')}
              fields={
                tms
                  ? [
                      { name: 'tmsRegistrationId', label: t('pmjay.steps.registrationId') },
                      { name: 'tmsPreauthNo', label: t('pmjay.steps.preauthNo') },
                    ]
                  : []
              }
              submit={t('pmjay.steps.send')}
              done={t('pmjay.steps.sent')}
            />
          )}
          <StepForm
            c={c}
            step="cancel"
            title={t('pmjay.steps.cancel')}
            fields={[{ name: 'reason', label: t('pmjay.steps.cancelReason') }]}
            submit={t('pmjay.steps.cancel')}
            done={t('pmjay.steps.cancelled')}
          />
        </>
      );
    case 'PREAUTH_SENT':
      return (
        <>
          {(tms || !mock) && <DecisionForm c={c} use="preauthorization" />}
          {mock && <DecisionForm c={c} use="preauthorization" mock />}
        </>
      );
    case 'PREAUTH_QUERY':
    case 'CLAIM_QUERY':
      return (
        <>
          {c.status === 'PREAUTH_QUERY' && <PackagesStep c={c} />}
          <StepForm
            c={c}
            step={c.status === 'PREAUTH_QUERY' ? 'preauth/answer-query' : 'claim/answer-query'}
            title={t('pmjay.steps.answer')}
            fields={[{ name: 'text', label: t('pmjay.steps.answerText'), long: true }]}
            submit={t('pmjay.steps.answer')}
            done={t('pmjay.steps.answered')}
          />
        </>
      );
    case 'PREAUTH_APPROVED':
      return <Banner tone="success">{t('pmjay.steps.treatment')}</Banner>;
    case 'DISCHARGED':
      return (
        <>
          <Documents c={c} stage="CLAIM" />
          <StepForm
            c={c}
            step="claim"
            title={t('pmjay.steps.claim')}
            hint={t('pmjay.steps.claimHint')}
            fields={tms ? [{ name: 'tmsClaimNo', label: t('pmjay.steps.claimNo') }] : []}
            submit={t('pmjay.steps.submit')}
            done={t('pmjay.steps.submitted')}
          />
        </>
      );
    case 'CLAIM_SUBMITTED':
      return mock ? <DecisionForm c={c} use="claim" mock /> : <DecisionForm c={c} use="claim" />;
    case 'CLAIM_APPROVED':
      return (
        <StepForm
          c={c}
          step="payment"
          title={t('pmjay.steps.payment')}
          fields={[
            { name: 'amount', label: t('pmjay.steps.received'), money: true },
            { name: 'utr', label: t('pmjay.steps.utr') },
          ]}
          submit={t('pmjay.steps.payment')}
          done={t('pmjay.steps.paid')}
        />
      );
    default:
      return <Banner tone="neutral">{t('pmjay.steps.closed')}</Banner>;
  }
}

function CaseDetail({ id }) {
  const { t, i18n } = useTranslation();
  const query = usePmjCaseQuery(id);
  const settings = usePmjSettingsQuery();
  return (
    <QueryView query={query}>
      {(c) => (
        <div className="flex flex-col gap-4">
          <Card
            title={`${c.patient.name} · ${c.ipNo}`}
            description={c.patient.uhid}
            actions={<Status status={c.status} />}
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">{t('pmjay.case.beneficiary')}</dt>
                <dd className="text-ink">
                  {c.beneficiary.pmjayId}
                  {c.beneficiary.name ? ` · ${c.beneficiary.name}` : ''}
                  {c.beneficiary.verification?.method && (
                    <span className="block text-muted">
                      {t('pmjay.case.verified', {
                        method: t(`pmjay.method.${c.beneficiary.verification.method}`),
                      })}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('pmjay.case.channel')}</dt>
                <dd className="text-ink">{c.channel}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('pmjay.list.packages')}</dt>
                <dd className="text-ink">
                  {c.packages.map((p) => `${p.code} ${p.name}`).join(', ') || t('pmjay.case.none')}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('pmjay.case.packageTotal')}</dt>
                <dd className="tabular text-ink">{inr(c.packageTotal)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('pmjay.list.clock')}</dt>
                <dd>
                  <Clock c={c} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('pmjay.case.tms')}</dt>
                <dd className="text-ink">
                  {[c.tms?.registrationId, c.tms?.preauthNo, c.tms?.claimNo]
                    .filter(Boolean)
                    .join(' · ') || t('pmjay.case.none')}
                </dd>
              </div>
            </dl>
          </Card>
          {!CLOSED.includes(c.status) && (
            <Card>
              <div className="flex flex-col gap-6">
                <NextStep c={c} settings={settings.data} />
              </div>
            </Card>
          )}
          {CLOSED.includes(c.status) && <NextStep c={c} settings={settings.data} />}
          <Card title={t('pmjay.case.history')}>
            <ol className="flex flex-col gap-1 text-sm">
              {c.events
                .slice()
                .reverse()
                .map((e, i) => (
                  <li key={i} className="text-ink">
                    <span className="text-muted">{fmtDateTime(e.at, localeOf(i18n))}</span> ·{' '}
                    {e.kind.replace(/_/g, ' ').toLowerCase()}
                    {e.amount != null ? ` · ${inr(e.amount)}` : ''}
                    {e.text ? ` · ${e.text}` : ''}
                    {e.by ? ` · ${t('pmjay.case.by', { by: e.by })}` : ''}
                  </li>
                ))}
            </ol>
            {c.channel === 'NHCX' && (
              <a
                className="mt-3 inline-block text-sm text-primary underline"
                href={`/api/v1/pmjay/cases/${c.id}/fhir`}
                target="_blank"
                rel="noreferrer"
              >
                {t('pmjay.steps.fhir')}
              </a>
            )}
          </Card>
        </div>
      )}
    </QueryView>
  );
}

// ---------------------------------------------------------------- tabs

function CasesTab() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [id, setId] = useUrlState('id', '');
  const query = usePmjCasesQuery({ q: q || undefined, open: all ? 'false' : undefined });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-3">
        <Input
          aria-label={t('pmjay.list.search')}
          placeholder={t('pmjay.list.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Checkbox
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
          label={t('pmjay.list.all')}
        />
        <QueryView
          query={query}
          isEmpty={(d) => !d.items.length}
          empty={
            <EmptyState title={t('pmjay.list.empty')} description={t('pmjay.list.emptyHint')} />
          }
        >
          {(d) => (
            <ul className="flex flex-col gap-2">
              {d.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setId(c.id)}
                    className={`w-full rounded-card border px-3 py-2 text-left ${
                      id === c.id ? 'bg-primary-bg border-primary' : 'border-line bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {c.patient.name} · {c.ipNo}
                      </span>
                      <Status status={c.status} />
                    </div>
                    <div className="text-sm text-muted">
                      {c.beneficiary.pmjayId} ·{' '}
                      {c.packages.map((p) => p.code).join(', ') || t('pmjay.case.none')}
                    </div>
                    <div className="text-sm">
                      <Clock c={c} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
      <div>{id ? <CaseDetail id={id} /> : <EmptyState title={t('pmjay.list.pick')} />}</div>
    </div>
  );
}

function RegisterTab() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [stay, setStay] = useState(null);
  const [form, setForm] = useState({ method: 'AADHAAR_OTP' });
  const stays = usePmjStaysQuery({ q: q || undefined });
  const settings = usePmjSettingsQuery();
  const [register, state] = usePmjRegisterMutation();
  const [, setTab] = useUrlState('tab', '');
  const [, setId] = useUrlState('id', '');
  const { failure, run } = useAction();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title={t('pmjay.register.stays')}>
        <Input
          aria-label={t('pmjay.list.search')}
          placeholder={t('pmjay.list.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <QueryView
          query={stays}
          isEmpty={(d) => !d.items.length}
          empty={t('pmjay.register.staysEmpty')}
        >
          {(d) => (
            <ul className="mt-3 flex flex-col gap-2">
              {d.items.map((s) => (
                <li key={s.admissionId}>
                  <button
                    type="button"
                    onClick={() => setStay(s)}
                    className={`w-full rounded-card border px-3 py-2 text-left ${
                      stay?.admissionId === s.admissionId
                        ? 'bg-primary-bg border-primary'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <span className="font-semibold text-ink">
                      {s.patient.name} · {s.ipNo}
                    </span>
                    <span className="block text-sm text-muted">
                      {s.patient.uhid} · {s.bed} · {s.payer} · {s.reason}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Card>
      <Card title={stay ? `${stay.patient.name} · ${stay.ipNo}` : t('pmjay.register.pick')}>
        <p className="mb-3 text-sm text-muted">{t('pmjay.register.hint')}</p>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            let created;
            const ok = await run(async () => {
              created = await register({
                admissionId: stay.admissionId,
                channel: form.channel || settings.data?.channel,
                beneficiary: {
                  pmjayId: form.pmjayId,
                  name: form.name || undefined,
                  familyId: form.familyId || undefined,
                  abha: form.abha || undefined,
                  verification: { method: form.method, ref: form.ref || undefined },
                },
              }).unwrap();
            }, t('pmjay.register.done'));
            if (ok) {
              setStay(null);
              setForm({ method: 'AADHAAR_OTP' });
              setTab('cases');
              setId(created.id);
            }
          }}
        >
          <ApiErrorNotice error={failure} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t('pmjay.register.pmjayId')} required>
              <Input value={form.pmjayId ?? ''} onChange={set('pmjayId')} />
            </FormField>
            <FormField label={t('pmjay.register.name')} optional>
              <Input value={form.name ?? ''} onChange={set('name')} />
            </FormField>
            <FormField label={t('pmjay.register.familyId')} optional>
              <Input value={form.familyId ?? ''} onChange={set('familyId')} />
            </FormField>
            <FormField label={t('pmjay.register.abha')} optional>
              <Input value={form.abha ?? ''} onChange={set('abha')} />
            </FormField>
            <FormField label={t('pmjay.register.method')} required>
              <Select value={form.method} onChange={set('method')}>
                {['AADHAAR_OTP', 'AADHAAR_BIOMETRIC', 'FALLBACK'].map((m) => (
                  <option key={m} value={m}>
                    {t(`pmjay.method.${m}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('pmjay.register.ref')} optional>
              <Input value={form.ref ?? ''} onChange={set('ref')} />
            </FormField>
            <FormField label={t('pmjay.register.channel')}>
              <Select
                value={form.channel ?? settings.data?.channel ?? 'TMS'}
                onChange={set('channel')}
              >
                {['TMS', 'NHCX'].map((m) => (
                  <option key={m} value={m}>
                    {t(`pmjay.settings.${m}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div>
            <Button
              type="submit"
              disabled={!stay || !(form.pmjayId?.trim().length >= 4)}
              loading={state.isLoading}
            >
              {t('pmjay.register.submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function PackagesTab() {
  const { t } = useTranslation();
  const can = useCan();
  const query = usePmjPackagesQuery({ active: 'false' });
  const [save, state] = usePmjSavePackageMutation();
  const { failure, run } = useAction();
  const empty = { preauthRequired: true, reservedForPublic: false };
  const [f, setF] = useState(empty);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="flex flex-col gap-4">
      {can('pmjay:package:create') && (
        <Card title={t('pmjay.packages.add')}>
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () =>
                  save({
                    code: f.code,
                    name: f.name,
                    specialty: f.specialty,
                    rate: parseRupees(f.rate),
                    stayDays: Number(f.stayDays || 0),
                    preauthRequired: f.preauthRequired,
                    reservedForPublic: f.reservedForPublic,
                    documents: {
                      preauth: lines(f.docsPreauth ?? ''),
                      claim: lines(f.docsClaim ?? ''),
                    },
                  }).unwrap(),
                t('pmjay.packages.saved'),
              );
              if (ok) setF(empty);
            }}
          >
            <ApiErrorNotice error={failure} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label={t('pmjay.packages.code')} required>
                <Input value={f.code ?? ''} onChange={set('code')} />
              </FormField>
              <FormField label={t('pmjay.packages.name')} required>
                <Input value={f.name ?? ''} onChange={set('name')} />
              </FormField>
              <FormField label={t('pmjay.packages.specialty')} required>
                <Input value={f.specialty ?? ''} onChange={set('specialty')} />
              </FormField>
              <FormField label={t('pmjay.packages.rate')} required>
                <Input inputMode="decimal" value={f.rate ?? ''} onChange={set('rate')} />
              </FormField>
              <FormField label={t('pmjay.packages.stayDays')}>
                <Input inputMode="numeric" value={f.stayDays ?? ''} onChange={set('stayDays')} />
              </FormField>
              <div className="flex flex-col justify-end gap-2">
                <Checkbox
                  checked={f.preauthRequired}
                  onChange={(e) => setF((x) => ({ ...x, preauthRequired: e.target.checked }))}
                  label={t('pmjay.packages.preauthRequired')}
                />
                <Checkbox
                  checked={f.reservedForPublic}
                  onChange={(e) => setF((x) => ({ ...x, reservedForPublic: e.target.checked }))}
                  label={t('pmjay.packages.reservedForPublic')}
                />
              </div>
              <FormField label={t('pmjay.packages.docsPreauth')} optional>
                <Textarea value={f.docsPreauth ?? ''} onChange={set('docsPreauth')} />
              </FormField>
              <FormField label={t('pmjay.packages.docsClaim')} optional>
                <Textarea value={f.docsClaim ?? ''} onChange={set('docsClaim')} />
              </FormField>
            </div>
            <div>
              <Button
                type="submit"
                loading={state.isLoading}
                disabled={!f.code || !f.name || !f.specialty || !(parseRupees(f.rate) > 0)}
              >
                {t('pmjay.packages.save')}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <QueryView
        query={query}
        isEmpty={(d) => !d.items.length}
        empty={
          <EmptyState
            title={t('pmjay.packages.empty')}
            description={t('pmjay.packages.emptyHint')}
          />
        }
      >
        {(d) => (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  {['code', 'name', 'specialty', 'rate', 'stayDays', 'preauthRequired'].map((k) => (
                    <th key={k} className="px-3 py-2 font-medium">
                      {t(`pmjay.packages.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.items.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-3 py-2 font-semibold text-ink">{p.code}</td>
                    <td className="px-3 py-2 text-ink">
                      {p.name}
                      {p.reservedForPublic ? ` · ${t('pmjay.pkg.publicOnly')}` : ''}
                    </td>
                    <td className="px-3 py-2 text-ink">{p.specialty}</td>
                    <td className="tabular px-3 py-2 text-ink">{inr(p.rate)}</td>
                    <td className="tabular px-3 py-2 text-ink">{p.stayDays}</td>
                    <td className="px-3 py-2 text-ink">
                      {t(p.preauthRequired ? 'pmjay.packages.yes' : 'pmjay.packages.no')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </div>
  );
}

function SettingsTab() {
  const query = usePmjSettingsQuery();
  return (
    <QueryView query={query}>{(s) => <SettingsForm key={JSON.stringify(s)} s={s} />}</QueryView>
  );
}

function SettingsForm({ s }) {
  const { t } = useTranslation();
  const can = useCan();
  const [f, setF] = useState({
    hospitalType: s.hospitalType,
    stateCode: s.stateCode ?? '',
    hospitalCode: s.hospitalCode ?? '',
    hfrId: s.hfrId ?? '',
    channel: s.channel,
    mode: s.nhcx.mode,
    participantCode: s.nhcx.participantCode ?? '',
    payerCode: s.nhcx.payerCode ?? '',
  });
  const [save, state] = usePmjSaveSettingsMutation();
  const { failure, run } = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const opt = (k, list) =>
    list.map((v) => (
      <option key={v} value={v}>
        {t(`pmjay.settings.${v}`)}
      </option>
    ));
  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              save({
                hospitalType: f.hospitalType,
                stateCode: f.stateCode || undefined,
                hospitalCode: f.hospitalCode || undefined,
                hfrId: f.hfrId || undefined,
                channel: f.channel,
                nhcx: {
                  mode: f.mode,
                  participantCode: f.participantCode || undefined,
                  payerCode: f.payerCode || undefined,
                },
              }).unwrap(),
            t('pmjay.settings.saved'),
          );
        }}
      >
        <Banner tone="info">{t('pmjay.settings.clocks')}</Banner>
        <ApiErrorNotice error={failure} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t('pmjay.settings.hospitalType')}>
            <Select value={f.hospitalType} onChange={set('hospitalType')}>
              {opt('hospitalType', ['PRIVATE', 'PUBLIC'])}
            </Select>
          </FormField>
          <FormField label={t('pmjay.settings.stateCode')}>
            <Input value={f.stateCode} onChange={set('stateCode')} />
          </FormField>
          <FormField label={t('pmjay.settings.hospitalCode')}>
            <Input value={f.hospitalCode} onChange={set('hospitalCode')} />
          </FormField>
          <FormField label={t('pmjay.settings.hfrId')}>
            <Input value={f.hfrId} onChange={set('hfrId')} />
          </FormField>
          <FormField label={t('pmjay.settings.channel')}>
            <Select value={f.channel} onChange={set('channel')}>
              {opt('channel', ['TMS', 'NHCX'])}
            </Select>
          </FormField>
          <FormField label={t('pmjay.settings.mode')}>
            <Select value={f.mode} onChange={set('mode')}>
              {opt('mode', ['MOCK', 'SANDBOX', 'LIVE'])}
            </Select>
          </FormField>
          <FormField label={t('pmjay.settings.participantCode')}>
            <Input value={f.participantCode} onChange={set('participantCode')} />
          </FormField>
          <FormField label={t('pmjay.settings.payerCode')}>
            <Input value={f.payerCode} onChange={set('payerCode')} />
          </FormField>
        </div>
        {can('pmjay:settings:update') && (
          <div>
            <Button type="submit" loading={state.isLoading}>
              {t('pmjay.settings.save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

/** PM-JAY cashless desk (screen PmjayDesk, /ipd/pmjay). */
export default function PmjayDeskPage() {
  useStrings(addPmjayStrings);
  const { t } = useTranslation();
  const summary = usePmjSummaryQuery();
  const s = summary.data;
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('pmjay.crumb') }, { label: t('pmjay.title') }]}
        title={t('pmjay.title')}
        description={t('pmjay.description')}
      />
      <KpiRow
        className="mt-4"
        loading={summary.isLoading}
        items={
          s
            ? [
                { label: t('pmjay.kpi.open'), value: s.open },
                {
                  label: t('pmjay.kpi.overdue'),
                  value: s.overdue,
                  tone: s.overdue ? 'critical' : 'neutral',
                },
                { label: t('pmjay.kpi.claimed'), value: inr(s.claimed) },
                { label: t('pmjay.kpi.outstanding'), value: inr(s.outstanding) },
                {
                  label: t('pmjay.kpi.paid'),
                  value: inr(s.paid),
                  sub: `${t('pmjay.kpi.deductions')} ${inr(s.deductions)}`,
                },
              ]
            : []
        }
      />
      <UrlTabs
        className="mt-6"
        label={t('pmjay.tabs.label')}
        tabs={[
          { id: 'cases', label: t('pmjay.tabs.cases'), count: s?.open, body: <CasesTab /> },
          { id: 'register', label: t('pmjay.tabs.register'), body: <RegisterTab /> },
          { id: 'packages', label: t('pmjay.tabs.packages'), body: <PackagesTab /> },
          { id: 'settings', label: t('pmjay.tabs.settings'), body: <SettingsTab /> },
        ]}
      />
    </Page>
  );
}
