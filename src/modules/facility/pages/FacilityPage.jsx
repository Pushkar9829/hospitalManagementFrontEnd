import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addFacilityStrings } from '@hms/i18n/facility';
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
  ASSET_TONE,
  PORTER_TONE,
  useAssetQuery,
  useAssetStatusMutation,
  useAssetsDueQuery,
  useAssetsQuery,
  useBedCleaningQuery,
  useFacCleaningDoneMutation,
  useCondemnLinenMutation,
  useCreateAssetMutation,
  useCreateScheduleMutation,
  useFacSettingsQuery,
  useHkRoundsQuery,
  useIssueLinenMutation,
  useLaundryQuery,
  useLinenQuery,
  useMovePorterMutation,
  usePortersQuery,
  useReceiveLaundryMutation,
  useRecordPmMutation,
  useRecordWasteMutation,
  useRequestPorterMutation,
  useRoundDoneMutation,
  useRoundVerifyMutation,
  useSendLaundryMutation,
  useWasteHandoverMutation,
  useWasteQuery,
  useWasteReportQuery,
} from '../api.js';
import { TicketForm, TicketList } from '../components/Tickets.jsx';

const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const COLOURS = ['yellow', 'red', 'white', 'blue'];

/** Runs an async action, keeping its failure for an ApiErrorNotice. */
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

function BedsTab() {
  const { t } = useTranslation();
  const q = useBedCleaningQuery('OPEN');
  const [done, state] = useFacCleaningDoneMutation();
  const [run, failure] = useAction();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('fac.beds.hint')}</p>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('fac.beds.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="w-20 font-mono font-semibold">{x.bed}</span>
                <span className="flex-1">{x.ward}</span>
                <StatusBadge
                  tone={x.type === 'TERMINAL' ? 'warning' : 'neutral'}
                  label={t(`fac.beds.type.${x.type}`)}
                />
                <span
                  className={`tabular ${x.overdue ? 'font-semibold text-critical' : 'text-muted'}`}
                >
                  {t('fac.beds.minutes', { min: x.minutes, target: x.target })}
                </span>
                <Button
                  size="sm"
                  disabled={state.isLoading}
                  onClick={() => run(() => done(x.id).unwrap())}
                >
                  {t('fac.beds.done')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function RoundCard({ r }) {
  const { t } = useTranslation();
  const can = useCan();
  const [checked, setChecked] = useState(() => r.items.filter((i) => i.ok).map((i) => i.text));
  const [remarks, setRemarks] = useState('');
  const [done, doing] = useRoundDoneMutation();
  const [verify, verifying] = useRoundVerifyMutation();
  const [run, failure] = useAction();
  return (
    <li className="flex flex-col gap-2 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono">{r.time}</span>
        <span className="flex-1 font-semibold">{r.area}</span>
        <StatusBadge
          tone={
            r.status === 'VERIFIED'
              ? 'success'
              : r.status === 'DONE'
                ? 'info'
                : r.overdue
                  ? 'critical'
                  : 'warning'
          }
          label={r.overdue ? t('fac.rounds.overdue') : t(`fac.rounds.status.${r.status}`)}
        />
      </div>
      {failure && <ApiErrorNotice error={failure} />}
      {r.status === 'DUE' && can('facility:housekeeping:update') ? (
        <>
          <div className="flex flex-wrap gap-3">
            {r.items.map((i) => (
              <label key={i.text} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked.includes(i.text)}
                  onChange={(e) =>
                    setChecked((cs) =>
                      e.target.checked ? [...cs, i.text] : cs.filter((x) => x !== i.text),
                    )
                  }
                />
                {i.text}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              aria-label={t('fac.rounds.remarks')}
              placeholder={t('fac.rounds.remarks')}
              className="w-64"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <Button
              size="sm"
              loading={doing.isLoading}
              onClick={() =>
                run(() =>
                  done({ id: r.id, done: checked, remarks: remarks.trim() || undefined }).unwrap(),
                )
              }
            >
              {t('fac.rounds.markDone')}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted">
          {r.items.map((i) => `${i.ok ? '✓' : '✗'} ${i.text}`).join(' · ')}
          {r.doneBy && ` · ${t('fac.rounds.doneBy', { by: r.doneBy })}`}
          {r.verifiedBy && ` · ${t('fac.rounds.verifiedBy', { by: r.verifiedBy })}`}
          {r.remarks && ` · ${r.remarks}`}
        </p>
      )}
      {r.status === 'DONE' && can('facility:housekeeping:verify') && (
        <Button
          size="sm"
          className="self-start"
          variant="secondary"
          loading={verifying.isLoading}
          onClick={() => run(() => verify(r.id).unwrap())}
        >
          {t('fac.rounds.verify')}
        </Button>
      )}
    </li>
  );
}

function RoundsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [date, setDate] = useUrlState('date', todayIST());
  const q = useHkRoundsQuery(date);
  const [create, creating] = useCreateScheduleMutation();
  const [f, setF] = useState({ area: '', kind: 'WARD', times: '08:00, 16:00', checklist: '' });
  const [run, failure] = useAction();
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('fac.date')} className="w-44">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('fac.rounds.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((r) => (
              <RoundCard key={r.id} r={r} />
            ))}
          </ul>
        )}
      </QueryView>
      {can('facility:housekeeping:update') && (
        <Card title={t('fac.rounds.newSchedule')}>
          {failure && <ApiErrorNotice error={failure} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t('fac.rounds.area')}>
              <Input value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
            </FormField>
            <FormField label={t('fac.rounds.kind')}>
              <Select
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value })}
                options={['WARD', 'TOILET', 'OPD', 'ICU', 'OT', 'COMMON'].map((k) => ({
                  value: k,
                  label: t(`fac.rounds.kinds.${k}`),
                }))}
              />
            </FormField>
            <FormField label={t('fac.rounds.times')} hint={t('fac.rounds.timesHint')}>
              <Input value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} />
            </FormField>
            <FormField
              label={t('fac.rounds.checklist')}
              hint={t('fac.rounds.checklistHint')}
              className="sm:col-span-3"
            >
              <Input
                value={f.checklist}
                onChange={(e) => setF({ ...f, checklist: e.target.value })}
              />
            </FormField>
          </div>
          <Button
            className="mt-3"
            loading={creating.isLoading}
            disabled={f.area.trim().length < 2 || !f.checklist.trim()}
            onClick={() =>
              run(async () => {
                await create({
                  area: f.area.trim(),
                  kind: f.kind,
                  times: f.times
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                  checklist: f.checklist
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                }).unwrap();
                setF({ ...f, area: '', checklist: '' });
              })
            }
          >
            {t('fac.rounds.add')}
          </Button>
        </Card>
      )}
    </div>
  );
}

