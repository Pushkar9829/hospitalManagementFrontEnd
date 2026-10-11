import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addQualityStrings } from '@hms/i18n/quality';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  Sheet,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import {
  COMPLAINT_TONE,
  INCIDENT_TONE,
  SEVERITY_TONE,
  useAcknowledgeDocumentMutation,
  useActionDoneMutation,
  useApproveDocumentMutation,
  useAuditActionDoneMutation,
  useAuditTemplatesQuery,
  useAuditsQuery,
  useCloseIncidentMutation,
  useComplaintActionMutation,
  useComplaintsQuery,
  useCreateComplaintMutation,
  useDocumentsQuery,
  useDraftDocumentMutation,
  useFeedbackSummaryQuery,
  useIncidentQuery,
  useIncidentsQuery,
  useIndicatorsQuery,
  useInfectionQuery,
  useInvestigateMutation,
  useQltOverviewQuery,
  useRecordAuditMutation,
  useRecordHaiMutation,
  useSaveDeviceDaysMutation,
} from '../api.js';
import { IncidentForm } from '../components/IncidentForm.jsx';

const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const monthIST = () => todayIST().slice(0, 7);

function useAction() {
  const [failure, setFailure] = useState(null);
  const run = async (fn) => {
    setFailure(null);
    try {
      return await fn();
    } catch (err) {
      setFailure(err);
      return null;
    }
  };
  return [run, failure];
}

const UNIT = {
  opdWaitMin: 'min',
  dischargeTatMin: 'min',
  labTatMin: 'min',
  criticalCallMin: 'min',
  medErrorsPer1000: 'per1000',
  fallsPer1000: 'per1000',
  bedOccupancyPct: 'pct',
  icuReturn48h: 'count',
  nps: 'score',
  complaintsOnTimePct: 'pct',
};

