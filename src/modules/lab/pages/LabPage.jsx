import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addLabStrings } from '@hms/i18n/lab';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  PatientBanner,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDateTime, fmtTime, localeOf } from '../../dx-kit/format.js';
import {
  useAmendResultMutation,
  useCriticalCallsQuery,
  useLabCountsQuery,
  useLabItemQuery,
  useLabItemsQuery,
  useLogCallMutation,
  useQcStatusQuery,
  useReleaseResultMutation,
  useVerifyResultMutation,
} from '../api.js';
import { DEPARTMENTS, PRIORITY_TONE, STATUS_TONE, minutesLeft } from '../lab.js';
import { ResultForm } from '../components/ResultForm.jsx';
import { ResultsTable } from '../components/ResultsTable.jsx';

const STAGES = ['results', 'verify', 'validate', 'released'];

function Due({ item }) {
  const { t } = useTranslation();
  const left = minutesLeft(item.dueAt);
  if (left == null || item.status === 'RELEASED') return null;
  return left < 0 ? (
    <StatusBadge tone="critical" label={t('lab.due.late', { min: -left })} />
  ) : (
    <span className="text-sm text-muted">{t('lab.due.in', { min: left })}</span>
  );
}

function HoldBanners({ item }) {
  const { t } = useTranslation();
  const open = item.holds.filter((h) => h.open);
  if (!open.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {open.map((h) => (
        <Banner key={h.id} tone={h.kind === 'DELTA' ? 'warning' : 'critical'}>
          <strong>{t(`lab.hold.${h.kind}`)}</strong> {h.note}
        </Banner>
      ))}
    </div>
  );
}