function AssetSheet({ id, onClose }) {
  const { t } = useTranslation();
  const can = useCan();
  const q = useAssetQuery(id);
  const [pm, pmState] = useRecordPmMutation();
  const [status, statusState] = useAssetStatusMutation();
  const [f, setF] = useState({ kind: 'PM', passed: 'yes', notes: '' });
  const [reason, setReason] = useState('');
  const [run, failure] = useAction();
  const a = q.data;
  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={a ? `${a.code} · ${a.name}` : t('fac.eq.loading')}
      description={
        a ? [a.make, a.model, a.serialNo, a.location].filter(Boolean).join(' · ') : undefined
      }
    >
      <QueryView query={q} rows={5}>
        {(x) => (
          <div className="flex flex-col gap-4 text-sm">
            {failure && <ApiErrorNotice error={failure} />}
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={ASSET_TONE[x.status]} label={t(`fac.eq.status.${x.status}`)} />
              <StatusBadge
                tone={x.riskClass === 'A' ? 'critical' : 'neutral'}
                label={t('fac.eq.risk', { cls: x.riskClass })}
              />
              {x.pmOverdue && <StatusBadge tone="warning" label={t('fac.eq.pmOverdue')} />}
              {x.calibrationOverdue && (
                <StatusBadge tone="warning" label={t('fac.eq.calOverdue')} />
              )}
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ['nextPm', x.nextPmDue && fmtDate(x.nextPmDue)],
                ['nextCal', x.nextCalibrationDue && fmtDate(x.nextCalibrationDue)],
                ['warranty', x.warrantyUntil && fmtDate(x.warrantyUntil)],
                [
                  'amc',
                  x.amc &&
                    t('fac.eq.amcLine', {
                      kind: x.amc.kind,
                      vendor: x.amc.vendor,
                      until: fmtDate(x.amc.until),
                    }),
                ],
                ['downtime', t('fac.eq.minutes', { min: x.downtimeMin })],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted">{t(`fac.eq.f.${k}`)}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
            </dl>
            {can('facility:asset:update') && (
              <Card title={t('fac.eq.recordPm')}>
                <div className="flex flex-wrap items-end gap-3">
                  <FormField label={t('fac.eq.kind')} className="w-40">
                    <Select
                      value={f.kind}
                      onChange={(e) => setF({ ...f, kind: e.target.value })}
                      options={['PM', 'CALIBRATION'].map((k) => ({
                        value: k,
                        label: t(`fac.eq.kinds.${k}`),
                      }))}
                    />
                  </FormField>
                  <FormField label={t('fac.eq.result')} className="w-32">
                    <Select
                      value={f.passed}
                      onChange={(e) => setF({ ...f, passed: e.target.value })}
                      options={[
                        { value: 'yes', label: t('fac.eq.passed') },
                        { value: 'no', label: t('fac.eq.failed') },
                      ]}
                    />
                  </FormField>
                  <FormField label={t('fac.eq.notes')} className="min-w-48 flex-1">
                    <Input
                      value={f.notes}
                      onChange={(e) => setF({ ...f, notes: e.target.value })}
                    />
                  </FormField>
                  <Button
                    loading={pmState.isLoading}
                    onClick={() =>
                      run(() =>
                        pm({
                          id,
                          kind: f.kind,
                          passed: f.passed === 'yes',
                          notes: f.notes.trim() || undefined,
                        }).unwrap(),
                      )
                    }
                  >
                    {t('fac.eq.save')}
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <FormField label={t('fac.eq.reason')} className="min-w-48 flex-1">
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                  </FormField>
                  <Button
                    variant={x.status === 'IN_SERVICE' ? 'danger' : 'secondary'}
                    loading={statusState.isLoading}
                    disabled={reason.trim().length < 3}
                    onClick={() =>
                      run(() =>
                        status({
                          id,
                          status: x.status === 'IN_SERVICE' ? 'OUT_OF_SERVICE' : 'IN_SERVICE',
                          reason: reason.trim(),
                        }).unwrap(),
                      )
                    }
                  >
                    {x.status === 'IN_SERVICE' ? t('fac.eq.takeOut') : t('fac.eq.backIn')}
                  </Button>
                </div>
              </Card>
            )}
            <Card title={t('fac.eq.history')}>
              <ul className="flex flex-col gap-1">
                {[...x.history].reverse().map((h, i) => (
                  <li key={i}>
                    {fmtDate(h.at)} · {h.text} · <span className="text-muted">{h.by}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </QueryView>
    </Sheet>
  );
}

function AssetForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [f, setF] = useState({
    code: '',
    name: '',
    category: 'BIOMEDICAL',
    serialNo: '',
    location: '',
    riskClass: 'B',
    pmEveryDays: '180',
    calibrationEveryDays: '',
    amcVendor: '',
    amcKind: 'AMC',
    amcFrom: '',
    amcUntil: '',
  });
  const [create, state] = useCreateAssetMutation();
  const [run, failure] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('fac.eq.add')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="grid gap-3 sm:grid-cols-4">
        {['code', 'name', 'serialNo', 'location'].map((k) => (
          <FormField key={k} label={t(`fac.eq.f.${k}`)}>
            <Input value={f[k]} onChange={set(k)} />
          </FormField>
        ))}
        <FormField label={t('fac.eq.f.category')}>
          <Select
            value={f.category}
            onChange={set('category')}
            options={['BIOMEDICAL', 'ELECTRICAL', 'HVAC', 'IT', 'FURNITURE', 'OTHER'].map((c) => ({
              value: c,
              label: t(`fac.eq.cat.${c}`),
            }))}
          />
        </FormField>
        <FormField label={t('fac.eq.f.riskClass')}>
          <Select
            value={f.riskClass}
            onChange={set('riskClass')}
            options={['A', 'B', 'C'].map((c) => ({ value: c, label: t(`fac.eq.riskClass.${c}`) }))}
          />
        </FormField>
        <FormField label={t('fac.eq.f.pmEvery')}>
          <Input inputMode="numeric" value={f.pmEveryDays} onChange={set('pmEveryDays')} />
        </FormField>
        <FormField label={t('fac.eq.f.calEvery')}>
          <Input
            inputMode="numeric"
            value={f.calibrationEveryDays}
            onChange={set('calibrationEveryDays')}
          />
        </FormField>
        <FormField label={t('fac.eq.f.amcVendor')}>
          <Input value={f.amcVendor} onChange={set('amcVendor')} />
        </FormField>
        <FormField label={t('fac.eq.f.amcKind')}>
          <Select
            value={f.amcKind}
            onChange={set('amcKind')}
            options={['AMC', 'CMC'].map((k) => ({ value: k, label: k }))}
          />
        </FormField>
        <FormField label={t('fac.eq.f.amcFrom')}>
          <Input type="date" value={f.amcFrom} onChange={set('amcFrom')} />
        </FormField>
        <FormField label={t('fac.eq.f.amcUntil')}>
          <Input type="date" value={f.amcUntil} onChange={set('amcUntil')} />
        </FormField>
      </div>
      <Button
        className="mt-3"
        loading={state.isLoading}
        disabled={!f.code.trim() || !f.name.trim() || f.location.trim().length < 2}
        onClick={() =>
          run(async () => {
            const out = await create({
              code: f.code.trim(),
              name: f.name.trim(),
              category: f.category,
              serialNo: f.serialNo.trim() || undefined,
              location: f.location.trim(),
              riskClass: f.riskClass,
              pmEveryDays: Number(f.pmEveryDays) || undefined,
              calibrationEveryDays: Number(f.calibrationEveryDays) || undefined,
              amc:
                f.amcVendor.trim() && f.amcFrom && f.amcUntil
                  ? {
                      vendor: f.amcVendor.trim(),
                      kind: f.amcKind,
                      from: f.amcFrom,
                      until: f.amcUntil,
                    }
                  : undefined,
            }).unwrap();
            toast({ tone: 'success', title: t('fac.eq.added', { code: out.code }) });
            setF({ ...f, code: '', name: '', serialNo: '' });
          })
        }
      >
        {t('fac.eq.save')}
      </Button>
    </Card>
  );
}

function EquipmentTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [q, setQ] = useUrlState('search', '');
  const [open, setOpen] = useUrlState('asset', '');
  const list = useAssetsQuery({ q: q || undefined });
  const due = useAssetsDueQuery();
  return (
    <div className="flex flex-col gap-3">
      {due.data && (
        <KpiRow
          items={[
            {
              label: t('fac.eq.duePm'),
              value: String(due.data.pm.length),
              tone: due.data.pm.length ? 'warning' : undefined,
            },
            {
              label: t('fac.eq.dueCal'),
              value: String(due.data.calibration.length),
              tone: due.data.calibration.length ? 'warning' : undefined,
            },
            {
              label: t('fac.eq.dueAmc'),
              value: String(due.data.amc.length),
              tone: due.data.amc.length ? 'warning' : undefined,
            },
          ]}
        />
      )}
      <FormField label={t('fac.eq.search')} className="w-64">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </FormField>
      <QueryView
        query={list}
        rows={5}
        empty={<EmptyState bordered={false} title={t('fac.eq.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="w-24 font-mono">{a.code}</span>
                <button
                  type="button"
                  className="min-w-40 flex-1 text-left font-semibold underline-offset-2 hover:underline"
                  onClick={() => setOpen(a.id)}
                >
                  {a.name}
                </button>
                <span className="text-muted">{a.location}</span>
                {(a.pmOverdue || a.calibrationOverdue) && (
                  <StatusBadge tone="warning" label={t('fac.eq.due')} />
                )}
                {a.amc && a.amc.daysLeft <= 60 && (
                  <StatusBadge
                    tone="warning"
                    label={t('fac.eq.amcEnds', { count: a.amc.daysLeft })}
                  />
                )}
                <StatusBadge tone={ASSET_TONE[a.status]} label={t(`fac.eq.status.${a.status}`)} />
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      {can('facility:asset:create') && <AssetForm />}
      {open && <AssetSheet id={open} onClose={() => setOpen('')} />}
    </div>
  );
}

function LinenTab() {
  const { t } = useTranslation();
  const can = useCan();
  const board = useLinenQuery();
  const batches = useLaundryQuery('SENT');
  const [issue] = useIssueLinenMutation();
  const [send] = useSendLaundryMutation();
  const [receive] = useReceiveLaundryMutation();
  const [condemn] = useCondemnLinenMutation();
  const [f, setF] = useState({ ward: '', code: '', qty: '', reason: '' });
  const [got, setGot] = useState({});
  const [pending, setPending] = useState(null);
  const [run, failure] = useAction();
  const edit = can('facility:linen:update');
  const line = () => [{ code: f.code, qty: Number(f.qty) }];
  return (
    <QueryView query={board} rows={4}>
      {(b) => (
        <div className="flex flex-col gap-3">
          {failure && <ApiErrorNotice error={failure} />}
          {pending && (
            <PendingApprovalNotice approvalId={pending} approver={t('fac.linen.approver')} />
          )}
          {b.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">{t('fac.tabs.linen')}</caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('fac.linen.ward')}</th>
                    {b.types.map((x) => (
                      <th key={x.code} className="px-3 py-2 text-right font-semibold">
                        {x.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {b.items.map((w) => (
                    <tr key={w.ward}>
                      <td className="px-3 py-2">{w.ward}</td>
                      {w.lines.map((l) => (
                        <td
                          key={l.code}
                          className={`tabular px-3 py-2 text-right ${l.short ? 'font-semibold text-warning' : ''}`}
                        >
                          {l.qty}
                          {l.par > 0 && <span className="text-muted">/{l.par}</span>}
                          {l.inLaundry > 0 && (
                            <span className="block text-xs text-muted">
                              {t('fac.linen.away', { n: l.inLaundry })}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState bordered={false} title={t('fac.linen.none')} />
          )}
          {edit && (
            <Card title={t('fac.linen.move')}>
              <div className="flex flex-wrap items-end gap-3">
                <FormField label={t('fac.linen.ward')} className="w-48">
                  <Input value={f.ward} onChange={(e) => setF({ ...f, ward: e.target.value })} />
                </FormField>
                <FormField label={t('fac.linen.type')} className="w-44">
                  <Select
                    value={f.code}
                    placeholder={t('fac.linen.pick')}
                    onChange={(e) => setF({ ...f, code: e.target.value })}
                    options={b.types.map((x) => ({ value: x.code, label: x.name }))}
                  />
                </FormField>
                <FormField label={t('fac.linen.qty')} className="w-24">
                  <Input
                    inputMode="numeric"
                    value={f.qty}
                    onChange={(e) => setF({ ...f, qty: e.target.value })}
                  />
                </FormField>
                <FormField label={t('fac.linen.reason')} className="w-48">
                  <Input
                    value={f.reason}
                    onChange={(e) => setF({ ...f, reason: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ['issue', () => issue({ ward: f.ward.trim(), lines: line() })],
                  ['send', () => send({ ward: f.ward.trim(), lines: line() })],
                  [
                    'condemn',
                    async () => {
                      const out = await condemn({
                        ward: f.ward.trim(),
                        code: f.code,
                        qty: Number(f.qty),
                        reason: f.reason.trim(),
                      }).unwrap();
                      setPending(out.approvalId);
                      return out;
                    },
                  ],
                ].map(([k, fn]) => (
                  <Button
                    key={k}
                    variant={k === 'condemn' ? 'danger' : 'secondary'}
                    disabled={
                      !f.ward.trim() ||
                      !f.code ||
                      !Number(f.qty) ||
                      (k === 'condemn' && f.reason.trim().length < 3)
                    }
                    onClick={() => run(async () => (k === 'condemn' ? fn() : fn().unwrap()))}
                  >
                    {t(`fac.linen.${k}`)}
                  </Button>
                ))}
              </div>
            </Card>
          )}
          <Card title={t('fac.linen.inLaundry')}>
            <QueryView
              query={batches}
              rows={2}
              empty={t('fac.linen.noBatches')}
              isEmpty={(d) => !d.items.length}
            >
              {(d) => (
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {d.items.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-end gap-3 py-2">
                      <span className="font-mono">{x.batchNo}</span>
                      <span className="flex-1">
                        {x.ward} · {fmtDate(x.sentAt)}
                      </span>
                      {x.lines.map((l) => (
                        <FormField
                          key={l.code}
                          label={t('fac.linen.back', { code: l.code, sent: l.sent })}
                          className="w-36"
                        >
                          <Input
                            inputMode="numeric"
                            disabled={!edit}
                            value={got[`${x.id}|${l.code}`] ?? String(l.sent)}
                            onChange={(e) =>
                              setGot({ ...got, [`${x.id}|${l.code}`]: e.target.value })
                            }
                          />
                        </FormField>
                      ))}
                      {edit && (
                        <Button
                          size="sm"
                          onClick={() =>
                            run(() =>
                              receive({
                                id: x.id,
                                lines: x.lines.map((l) => ({
                                  code: l.code,
                                  qty: Number(got[`${x.id}|${l.code}`] ?? l.sent) || 0,
                                })),
                              }).unwrap(),
                            )
                          }
                        >
                          {t('fac.linen.receive')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </QueryView>
          </Card>
        </div>
      )}
    </QueryView>
  );
}

function PortersTab() {
  const { t } = useTranslation();
  const can = useCan();
  const q = usePortersQuery();
  const [request, requesting] = useRequestPorterMutation();
  const [move] = useMovePorterMutation();
  const [f, setF] = useState({
    patient: '',
    from: '',
    to: '',
    mode: 'WHEELCHAIR',
    priority: 'ROUTINE',
  });
  const [who, setWho] = useState({});
  const [run, failure] = useAction();
  const manage = can('facility:porter:update');
  return (
    <div className="flex flex-col gap-3">
      {failure && <ApiErrorNotice error={failure} />}
      <Card title={t('fac.porter.new')}>
        <div className="grid gap-3 sm:grid-cols-5">
          {['patient', 'from', 'to'].map((k) => (
            <FormField key={k} label={t(`fac.porter.${k}`)}>
              <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </FormField>
          ))}
          <FormField label={t('fac.porter.mode')}>
            <Select
              value={f.mode}
              onChange={(e) => setF({ ...f, mode: e.target.value })}
              options={['WHEELCHAIR', 'STRETCHER', 'BED', 'WALK'].map((m) => ({
                value: m,
                label: t(`fac.porter.modes.${m}`),
              }))}
            />
          </FormField>
          <FormField label={t('fac.porter.priority')}>
            <Select
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}
              options={['ROUTINE', 'URGENT'].map((m) => ({
                value: m,
                label: t(`fac.porter.prio.${m}`),
              }))}
            />
          </FormField>
        </div>
        <Button
          className="mt-3"
          loading={requesting.isLoading}
          disabled={f.from.trim().length < 2 || f.to.trim().length < 2}
          onClick={() =>
            run(async () => {
              await request({
                patient: f.patient.trim() ? { name: f.patient.trim() } : undefined,
                from: f.from.trim(),
                to: f.to.trim(),
                mode: f.mode,
                priority: f.priority,
              }).unwrap();
              setF({ ...f, patient: '', from: '', to: '' });
            })
          }
        >
          {t('fac.porter.request')}
        </Button>
      </Card>
      <QueryView
        query={q}
        rows={3}
        empty={<EmptyState bordered={false} title={t('fac.porter.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                {p.priority === 'URGENT' && (
                  <StatusBadge tone="critical" label={t('fac.porter.prio.URGENT')} />
                )}
                <span className="min-w-56 flex-1">
                  <span className="font-semibold">{p.patient ?? t('fac.porter.noPatient')}</span> ·{' '}
                  {t('fac.porter.route', { from: p.from, to: p.to })} ·{' '}
                  {t(`fac.porter.modes.${p.mode}`)}
                  <span className="block text-xs text-muted">
                    {t('fac.porter.waiting', { min: p.waitMin })}
                    {p.porter && ` · ${p.porter}`}
                  </span>
                </span>
                <StatusBadge
                  tone={PORTER_TONE[p.status]}
                  label={t(`fac.porter.status.${p.status}`)}
                />
                {manage && p.status === 'REQUESTED' && (
                  <>
                    <Input
                      aria-label={t('fac.porter.who')}
                      placeholder={t('fac.porter.who')}
                      className="w-36"
                      value={who[p.id] ?? ''}
                      onChange={(e) => setWho({ ...who, [p.id]: e.target.value })}
                    />
                    <Button
                      size="sm"
                      disabled={!who[p.id]?.trim()}
                      onClick={() =>
                        run(() =>
                          move({ id: p.id, action: 'assign', porter: who[p.id].trim() }).unwrap(),
                        )
                      }
                    >
                      {t('fac.porter.assign')}
                    </Button>
                  </>
                )}
                {manage && p.status === 'ASSIGNED' && (
                  <Button
                    size="sm"
                    onClick={() => run(() => move({ id: p.id, action: 'pick' }).unwrap())}
                  >
                    {t('fac.porter.picked')}
                  </Button>
                )}
                {manage && p.status === 'PICKED' && (
                  <Button
                    size="sm"
                    onClick={() => run(() => move({ id: p.id, action: 'done' }).unwrap())}
                  >
                    {t('fac.porter.dropped')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function WasteTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [date, setDate] = useUrlState('date', todayIST());
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const q = useWasteQuery(date);
  const rep = useWasteReportQuery(month, { skip: !can('facility:waste:read') });
  const [record] = useRecordWasteMutation();
  const [handover] = useWasteHandoverMutation();
  const [f, setF] = useState({ ward: '', yellow: '', red: '', white: '', blue: '' });
  const [h, setH] = useState({
    manifestNo: '',
    vehicle: '',
    yellow: '',
    red: '',
    white: '',
    blue: '',
  });
  const [run, failure] = useAction();
  const kgs = (o) => Object.fromEntries(COLOURS.map((k) => [k, Number(o[k]) || 0]));
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('fac.date')} className="w-44">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView query={q} rows={3}>
        {(d) => (
          <>
            <table className="w-full text-sm">
              <caption className="sr-only">{t('fac.waste.caption', { date })}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('fac.linen.ward')}</th>
                  {COLOURS.map((k) => (
                    <th key={k} className="px-3 py-2 text-right font-semibold">
                      {t(`fac.waste.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5">{r.ward}</td>
                    {COLOURS.map((k) => (
                      <td key={k} className="tabular px-3 py-1.5 text-right">
                        {r[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line font-semibold">
                <tr>
                  <td className="px-3 py-2">{t('fac.waste.total')}</td>
                  {COLOURS.map((k) => (
                    <td key={k} className="tabular px-3 py-2 text-right">
                      {d.total[k]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
            {d.handovers.map((x) => (
              <p key={x.id} className="text-sm">
                {t('fac.waste.handedOver', { no: x.manifestNo, vehicle: x.vehicle ?? '–' })}{' '}
                {x.mismatch && <StatusBadge tone="critical" label={t('fac.waste.mismatch')} />}
              </p>
            ))}
          </>
        )}
      </QueryView>
      <Card title={t('fac.waste.enter')}>
        <div className="flex flex-wrap items-end gap-3">
          <FormField label={t('fac.linen.ward')} className="w-48">
            <Input value={f.ward} onChange={(e) => setF({ ...f, ward: e.target.value })} />
          </FormField>
          {COLOURS.map((k) => (
            <FormField key={k} label={t(`fac.waste.${k}`)} className="w-24">
              <Input
                inputMode="decimal"
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              />
            </FormField>
          ))}
          <Button
            disabled={f.ward.trim().length < 2}
            onClick={() => run(() => record({ date, ward: f.ward.trim(), ...kgs(f) }).unwrap())}
          >
            {t('fac.waste.save')}
          </Button>
        </div>
      </Card>
      {can('facility:waste:create') && (
        <Card title={t('fac.waste.handover')}>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('fac.waste.manifest')} className="w-36">
              <Input
                value={h.manifestNo}
                onChange={(e) => setH({ ...h, manifestNo: e.target.value })}
              />
            </FormField>
            <FormField label={t('fac.waste.vehicle')} className="w-36">
              <Input value={h.vehicle} onChange={(e) => setH({ ...h, vehicle: e.target.value })} />
            </FormField>
            {COLOURS.map((k) => (
              <FormField key={k} label={t(`fac.waste.${k}`)} className="w-24">
                <Input
                  inputMode="decimal"
                  value={h[k]}
                  onChange={(e) => setH({ ...h, [k]: e.target.value })}
                />
              </FormField>
            ))}
            <Button
              disabled={h.manifestNo.trim().length < 3}
              onClick={() =>
                run(() =>
                  handover({
                    date,
                    manifestNo: h.manifestNo.trim(),
                    vehicle: h.vehicle.trim() || undefined,
                    weights: kgs(h),
                  }).unwrap(),
                )
              }
            >
              {t('fac.waste.handOver')}
            </Button>
          </div>
        </Card>
      )}
      {rep.data && (
        <Card title={t('fac.waste.month')}>
          <FormField label={t('fac.waste.monthLabel')} className="mb-3 w-44">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </FormField>
          <KpiRow
            items={[
              ...COLOURS.map((k) => ({
                label: t(`fac.waste.${k}`),
                value: `${rep.data.total[k]} kg`,
              })),
              {
                label: t('fac.waste.mismatches'),
                value: String(rep.data.mismatches),
                tone: rep.data.mismatches ? 'critical' : undefined,
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

/**
 * Facility (board Facility, route /facility): bed cleaning from the bed board, area cleaning
 * rounds with sign-off, maintenance tickets, the equipment register with PM and AMC, linen and
 * laundry, porters, and biomedical waste.
 */
export default function FacilityPage() {
  useStrings(addDxkitStrings, addFacilityStrings);
  const { t } = useTranslation();
  const can = useCan();
  useFacSettingsQuery();
  const beds = useBedCleaningQuery('OPEN', { skip: !can('ipd:bed:clean') });
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('fac.crumb') }, { label: t('fac.title') }]}
        title={t('fac.title')}
        description={t('fac.description')}
      />
      <UrlTabs
        param="tab"
        label={t('fac.tabsLabel')}
        reset={['date', 'search', 'asset']}
        tabs={[
          can('ipd:bed:clean') && {
            id: 'beds',
            label: t('fac.tabs.beds'),
            count: beds.data?.items.length || undefined,
            body: <BedsTab />,
          },
          can('facility:housekeeping:read') && {
            id: 'rounds',
            label: t('fac.tabs.rounds'),
            body: <RoundsTab />,
          },
          {
            id: 'tickets',
            label: t('fac.tabs.tickets'),
            body: (
              <div className="flex flex-col gap-4">
                <TicketForm />
                <TicketList />
              </div>
            ),
          },
          can('facility:asset:read') && {
            id: 'equipment',
            label: t('fac.tabs.equipment'),
            body: <EquipmentTab />,
          },
          can('facility:linen:read') && {
            id: 'linen',
            label: t('fac.tabs.linen'),
            body: <LinenTab />,
          },
          { id: 'porters', label: t('fac.tabs.porters'), body: <PortersTab /> },
          { id: 'waste', label: t('fac.tabs.waste'), body: <WasteTab /> },
        ]}
      />
    </Page>
  );
}