function IndicatorsTab() {
  const { t } = useTranslation();
  const [month, setMonth] = useUrlState('month', monthIST());
  const q = useIndicatorsQuery(month);
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('qlt.month')} className="w-44">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={6}>
        {(d) => (
          <>
            <p className="text-sm text-muted">{t('qlt.ind.patientDays', { n: d.patientDays })}</p>
            <table className="w-full text-sm">
              <caption className="sr-only">{t('qlt.ind.caption', { month: d.month })}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('qlt.ind.name')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('qlt.ind.value')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('qlt.ind.target')}</th>
                  <th className="px-3 py-2 font-semibold">{t('qlt.ind.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((i) => (
                  <tr key={i.key}>
                    <td className="px-3 py-2">{t(`qlt.ind.k.${i.key}`)}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold">
                      {i.value == null ? '–' : t(`qlt.ind.unit.${UNIT[i.key]}`, { v: i.value })}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-muted">
                      {i.target == null
                        ? '–'
                        : `${i.higherIsBetter ? '≥' : '≤'} ${t(`qlt.ind.unit.${UNIT[i.key]}`, { v: i.target })}`}
                    </td>
                    <td className="px-3 py-2">
                      {i.met == null ? (
                        <span className="text-muted">{t('qlt.ind.noData')}</span>
                      ) : (
                        <StatusBadge
                          tone={i.met ? 'success' : 'critical'}
                          label={i.met ? t('qlt.ind.met') : t('qlt.ind.missed')}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </QueryView>
    </div>
  );
}

function IncidentSheet({ id, onClose }) {
  const { t } = useTranslation();
  const q = useIncidentQuery(id);
  const [investigate, saving] = useInvestigateMutation();
  const [done] = useActionDoneMutation();
  const [close, closing] = useCloseIncidentMutation();
  const [f, setF] = useState(null);
  const [act, setAct] = useState({ text: '', kind: 'CORRECTIVE', owner: '', dueOn: todayIST() });
  const [pending, setPending] = useState(null);
  const [run, failure] = useAction();
  const i = q.data;
  const form = f ?? { investigator: i?.investigator ?? '', rootCause: i?.rootCause ?? '' };
  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={i ? `${i.incidentNo} · ${t(`qlt.inc.types.${i.type}`)}` : t('qlt.inc.loading')}
      description={i ? `${i.location} · ${fmtDate(i.occurredAt)}` : undefined}
    >
      <QueryView query={q} rows={5}>
        {(x) => (
          <div className="flex flex-col gap-4 text-sm">
            {failure && <ApiErrorNotice error={failure} />}
            {pending && (
              <PendingApprovalNotice approvalId={pending} approver={t('qlt.inc.approver')} />
            )}
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                tone={SEVERITY_TONE[x.severity]}
                label={t(`qlt.inc.sev.${x.severity}`)}
              />
              <StatusBadge tone={INCIDENT_TONE[x.status]} label={t(`qlt.inc.status.${x.status}`)} />
              <span className="text-muted">
                {x.anonymous ? t('qlt.inc.anonymousReport') : t('qlt.inc.by', { by: x.reportedBy })}
              </span>
            </div>
            <p>{x.description}</p>
            {x.immediateAction && (
              <p className="text-muted">{t('qlt.inc.doneThen', { text: x.immediateAction })}</p>
            )}
            {x.status !== 'CLOSED' && x.status !== 'PENDING_CLOSURE' && (
              <Card title={t('qlt.inc.investigation')}>
                <div className="grid gap-3">
                  <FormField label={t('qlt.inc.investigator')}>
                    <Input
                      value={form.investigator}
                      onChange={(e) => setF({ ...form, investigator: e.target.value })}
                    />
                  </FormField>
                  <FormField label={t('qlt.inc.rootCause')}>
                    <Textarea
                      rows={3}
                      value={form.rootCause}
                      onChange={(e) => setF({ ...form, rootCause: e.target.value })}
                    />
                  </FormField>
                  <div className="flex flex-wrap items-end gap-2">
                    <FormField label={t('qlt.inc.action')} className="min-w-48 flex-1">
                      <Input
                        value={act.text}
                        onChange={(e) => setAct({ ...act, text: e.target.value })}
                      />
                    </FormField>
                    <FormField label={t('qlt.inc.kind')} className="w-40">
                      <Select
                        value={act.kind}
                        onChange={(e) => setAct({ ...act, kind: e.target.value })}
                        options={['CORRECTIVE', 'PREVENTIVE'].map((k) => ({
                          value: k,
                          label: t(`qlt.inc.kinds.${k}`),
                        }))}
                      />
                    </FormField>
                    <FormField label={t('qlt.inc.owner')} className="w-40">
                      <Input
                        value={act.owner}
                        onChange={(e) => setAct({ ...act, owner: e.target.value })}
                      />
                    </FormField>
                    <FormField label={t('qlt.inc.due')} className="w-40">
                      <Input
                        type="date"
                        value={act.dueOn}
                        onChange={(e) => setAct({ ...act, dueOn: e.target.value })}
                      />
                    </FormField>
                  </div>
                  <Button
                    className="self-start"
                    loading={saving.isLoading}
                    onClick={() =>
                      run(async () => {
                        await investigate({
                          id,
                          investigator: form.investigator.trim() || undefined,
                          rootCause: form.rootCause.trim() || undefined,
                          actions:
                            act.text.trim().length >= 3 && act.owner.trim()
                              ? [{ ...act, text: act.text.trim(), owner: act.owner.trim() }]
                              : undefined,
                        }).unwrap();
                        setAct({ ...act, text: '' });
                        setF(null);
                      })
                    }
                  >
                    {t('qlt.inc.save')}
                  </Button>
                </div>
              </Card>
            )}
            {x.actions.length > 0 && (
              <Card title={t('qlt.inc.capa')}>
                <ul className="flex flex-col divide-y divide-line">
                  {x.actions.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
                      <StatusBadge
                        tone={a.done ? 'success' : 'warning'}
                        label={t(`qlt.inc.kinds.${a.kind}`)}
                      />
                      <span className="flex-1">
                        {a.text} · {a.owner} · {fmtDate(a.dueOn)}
                      </span>
                      {!a.done && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => run(() => done({ id, actionId: a.id }).unwrap())}
                        >
                          {t('qlt.inc.markDone')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {x.status === 'CAPA' && (
              <Button
                className="self-start"
                loading={closing.isLoading}
                onClick={() =>
                  run(async () => {
                    const out = await close(id).unwrap();
                    setPending(out.approvalId);
                  })
                }
              >
                {t('qlt.inc.close')}
              </Button>
            )}
          </div>
        )}
      </QueryView>
    </Sheet>
  );
}

function IncidentsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [status, setStatus] = useUrlState('st', 'REPORTED,INVESTIGATING,CAPA,PENDING_CLOSURE');
  const [open, setOpen] = useUrlState('inc', '');
  const q = useIncidentsQuery({ status });
  const manage = can('quality:incident:update');
  return (
    <div className="flex flex-col gap-4">
      <IncidentForm />
      <FormField label={t('qlt.show')} className="w-56">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'REPORTED,INVESTIGATING,CAPA,PENDING_CLOSURE', label: t('qlt.inc.open') },
            { value: 'CLOSED', label: t('qlt.inc.status.CLOSED') },
          ]}
        />
      </FormField>
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('qlt.inc.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{i.incidentNo}</span>
                {manage ? (
                  <button
                    type="button"
                    className="font-semibold underline-offset-2 hover:underline"
                    onClick={() => setOpen(i.id)}
                  >
                    {t(`qlt.inc.types.${i.type}`)}
                  </button>
                ) : (
                  <span className="font-semibold">{t(`qlt.inc.types.${i.type}`)}</span>
                )}
                <span className="flex-1 text-muted">
                  {i.location} · {fmtDate(i.occurredAt)}
                </span>
                <StatusBadge
                  tone={SEVERITY_TONE[i.severity]}
                  label={t(`qlt.inc.sev.${i.severity}`)}
                />
                <StatusBadge
                  tone={INCIDENT_TONE[i.status]}
                  label={t(`qlt.inc.status.${i.status}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      {open && manage && <IncidentSheet id={open} onClose={() => setOpen('')} />}
    </div>
  );
}

function ComplaintRow({ c }) {
  const { t } = useTranslation();
  const can = useCan();
  const [act, state] = useComplaintActionMutation();
  const [note, setNote] = useState('');
  const [run, failure] = useAction();
  const manage = can('quality:complaint:update');
  const go = (action, extra = {}) =>
    run(() =>
      act({ id: c.id, action, ...extra })
        .unwrap()
        .then(() => setNote('')),
    );
  return (
    <li className="flex flex-col gap-2 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono">{c.complaintNo}</span>
        <StatusBadge tone={COMPLAINT_TONE[c.status]} label={t(`qlt.cmp.status.${c.status}`)} />
        {c.priority === 'HIGH' && <StatusBadge tone="critical" label={t('qlt.cmp.high')} />}
        {c.overdue && <StatusBadge tone="critical" label={t('qlt.cmp.overdue')} />}
        <span className="ml-auto text-muted">
          {t(`qlt.cmp.cat.${c.category}`)} · {t(`qlt.cmp.src.${c.source}`)} · {fmtDate(c.createdAt)}
        </span>
      </div>
      <p>
        {c.patient && <span className="font-semibold">{c.patient}: </span>}
        {c.description}
      </p>
      {(c.owner || c.resolution) && (
        <p className="text-xs text-muted">
          {c.owner && t('qlt.cmp.owner', { owner: c.owner })}
          {c.resolution && ` · ${c.resolution}`}
        </p>
      )}
      {failure && <ApiErrorNotice error={failure} />}
      {manage && c.status !== 'CLOSED' && (
        <div className="flex flex-wrap items-end gap-2">
          {c.status !== 'RESOLVED' && (
            <Input
              aria-label={t('qlt.cmp.note')}
              placeholder={
                ['OPEN', 'ESCALATED'].includes(c.status)
                  ? t('qlt.cmp.ownerHint')
                  : t('qlt.cmp.resolutionHint')
              }
              className="w-64"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
          {['OPEN', 'ESCALATED'].includes(c.status) && (
            <Button
              size="sm"
              disabled={!note.trim() || state.isLoading}
              onClick={() => go('ASSIGN', { owner: note.trim() })}
            >
              {t('qlt.cmp.assign')}
            </Button>
          )}
          {['OPEN', 'IN_PROGRESS'].includes(c.status) && (
            <Button
              size="sm"
              variant="secondary"
              disabled={state.isLoading}
              onClick={() => go('ESCALATE', { note: t('qlt.cmp.toMs') })}
            >
              {t('qlt.cmp.escalate')}
            </Button>
          )}
          {['OPEN', 'IN_PROGRESS', 'ESCALATED'].includes(c.status) && (
            <Button
              size="sm"
              disabled={!note.trim() || state.isLoading}
              onClick={() => go('RESOLVE', { note: note.trim() })}
            >
              {t('qlt.cmp.resolve')}
            </Button>
          )}
          {c.status === 'RESOLVED' && (
            <Button size="sm" disabled={state.isLoading} onClick={() => go('CLOSE')}>
              {t('qlt.cmp.close')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function ComplaintsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const q = useComplaintsQuery({ status: 'OPEN,IN_PROGRESS,ESCALATED,RESOLVED' });
  const [create, state] = useCreateComplaintMutation();
  const [f, setF] = useState({
    source: 'FRONT_OFFICE',
    contactName: '',
    contactMobile: '',
    category: 'OTHER',
    priority: 'NORMAL',
    description: '',
  });
  const [run, failure] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-4">
      {can('quality:complaint:create') && (
        <Card title={t('qlt.cmp.new')}>
          {failure && <ApiErrorNotice error={failure} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t('qlt.cmp.source')}>
              <Select
                value={f.source}
                onChange={set('source')}
                options={['FRONT_OFFICE', 'PHONE', 'EMAIL', 'WRITTEN'].map((s) => ({
                  value: s,
                  label: t(`qlt.cmp.src.${s}`),
                }))}
              />
            </FormField>
            <FormField label={t('qlt.cmp.name')}>
              <Input value={f.contactName} onChange={set('contactName')} />
            </FormField>
            <FormField label={t('qlt.cmp.mobile')}>
              <Input inputMode="numeric" value={f.contactMobile} onChange={set('contactMobile')} />
            </FormField>
            <FormField label={t('qlt.cmp.category')}>
              <Select
                value={f.category}
                onChange={set('category')}
                options={[
                  'BILLING',
                  'CLINICAL',
                  'NURSING',
                  'FACILITY',
                  'FOOD',
                  'STAFF_BEHAVIOUR',
                  'WAITING',
                  'OTHER',
                ].map((c) => ({
                  value: c,
                  label: t(`qlt.cmp.cat.${c}`),
                }))}
              />
            </FormField>
            <FormField label={t('qlt.cmp.priority')}>
              <Select
                value={f.priority}
                onChange={set('priority')}
                options={['HIGH', 'NORMAL', 'LOW'].map((p) => ({
                  value: p,
                  label: t(`qlt.cmp.prio.${p}`),
                }))}
              />
            </FormField>
            <FormField label={t('qlt.cmp.description')} className="sm:col-span-3">
              <Textarea rows={3} value={f.description} onChange={set('description')} />
            </FormField>
          </div>
          <Button
            className="mt-3"
            loading={state.isLoading}
            disabled={f.description.trim().length < 5}
            onClick={() =>
              run(async () => {
                const out = await create({
                  ...f,
                  contactName: f.contactName.trim() || undefined,
                  contactMobile: f.contactMobile.trim() || undefined,
                  description: f.description.trim(),
                }).unwrap();
                toast({ tone: 'success', title: t('qlt.cmp.created', { no: out.complaintNo }) });
                setF({ ...f, contactName: '', contactMobile: '', description: '' });
              })
            }
          >
            {t('qlt.cmp.register')}
          </Button>
        </Card>
      )}
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('qlt.cmp.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((c) => (
              <ComplaintRow key={c.id} c={c} />
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function FeedbackTab() {
  const { t } = useTranslation();
  const [from, setFrom] = useUrlState('from', `${monthIST()}-01`);
  const [to, setTo] = useUrlState('to', todayIST());
  const q = useFeedbackSummaryQuery({ from, to });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <FormField label={t('qlt.from')} className="w-40">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t('qlt.to')} className="w-40">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>
      <QueryView query={q} rows={4}>
        {(d) => (
          <div className="flex flex-col gap-3">
            <KpiRow
              items={[
                {
                  label: t('qlt.fbs.nps'),
                  value: d.nps == null ? '–' : String(d.nps),
                  tone: d.nps != null && d.nps < 0 ? 'critical' : undefined,
                },
                { label: t('qlt.fbs.responses'), value: String(d.responses) },
                { label: t('qlt.fbs.rate'), value: `${d.responseRate}%` },
                {
                  label: t('qlt.fbs.overall'),
                  value: d.averages.overall == null ? '–' : `${d.averages.overall} / 5`,
                },
              ]}
            />
            {d.byDepartment.length > 0 && (
              <table className="w-full text-sm">
                <caption className="sr-only">{t('qlt.fbs.byDept')}</caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('qlt.fbs.department')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('qlt.fbs.responses')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('qlt.fbs.overall')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('qlt.fbs.nps')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.byDepartment.map((r) => (
                    <tr key={r.department}>
                      <td className="px-3 py-2">{r.department}</td>
                      <td className="tabular px-3 py-2 text-right">{r.responses}</td>
                      <td className="tabular px-3 py-2 text-right">{r.overall}</td>
                      <td className="tabular px-3 py-2 text-right">{r.nps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <ul className="flex flex-col gap-2 text-sm">
              {d.comments.map((c, i) => (
                <li key={i} className="rounded-control border border-line px-3 py-2">
                  <p>“{c.comment}”</p>
                  <p className="text-xs text-muted">
                    {c.department} · {fmtDate(c.at)} · {c.overall}/5 · NPS {c.nps}
                    {c.complaintId && ` · ${t('qlt.fbs.complaint')}`}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </QueryView>
    </div>
  );
}

function AuditsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const templates = useAuditTemplatesQuery();
  const audits = useAuditsQuery();
  const [record, state] = useRecordAuditMutation();
  const [done] = useAuditActionDoneMutation();
  const [code, setCode] = useState('');
  const [area, setArea] = useState('');
  const [answers, setAnswers] = useState({});
  const [action, setAction] = useState({ text: '', owner: '', dueOn: todayIST() });
  const [run, failure] = useAction();
  const tpl = templates.data?.items.find((x) => x.code === code);
  return (
    <div className="flex flex-col gap-4">
      {can('quality:audit:create') && (
        <Card title={t('qlt.aud.new')}>
          {failure && <ApiErrorNotice error={failure} />}
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('qlt.aud.checklist')} className="w-72">
              <Select
                value={code}
                placeholder={t('qlt.aud.pick')}
                onChange={(e) => {
                  setCode(e.target.value);
                  setAnswers({});
                }}
                options={(templates.data?.items ?? []).map((x) => ({
                  value: x.code,
                  label: x.name,
                }))}
              />
            </FormField>
            <FormField label={t('qlt.aud.area')} className="w-56">
              <Input value={area} onChange={(e) => setArea(e.target.value)} />
            </FormField>
          </div>
          {tpl && (
            <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
              {tpl.items.map((item) => (
                <li key={item} className="flex flex-wrap items-center gap-3 py-1.5">
                  <span className="flex-1">{item}</span>
                  {['YES', 'NO', 'NA'].map((r) => (
                    <label key={r} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`${code}-${item}`}
                        checked={answers[item] === r}
                        onChange={() => setAnswers({ ...answers, [item]: r })}
                      />
                      {t(`qlt.aud.r.${r}`)}
                    </label>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {tpl && Object.values(answers).includes('NO') && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <FormField label={t('qlt.aud.action')} className="min-w-48 flex-1">
                <Input
                  value={action.text}
                  onChange={(e) => setAction({ ...action, text: e.target.value })}
                />
              </FormField>
              <FormField label={t('qlt.inc.owner')} className="w-40">
                <Input
                  value={action.owner}
                  onChange={(e) => setAction({ ...action, owner: e.target.value })}
                />
              </FormField>
              <FormField label={t('qlt.inc.due')} className="w-40">
                <Input
                  type="date"
                  value={action.dueOn}
                  onChange={(e) => setAction({ ...action, dueOn: e.target.value })}
                />
              </FormField>
            </div>
          )}
          <Button
            className="mt-3"
            loading={state.isLoading}
            disabled={
              !tpl || area.trim().length < 2 || Object.keys(answers).length !== tpl.items.length
            }
            onClick={() =>
              run(async () => {
                await record({
                  templateCode: code,
                  area: area.trim(),
                  answers: tpl.items.map((item) => ({ item, result: answers[item] })),
                  actions: action.text.trim()
                    ? [{ ...action, text: action.text.trim(), owner: action.owner.trim() }]
                    : [],
                }).unwrap();
                setAnswers({});
                setAction({ ...action, text: '' });
              })
            }
          >
            {t('qlt.aud.save')}
          </Button>
        </Card>
      )}
      <QueryView
        query={audits}
        rows={4}
        empty={<EmptyState bordered={false} title={t('qlt.aud.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{a.templateName}</span>
                  <span className="flex-1 text-muted">
                    {a.area} · {fmtDate(a.date)} · {a.auditor}
                  </span>
                  <StatusBadge
                    tone={a.score >= 90 ? 'success' : a.score >= 75 ? 'warning' : 'critical'}
                    label={`${a.score}%`}
                  />
                </div>
                {a.actions.map((x) => (
                  <p key={x.id} className="flex flex-wrap items-center gap-2 text-muted">
                    {x.done ? '✓' : '•'} {x.text} · {x.owner} · {fmtDate(x.dueOn)}
                    {!x.done && can('quality:audit:create') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(() => done({ id: a.id, actionId: x.id }).unwrap())}
                      >
                        {t('qlt.inc.markDone')}
                      </Button>
                    )}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

/** Policies and SOPs: drafts approved by a second person; staff acknowledge they have read them. */
export function DocumentsList() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can('quality:document:create');
  const q = useDocumentsQuery(manage ? 'ACTIVE,DRAFT' : undefined);
  const [draft, drafting] = useDraftDocumentMutation();
  const [approve] = useApproveDocumentMutation();
  const [ack] = useAcknowledgeDocumentMutation();
  const [f, setF] = useState({ code: '', title: '', kind: 'SOP', summary: '', reviewOn: '' });
  const [run, failure] = useAction();
  return (
    <div className="flex flex-col gap-4">
      {failure && <ApiErrorNotice error={failure} />}
      {manage && (
        <Card title={t('qlt.doc.new')}>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label={t('qlt.doc.code')}>
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </FormField>
            <FormField label={t('qlt.doc.title')} className="sm:col-span-2">
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </FormField>
            <FormField label={t('qlt.doc.kind')}>
              <Select
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value })}
                options={['POLICY', 'SOP', 'FORM', 'PROTOCOL'].map((k) => ({
                  value: k,
                  label: t(`qlt.doc.kinds.${k}`),
                }))}
              />
            </FormField>
            <FormField label={t('qlt.doc.summary')} className="sm:col-span-3">
              <Input value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
            </FormField>
            <FormField label={t('qlt.doc.review')}>
              <Input
                type="date"
                value={f.reviewOn}
                onChange={(e) => setF({ ...f, reviewOn: e.target.value })}
              />
            </FormField>
          </div>
          <Button
            className="mt-3"
            loading={drafting.isLoading}
            disabled={f.code.trim().length < 2 || f.title.trim().length < 3 || !f.reviewOn}
            onClick={() =>
              run(async () => {
                await draft({
                  ...f,
                  code: f.code.trim(),
                  title: f.title.trim(),
                  summary: f.summary.trim() || undefined,
                }).unwrap();
                setF({ code: '', title: '', kind: 'SOP', summary: '', reviewOn: '' });
              })
            }
          >
            {t('qlt.doc.saveDraft')}
          </Button>
        </Card>
      )}
      <QueryView
        query={q}
        rows={3}
        empty={<EmptyState bordered={false} title={t('qlt.doc.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">
                  {doc.code} v{doc.docVersion}
                </span>
                <span className="min-w-48 flex-1">
                  <span className="font-semibold">{doc.title}</span>
                  {doc.summary && <span className="block text-muted">{doc.summary}</span>}
                </span>
                <StatusBadge
                  tone={
                    doc.status === 'ACTIVE' ? (doc.reviewDue ? 'warning' : 'success') : 'neutral'
                  }
                  label={doc.reviewDue ? t('qlt.doc.reviewDue') : t(`qlt.doc.status.${doc.status}`)}
                />
                {manage && (
                  <span className="text-xs text-muted">
                    {t('qlt.doc.read', { n: doc.acknowledged })}
                  </span>
                )}
                {doc.status === 'DRAFT' && can('quality:document:approve') && (
                  <Button size="sm" onClick={() => run(() => approve(doc.id).unwrap())}>
                    {t('qlt.doc.approve')}
                  </Button>
                )}
                {doc.status === 'ACTIVE' &&
                  (doc.acknowledgedByMe ? (
                    <span className="text-xs text-muted">{t('qlt.doc.readByMe')}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => run(() => ack(doc.id).unwrap())}
                    >
                      {t('qlt.doc.ack')}
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function InfectionTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [month, setMonth] = useUrlState('month', monthIST());
  const q = useInfectionQuery(month);
  const [hai] = useRecordHaiMutation();
  const [days] = useSaveDeviceDaysMutation();
  const [c, setC] = useState({ type: 'CAUTI', ward: '', onsetOn: todayIST(), organism: '' });
  const [d, setD] = useState({
    ward: '',
    catheter: '',
    centralLine: '',
    ventilator: '',
    surgeries: '',
  });
  const [run, failure] = useAction();
  const edit = can('quality:infection:update');
  return (
    <div className="flex flex-col gap-4">
      <FormField label={t('qlt.month')} className="w-44">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </FormField>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView query={q} rows={3}>
        {(x) => (
          <>
            <KpiRow
              items={['cauti', 'clabsi', 'vap', 'ssi'].map((k) => ({
                label: t(`qlt.hai.${k}`),
                value: x[k].rate == null ? '–' : String(x[k].rate),
                sub: t('qlt.hai.cases', { count: x[k].cases }),
              }))}
            />
            <p className="text-xs text-muted">{t('qlt.hai.hint')}</p>
            {x.cases.length > 0 && (
              <ul className="text-sm">
                {x.cases.map((h) => (
                  <li key={h.id}>
                    {h.type} · {h.ward} · {fmtDate(h.onsetOn)} {h.patient && `· ${h.patient}`}{' '}
                    {h.organism && `· ${h.organism}`}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </QueryView>
      {edit && (
        <>
          <Card title={t('qlt.hai.newCase')}>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label={t('qlt.hai.type')} className="w-32">
                <Select
                  value={c.type}
                  onChange={(e) => setC({ ...c, type: e.target.value })}
                  options={['CAUTI', 'CLABSI', 'VAP', 'SSI'].map((v) => ({ value: v, label: v }))}
                />
              </FormField>
              <FormField label={t('qlt.hai.ward')} className="w-44">
                <Input value={c.ward} onChange={(e) => setC({ ...c, ward: e.target.value })} />
              </FormField>
              <FormField label={t('qlt.hai.onset')} className="w-40">
                <Input
                  type="date"
                  value={c.onsetOn}
                  onChange={(e) => setC({ ...c, onsetOn: e.target.value })}
                />
              </FormField>
              <FormField label={t('qlt.hai.organism')} className="w-44">
                <Input
                  value={c.organism}
                  onChange={(e) => setC({ ...c, organism: e.target.value })}
                />
              </FormField>
              <Button
                disabled={c.ward.trim().length < 2}
                onClick={() =>
                  run(() =>
                    hai({
                      ...c,
                      ward: c.ward.trim(),
                      organism: c.organism.trim() || undefined,
                    }).unwrap(),
                  )
                }
              >
                {t('qlt.hai.add')}
              </Button>
            </div>
          </Card>
          <Card title={t('qlt.hai.deviceDays')}>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label={t('qlt.hai.ward')} className="w-44">
                <Input value={d.ward} onChange={(e) => setD({ ...d, ward: e.target.value })} />
              </FormField>
              {['catheter', 'centralLine', 'ventilator', 'surgeries'].map((k) => (
                <FormField key={k} label={t(`qlt.hai.dd.${k}`)} className="w-32">
                  <Input
                    inputMode="numeric"
                    value={d[k]}
                    onChange={(e) => setD({ ...d, [k]: e.target.value })}
                  />
                </FormField>
              ))}
              <Button
                disabled={d.ward.trim().length < 2}
                onClick={() =>
                  run(() =>
                    days({
                      month,
                      ward: d.ward.trim(),
                      catheter: Number(d.catheter) || 0,
                      centralLine: Number(d.centralLine) || 0,
                      ventilator: Number(d.ventilator) || 0,
                      surgeries: Number(d.surgeries) || 0,
                    }).unwrap(),
                  )
                }
              >
                {t('qlt.hai.save')}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Quality (board Quality, route /quality): monthly indicators against targets, incidents with
 * root cause and CAPA, complaints with turnaround, patient feedback and NPS, audits, controlled
 * documents and infection control.
 */
export default function QualityPage() {
  useStrings(addDxkitStrings, addQualityStrings);
  const { t } = useTranslation();
  const can = useCan();
  const ov = useQltOverviewQuery(undefined, { skip: !can('quality:incident:read') });
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('qlt.crumb') }, { label: t('qlt.title') }]}
        title={t('qlt.title')}
        description={t('qlt.description')}
      />
      {ov.data && (
        <KpiRow
          items={[
            { label: t('qlt.kpi.incidents'), value: String(ov.data.incidentsOpen) },
            { label: t('qlt.kpi.complaints'), value: String(ov.data.complaintsOpen) },
            {
              label: t('qlt.kpi.overdue'),
              value: String(ov.data.complaintsOverdue),
              tone: ov.data.complaintsOverdue ? 'critical' : undefined,
            },
            {
              label: t('qlt.kpi.review'),
              value: String(ov.data.documentsForReview),
              tone: ov.data.documentsForReview ? 'warning' : undefined,
            },
          ]}
        />
      )}
      <UrlTabs
        param="tab"
        label={t('qlt.tabsLabel')}
        reset={['month', 'st', 'inc', 'from', 'to']}
        tabs={[
          can('quality:indicator:read') && {
            id: 'indicators',
            label: t('qlt.tabs.indicators'),
            body: <IndicatorsTab />,
          },
          { id: 'incidents', label: t('qlt.tabs.incidents'), body: <IncidentsTab /> },
          can('quality:complaint:read') && {
            id: 'complaints',
            label: t('qlt.tabs.complaints'),
            body: <ComplaintsTab />,
          },
          can('quality:feedback:read') && {
            id: 'feedback',
            label: t('qlt.tabs.feedback'),
            body: <FeedbackTab />,
          },
          can('quality:audit:read') && {
            id: 'audits',
            label: t('qlt.tabs.audits'),
            body: <AuditsTab />,
          },
          { id: 'documents', label: t('qlt.tabs.documents'), body: <DocumentsList /> },
          can('quality:infection:read') && {
            id: 'infection',
            label: t('qlt.tabs.infection'),
            body: <InfectionTab />,
          },
        ]}
      />
    </Page>
  );
}