/** Pathologist: validate and release (R9); a delta hold needs the box ticked and a comment (R8). */
function ReleaseForm({ item }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [comment, setComment] = useState('');
  const [acceptDelta, setAcceptDelta] = useState(false);
  const [failure, setFailure] = useState(null);
  const [release, state] = useReleaseResultMutation();
  const delta = item.holds.some((h) => h.kind === 'DELTA' && h.open);
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <ApiErrorNotice error={failure} />
      <FormField label={t('lab.rel.comment')} optional={!delta} required={delta}>
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </FormField>
      {delta && (
        <Checkbox
          checked={acceptDelta}
          onChange={(e) => setAcceptDelta(e.target.checked)}
          label={t('lab.rel.acceptDelta')}
        />
      )}
      <p className="text-sm text-muted">{t('lab.rel.hint')}</p>
      <div>
        <Button
          loading={state.isLoading}
          disabled={delta && !(acceptDelta && comment.trim())}
          onClick={async () => {
            setFailure(null);
            try {
              await release({
                id: item.id,
                comment: comment.trim() || undefined,
                acceptDelta,
              }).unwrap();
              toast({ tone: 'success', title: t('lab.rel.released', { test: item.name }) });
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t('lab.rel.release')}
        </Button>
      </div>
    </div>
  );
}

/** A released report is never edited: the change goes for approval as a new version (R10). */
function AmendDialog({ item, open, onOpenChange, onPending }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [values, setValues] = useState(() =>
    Object.fromEntries(item.results.filter((r) => r.value).map((r) => [r.code, r.value])),
  );
  const [failure, setFailure] = useState(null);
  const [amend, state] = useAmendResultMutation();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('lab.amend.title', { test: item.name })}
      size="md"
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setFailure(null);
          try {
            const r = await amend({
              id: item.id,
              reason: reason.trim(),
              results: Object.entries(values).map(([code, value]) => ({
                code,
                value: String(value),
              })),
            }).unwrap();
            onPending(r.approvalId ?? null);
            onOpenChange(false);
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        <ApiErrorNotice error={failure} />
        <p className="text-sm text-muted">{t('lab.amend.hint')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {item.results
            .filter((r) => r.value)
            .map((r) => (
              <FormField key={r.code} label={r.unit ? `${r.name} (${r.unit})` : r.name}>
                <Input
                  value={values[r.code] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [r.code]: e.target.value }))}
                />
              </FormField>
            ))}
        </div>
        <FormField label={t('lab.amend.reason')} required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={state.isLoading} disabled={reason.trim().length < 5}>
            {t('lab.amend.send')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ItemDetail({ id }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const q = useLabItemQuery(id);
  const [verify, verifying] = useVerifyResultMutation();
  const [failure, setFailure] = useState(null);
  const [amending, setAmending] = useState(false);
  const [approvalId, setApprovalId] = useState(null);
  return (
    <QueryView query={q} rows={8}>
      {(i) => (
        <Card>
          <div className="flex flex-col gap-4">
            <PatientBanner
              name={i.patient.name}
              age={i.patient.age}
              sex={i.patient.gender}
              uhid={i.patient.uhid}
              bed={i.location ?? undefined}
              consultant={i.doctor?.name}
            />
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{i.name}</h2>
              <StatusBadge tone={STATUS_TONE[i.status]} label={t(`lab.status.${i.status}`)} />
              {i.priority !== 'ROUTINE' && (
                <StatusBadge
                  tone={PRIORITY_TONE[i.priority]}
                  label={t(`lab.priority.${i.priority}`)}
                />
              )}
              {i.sensitive && <StatusBadge tone="accent" label={t('lab.sensitive')} />}
              <Due item={i} />
            </div>
            <p className="text-sm text-muted">
              {[
                i.orderNo,
                i.sampleNo && t('lab.sampleNo', { no: i.sampleNo }),
                t(`lab.dept.${i.department}`),
                i.analyser,
                i.receivedAt && t('lab.receivedAt', { time: fmtDateTime(i.receivedAt, locale) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {i.clinicalNotes && <p className="text-sm">{i.clinicalNotes}</p>}
            <HoldBanners item={i} />
            <ApiErrorNotice error={failure} />

            {['RECEIVED', 'RESULTED'].includes(i.status) && can('lab:result:enter') && (
              <ResultForm key={`${i.id}-${i.enteredAt ?? 'new'}`} item={i} />
            )}
            {i.status !== 'RECEIVED' && i.results.some((r) => r.value) && (
              <ResultsTable results={i.results} caption={i.name} />
            )}
            {i.comment && i.status !== 'RECEIVED' && (
              <p className="text-sm whitespace-pre-line">{i.comment}</p>
            )}
            {i.status === 'RESULTED' && can('lab:result:verify') && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <Button
                  variant="secondary"
                  loading={verifying.isLoading}
                  onClick={async () => {
                    setFailure(null);
                    try {
                      await verify(i.id).unwrap();
                      toast({ tone: 'success', title: t('lab.res.verified') });
                    } catch (err) {
                      setFailure(err);
                    }
                  }}
                >
                  {t('lab.res.verify')}
                </Button>
                <span className="text-sm text-muted">
                  {t('lab.res.enteredBy', { by: i.enteredBy, time: fmtTime(i.enteredAt, locale) })}
                </span>
              </div>
            )}
            {i.status === 'VERIFIED' && (
              <>
                <p className="text-sm text-muted">
                  {t('lab.res.byLine', { entered: i.enteredBy, verified: i.verifiedBy })}
                </p>
                {can('lab:result:release') && <ReleaseForm item={i} />}
              </>
            )}
            {i.status === 'RELEASED' && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <span className="text-sm text-muted">
                  {t('lab.rel.by', {
                    by: i.releasedBy,
                    time: fmtDateTime(i.releasedAt, locale),
                    v: i.reportVersion,
                  })}
                </span>
                <Link
                  className="text-sm font-semibold text-primary underline"
                  to={`/lab/report/${encodeURIComponent(i.orderNo)}`}
                >
                  {t('lab.rel.report')}
                </Link>
                {can('lab:result:amend') && (
                  <Button size="sm" variant="ghost" onClick={() => setAmending(true)}>
                    {t('lab.amend.open')}
                  </Button>
                )}
              </div>
            )}
            {approvalId && (
              <PendingApprovalNotice approvalId={approvalId}>
                {t('lab.amend.pending')}
              </PendingApprovalNotice>
            )}
            {amending && (
              <AmendDialog
                item={i}
                open={amending}
                onOpenChange={setAmending}
                onPending={setApprovalId}
              />
            )}
          </div>
        </Card>
      )}
    </QueryView>
  );
}

function StageList({ stage, department, priority, q }) {
  const { t } = useTranslation();
  const [id, setId] = useUrlState('id', '');
  const list = useLabItemsQuery({
    stage,
    department: department || undefined,
    priority: priority || undefined,
    q: q || undefined,
  });
  const items = list.data?.items ?? [];
  const current = items.some((x) => x.id === id) ? id : (items[0]?.id ?? '');
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title={t(`lab.stage.${stage}`)}>
        <QueryView
          query={list}
          empty={<EmptyState bordered={false} title={t('lab.none')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <PickList
              label={t(`lab.stage.${stage}`)}
              selectedId={current}
              onPick={(v) => setId(v)}
              items={d.items.map((x) => ({
                id: x.id,
                lead: x.sampleNo ?? x.orderNo,
                title: `${x.name} · ${x.patient.name}`,
                sub: [x.location, x.patient.uhid].filter(Boolean).join(' · '),
                badge: x.holds.some((h) => h.open)
                  ? { tone: 'critical', label: t('lab.held') }
                  : x.overdue
                    ? { tone: 'critical', label: t('lab.overdue') }
                    : x.priority !== 'ROUTINE'
                      ? { tone: PRIORITY_TONE[x.priority], label: t(`lab.priority.${x.priority}`) }
                      : { tone: STATUS_TONE[x.status], label: t(`lab.status.${x.status}`) },
              }))}
            />
          )}
        </QueryView>
      </Card>
      {current ? <ItemDetail key={current} id={current} /> : <EmptyState title={t('lab.pick')} />}
    </div>
  );
}

/** Critical values to phone (R7): reached with read-back closes the call; not reached is logged. */
function CallsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const calls = useCriticalCallsQuery({ open: true });
  const [logging, setLogging] = useState(null);
  const [to, setTo] = useState('');
  const [role, setRole] = useState('DOCTOR');
  const [reached, setReached] = useState(true);
  const [readBack, setReadBack] = useState(false);
  const [failure, setFailure] = useState(null);
  const [log, state] = useLogCallMutation();
  return (
    <>
      <QueryView
        query={calls}
        empty={<EmptyState bordered={false} title={t('lab.calls.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <span className="min-w-0 flex-1">
                  <strong className="text-critical">
                    {c.analyte} {c.value}
                  </strong>{' '}
                  <span className="text-sm text-ink">· {c.patient.name}</span>
                  <span className="block text-sm text-muted">
                    {[
                      c.location,
                      c.doctor,
                      t('lab.calls.dueBy', { time: fmtTime(c.dueAt, locale) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {c.attempts.length > 0 &&
                      ` · ${t('lab.calls.attempts', { count: c.attempts.length })}`}
                  </span>
                </span>
                {c.overdue && <StatusBadge tone="critical" label={t('lab.calls.overdue')} />}
                {c.escalatedAt && <StatusBadge tone="warning" label={t('lab.calls.escalated')} />}
                {can('lab:critical:log') && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setLogging(c);
                      setTo(c.doctor ?? '');
                      setReached(true);
                      setReadBack(false);
                      setFailure(null);
                    }}
                  >
                    {t('lab.calls.log')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <Dialog
        open={Boolean(logging)}
        onOpenChange={(v) => !v && setLogging(null)}
        title={
          logging ? t('lab.calls.logTitle', { analyte: logging.analyte, value: logging.value }) : ''
        }
        size="md"
      >
        {logging && (
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setFailure(null);
              try {
                const r = await log({
                  id: logging.id,
                  to: to.trim(),
                  role,
                  reached,
                  readBack,
                }).unwrap();
                toast({
                  tone: r.status === 'DONE' ? 'success' : 'warning',
                  title: t(r.status === 'DONE' ? 'lab.calls.done' : 'lab.calls.notReached'),
                });
                setLogging(null);
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            <ApiErrorNotice error={failure} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t('lab.calls.to')} required>
                <Input value={to} onChange={(e) => setTo(e.target.value)} />
              </FormField>
              <FormField label={t('lab.calls.role')}>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={['DOCTOR', 'NURSE', 'HOD', 'MEDICAL_SUPERINTENDENT'].map((r) => ({
                    value: r,
                    label: t(`lab.calls.roles.${r}`),
                  }))}
                />
              </FormField>
            </div>
            <Checkbox
              checked={reached}
              onChange={(e) => setReached(e.target.checked)}
              label={t('lab.calls.reached')}
            />
            {reached && (
              <Checkbox
                checked={readBack}
                onChange={(e) => setReadBack(e.target.checked)}
                label={t('lab.calls.readBack', { value: logging.value })}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLogging(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                loading={state.isLoading}
                disabled={to.trim().length < 2 || (reached && !readBack)}
              >
                {t('lab.calls.save')}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

/**
 * Laboratory worklists (board Lab, route /lab): result entry, technical verification, the
 * pathologist's validation and release, released reports and critical-value calls, with the
 * analysers' QC state on top (rule R4). Collection and receipt are on /lab/samples.
 */
export default function LabPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addLabStrings);
  const { t } = useTranslation();
  const [department, setDepartment] = useUrlState('department', '');
  const [priority, setPriority] = useUrlState('priority', '');
  const [q, setQ] = useUrlState('search', '');
  const counts = useLabCountsQuery().data;
  const calls = useCriticalCallsQuery({ open: true }).data;
  const qc = useQcStatusQuery().data;
  const down = (qc?.items ?? []).filter((a) => !a.ok);
  const filters = { department, priority, q };
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.crumb') }, { label: t('lab.title') }]}
        title={t('lab.title')}
        description={t('lab.description')}
        actions={
          <Link className="text-sm font-semibold text-primary underline" to="/lab/samples">
            {t('lab.toSamples')}
          </Link>
        }
      />
      {down.map((a) => (
        <Banner key={a.analyser} tone="critical">
          {a.message}
        </Banner>
      ))}
      {calls?.items?.length > 0 && (
        <Banner tone="critical">{t('lab.calls.banner', { count: calls.items.length })}</Banner>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('lab.filter.department')} className="w-56">
          <Select
            value={department}
            placeholder={t('lab.filter.allDepartments')}
            onChange={(e) => setDepartment(e.target.value)}
            options={DEPARTMENTS.map((d) => ({ value: d, label: t(`lab.dept.${d}`) }))}
          />
        </FormField>
        <FormField label={t('lab.filter.priority')} className="w-40">
          <Select
            value={priority}
            placeholder={t('lab.filter.anyPriority')}
            onChange={(e) => setPriority(e.target.value)}
            options={['STAT', 'URGENT', 'ROUTINE'].map((p) => ({
              value: p,
              label: t(`lab.priority.${p}`),
            }))}
          />
        </FormField>
        <FormField label={t('lab.filter.search')} className="w-64">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </FormField>
      </div>
      <UrlTabs
        param="stage"
        label={t('lab.tabsLabel')}
        tabs={[
          ...STAGES.map((s) => ({
            id: s,
            label: t(`lab.stage.${s}`),
            count: s === 'released' ? undefined : counts?.[s],
            body: <StageList stage={s} {...filters} />,
          })),
          {
            id: 'calls',
            label: t('lab.stage.calls'),
            count: calls?.items?.length,
            body: <CallsTab />,
          },
        ]}
      />
    </Page>
  );
}
