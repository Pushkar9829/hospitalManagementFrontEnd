import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addInventoryStrings } from '@hms/i18n/inventory';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
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
  PatientBanner,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { apiError } from '../../../app/apiError.js';
import { inr } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate, fmtTime, localeOf } from '../../dx-kit/format.js';
import { PatientPicker } from '../../patients/components/PatientPicker.jsx';
import {
  SCHEDULE_TONE,
  useDecideReturnMutation,
  useDispenseMutation,
  useDispensesQuery,
  useInvItemsQuery,
  usePhrRegisterQuery,
  usePhrReturnsQuery,
  useRxQuery,
  useRxQueueQuery,
  useSalesSummaryQuery,
} from '../api.js';

const CONTROLLED = ['H1', 'X', 'NARCOTIC'];
const thisMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

/** What was dispensed: the batches, the bill link (sale) or the stay (ward issue). */
function DoneNotice({ result, onClose }) {
  const { t } = useTranslation();
  if (!result) return null;
  return (
    <Banner tone="success">
      <div className="flex flex-col gap-1">
        <strong>{t('inv.phr.done', { no: result.dispNo, amount: inr(result.total) })}</strong>
        <span className="text-sm">
          {result.lines.map((l) => `${l.name} ${l.batchNo} × ${l.qty}`).join(' · ')}
        </span>
        <span className="flex flex-wrap gap-3 text-sm">
          {result.kind === 'ISSUE' ? (
            t('inv.phr.onIpBill')
          ) : result.receipt ? (
            t('inv.phr.paid', { no: result.receipt.no })
          ) : (
            <Link className="font-semibold underline" to={`/billing/bills/${result.billId}`}>
              {t('inv.phr.toBill')}
            </Link>
          )}
          <button type="button" className="underline" onClick={onClose}>
            {t('inv.phr.close')}
          </button>
        </span>
      </div>
    </Banner>
  );
}

function RxDetail({ id, onDone }) {
  const { t } = useTranslation();
  const can = useCan();
  const q = useRxQuery(id);
  const [dispense, state] = useDispenseMutation();
  const [choice, setChoice] = useState({});
  const [weight, setWeight] = useState('');
  const [override, setOverride] = useState('');
  const [payNow, setPayNow] = useState(false);
  const [mode, setMode] = useState('CASH');
  const [failure, setFailure] = useState(null);
  const code = apiError(failure)?.code;
  return (
    <QueryView query={q} rows={6}>
      {(rx) => {
        const lineState = (l, i) => {
          const c = choice[i] ?? {};
          const itemId = c.itemId ?? l.item?.id ?? '';
          const sub = itemId && l.item && itemId !== l.item.id;
          return {
            itemId,
            qty: c.qty ?? Math.max(0, (l.suggestedQty ?? 1) - (l.dispensedQty ?? 0)),
            consent: c.consent ?? false,
            skip: c.skip ?? false,
            sub,
          };
        };
        const set = (i, patch) => setChoice((s) => ({ ...s, [i]: { ...s[i], ...patch } }));
        const lines = rx.lines
          .map((l, i) => ({ l, i, s: lineState(l, i) }))
          .filter(({ s }) => !s.skip && s.itemId && s.qty > 0);
        return (
          <Card>
            <div className="flex flex-col gap-4">
              <PatientBanner
                name={rx.patient.name}
                age={rx.patient.age}
                sex={rx.patient.gender}
                uhid={rx.patient.uhid}
                bed={rx.source === 'IPD' ? (rx.location ?? undefined) : undefined}
                consultant={rx.prescriber?.name}
              />
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{rx.rxNo}</h2>
                <StatusBadge
                  tone={rx.source === 'IPD' ? 'info' : 'neutral'}
                  label={t(`inv.phr.source.${rx.source}`)}
                />
                {rx.stat && <StatusBadge tone="critical" label="STAT" />}
                {rx.child && <StatusBadge tone="warning" label={t('inv.phr.child')} />}
                {rx.prescriber?.regNo && (
                  <span className="text-sm text-muted">
                    {t('inv.phr.regNo', { no: rx.prescriber.regNo })}
                  </span>
                )}
              </div>
              <ApiErrorNotice error={failure} />
              <ul className="flex flex-col gap-3">
                {rx.lines.map((l, i) => {
                  const s = lineState(l, i);
                  const options = [
                    ...(l.item
                      ? [
                          {
                            value: l.item.id,
                            label: `${l.item.name} · ${t('inv.phr.inStock', { n: l.available })}`,
                          },
                        ]
                      : []),
                    ...l.alternatives.map((a) => ({
                      value: a.id,
                      label: `${a.name} · ${t('inv.phr.inStock', { n: a.available })}`,
                    })),
                  ];
                  return (
                    <li key={`${l.drugId}-${i}`} className="rounded-control border border-line p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-ink">{l.brand}</strong>
                        <span className="text-sm text-muted">
                          {[
                            l.generic,
                            l.dose,
                            l.frequency &&
                              t(`inv.phr.freq.${l.frequency}`, { defaultValue: l.frequency }),
                            l.days && t('inv.phr.days', { n: l.days }),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {l.item && (
                          <StatusBadge
                            tone={SCHEDULE_TONE[l.item.schedule]}
                            label={t(`inv.schedule.${l.item.schedule}`)}
                          />
                        )}
                        {l.dispensedQty > 0 && (
                          <span className="text-sm text-muted">
                            {t('inv.phr.given', { n: l.dispensedQty })}
                          </span>
                        )}
                      </div>
                      {options.length ? (
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
                          <FormField label={t('inv.phr.give')}>
                            <Select
                              value={s.itemId}
                              onChange={(e) => set(i, { itemId: e.target.value, consent: false })}
                              options={options}
                            />
                          </FormField>
                          <FormField label={t('inv.phr.qty')}>
                            <Input
                              type="number"
                              min={0}
                              value={s.qty}
                              onChange={(e) => set(i, { qty: Number(e.target.value) })}
                            />
                          </FormField>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-warning">{t('inv.phr.notStocked')}</p>
                      )}
                      {s.sub && (
                        <Checkbox
                          className="mt-1"
                          checked={s.consent}
                          onChange={(e) => set(i, { consent: e.target.checked })}
                          label={t('inv.phr.consent', { brand: l.brand })}
                        />
                      )}
                      <Checkbox
                        className="mt-1"
                        checked={s.skip}
                        onChange={(e) => set(i, { skip: e.target.checked })}
                        label={t('inv.phr.skip')}
                      />
                    </li>
                  );
                })}
              </ul>
              {rx.child && (
                <FormField
                  label={t('inv.phr.weight')}
                  hint={t('inv.phr.weightHint')}
                  className="w-48"
                >
                  <Input
                    inputMode="decimal"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </FormField>
              )}
              {code === 'DOSE_ABOVE_LIMIT' && (
                <FormField label={t('inv.phr.override')} required>
                  <Input value={override} onChange={(e) => setOverride(e.target.value)} />
                </FormField>
              )}
              {rx.source === 'OPD' && can('billing:payment:create') && (
                <div className="flex flex-wrap items-end gap-3">
                  <Checkbox
                    checked={payNow}
                    onChange={(e) => setPayNow(e.target.checked)}
                    label={t('inv.phr.payNow')}
                  />
                  {payNow && (
                    <FormField label={t('inv.phr.mode')} className="w-40">
                      <Select
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        options={['CASH', 'UPI', 'CARD'].map((m) => ({ value: m, label: m }))}
                      />
                    </FormField>
                  )}
                </div>
              )}
              {can('pharmacy:sale:create') && (
                <div>
                  <Button
                    loading={state.isLoading}
                    disabled={!lines.length}
                    onClick={async () => {
                      setFailure(null);
                      try {
                        const r = await dispense({
                          rxId: rx.id,
                          lines: lines.map(({ l, i, s }) => ({
                            itemId: s.itemId,
                            qty: s.qty,
                            rxLine: i,
                            substituteFor: s.sub ? l.brand : undefined,
                            consent: s.sub ? s.consent : undefined,
                          })),
                          weightKg: weight ? Number(weight) : undefined,
                          overrideReason: override.trim() || undefined,
                          payNow: payNow ? { mode } : undefined,
                        }).unwrap();
                        onDone(r);
                      } catch (err) {
                        setFailure(err);
                      }
                    }}
                  >
                    {t(rx.source === 'IPD' ? 'inv.phr.issue' : 'inv.phr.dispense', {
                      count: lines.length,
                    })}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      }}
    </QueryView>
  );
}

function QueueTab() {
  const { t, i18n } = useTranslation();
  const [id, setId] = useUrlState('id', '');
  const [source, setSource] = useUrlState('source', '');
  const [done, setDone] = useState(null);
  const list = useRxQueueQuery({ source: source || undefined });
  const items = list.data?.items ?? [];
  const current = items.some((r) => r.id === id) ? id : (items[0]?.id ?? '');
  return (
    <div className="flex flex-col gap-3">
      <DoneNotice result={done} onClose={() => setDone(null)} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title={t('inv.phr.queue', { count: items.length })}>
          <Select
            aria-label={t('inv.phr.from')}
            className="mb-3"
            value={source}
            placeholder={t('inv.phr.allSources')}
            onChange={(e) => setSource(e.target.value)}
            options={['OPD', 'IPD'].map((s) => ({ value: s, label: t(`inv.phr.source.${s}`) }))}
          />
          <QueryView
            query={list}
            empty={<EmptyState bordered={false} title={t('inv.phr.empty')} />}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <PickList
                label={t('inv.phr.queueLabel')}
                selectedId={current}
                onPick={(v) => setId(v)}
                items={d.items.map((r) => ({
                  id: r.id,
                  lead: fmtTime(r.createdAt, localeOf(i18n)),
                  title: r.patient.name,
                  sub: [r.location, r.lines.map((l) => l.brand).join(', ')]
                    .filter(Boolean)
                    .join(' · '),
                  badge: r.stat
                    ? { tone: 'critical', label: 'STAT' }
                    : {
                        tone: r.source === 'IPD' ? 'info' : 'neutral',
                        label: t(`inv.phr.source.${r.source}`),
                      },
                }))}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <RxDetail key={current} id={current} onDone={setDone} />
        ) : (
          <EmptyState title={t('inv.phr.pick')} />
        )}
      </div>
    </div>
  );
}

/** Walk-in sale against an outside prescription (H1/X need the prescriber and the copy). */
function CounterTab() {
  const { t } = useTranslation();
  const [patient, setPatient] = useState(null);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState([]);
  const [doctor, setDoctor] = useState('');
  const [regNo, setRegNo] = useState('');
  const [copy, setCopy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);
  const search = useInvItemsQuery({ q, kind: 'DRUG' }, { skip: q.trim().length < 2 });
  const [dispense, state] = useDispenseMutation();
  const controlled = lines.some((l) => CONTROLLED.includes(l.schedule));
  return (
    <div className="flex flex-col gap-3">
      <DoneNotice result={done} onClose={() => setDone(null)} />
      <Card>
        <div className="flex flex-col gap-3">
          <PatientPicker label={t('inv.phr.patient')} value={patient} onChange={setPatient} />
          <FormField label={t('inv.phr.searchItem')}>
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </FormField>
          {q.trim().length >= 2 && (
            <ul className="flex flex-wrap gap-2">
              {(search.data?.items ?? [])
                .filter((i) => i.isActive)
                .slice(0, 12)
                .map((i) => (
                  <li key={i.id}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setLines((ls) =>
                          ls.some((x) => x.itemId === i.id)
                            ? ls
                            : [
                                ...ls,
                                {
                                  itemId: i.id,
                                  name: i.name,
                                  schedule: i.drug?.schedule,
                                  qty: i.packSize || 1,
                                },
                              ],
                        )
                      }
                    >
                      {i.name}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
          {lines.length > 0 && (
            <ul className="flex flex-col gap-2">
              {lines.map((l, i) => (
                <li key={l.itemId} className="flex flex-wrap items-end gap-2">
                  <span className="min-w-48 flex-1">
                    {l.name}{' '}
                    {l.schedule && (
                      <StatusBadge
                        tone={SCHEDULE_TONE[l.schedule]}
                        label={t(`inv.schedule.${l.schedule}`)}
                      />
                    )}
                  </span>
                  <FormField label={t('inv.phr.qty')} className="w-28">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)),
                        )
                      }
                    />
                  </FormField>
                  <Button
                    variant="ghost"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  >
                    {t('inv.phr.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {controlled && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t('inv.phr.prescriber')} required>
                <Input value={doctor} onChange={(e) => setDoctor(e.target.value)} />
              </FormField>
              <FormField label={t('inv.phr.prescriberReg')} required>
                <Input mono value={regNo} onChange={(e) => setRegNo(e.target.value)} />
              </FormField>
              <Checkbox
                checked={copy}
                onChange={(e) => setCopy(e.target.checked)}
                label={t('inv.phr.copyKept')}
              />
            </div>
          )}
          <ApiErrorNotice error={failure} />
          <div>
            <Button
              loading={state.isLoading}
              disabled={!patient || !lines.length || lines.some((l) => !(l.qty > 0))}
              onClick={async () => {
                setFailure(null);
                try {
                  const r = await dispense({
                    patientId: patient.id,
                    lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
                    prescriber: controlled
                      ? { name: doctor.trim(), regNo: regNo.trim() }
                      : undefined,
                    prescriptionCopy: controlled ? copy : undefined,
                  }).unwrap();
                  setDone(r);
                  setLines([]);
                  setQ('');
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('inv.phr.sell', { count: lines.length })}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ReturnsTab() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const list = usePhrReturnsQuery({ status: 'PENDING' });
  const [decide] = useDecideReturnMutation();
  return (
    <QueryView
      query={list}
      empty={<EmptyState bordered={false} title={t('inv.phr.noReturns')} />}
      isEmpty={(d) => !d.items.length}
    >
      {(d) => (
        <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
          {d.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <span className="min-w-0 flex-1">
                <strong>{r.patientName}</strong>{' '}
                <span className="text-sm text-muted">
                  · {r.dispNo} · {fmtDate(r.createdAt, localeOf(i18n))}
                </span>
                <span className="block text-sm">
                  {r.lines.map((l) => `${l.name} ${l.batchNo} × ${l.qty}`).join(' · ')}
                </span>
                {r.reason && <span className="block text-sm text-muted">{r.reason}</span>}
              </span>
              <Button
                size="sm"
                onClick={() =>
                  decide({ id: r.id, accept: true })
                    .unwrap()
                    .then(() => toast({ tone: 'success', title: t('inv.phr.returnAccepted') }))
                }
              >
                {t('inv.phr.accept')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide({ id: r.id, accept: false })}>
                {t('inv.phr.reject')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}

function RegistersTab() {
  const { t, i18n } = useTranslation();
  const [schedule, setSchedule] = useUrlState('schedule', 'H1');
  const [month, setMonth] = useUrlState('month', thisMonth());
  const q = usePhrRegisterQuery({ schedule, month });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <FormField label={t('inv.phr.schedule')} className="w-40">
          <Select
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            options={CONTROLLED.map((s) => ({ value: s, label: t(`inv.schedule.${s}`) }))}
          />
        </FormField>
        <FormField label={t('inv.phr.month')} className="w-48">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </FormField>
      </div>
      <QueryView
        query={q}
        empty={<EmptyState bordered={false} title={t('inv.phr.noEntries')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t('inv.phr.registerTitle', { schedule })}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['date', 'patient', 'item', 'batch', 'qty', 'prescriber', 'by'].map((k) => (
                    <th key={k} className="px-3 py-2 font-semibold">
                      {t(`inv.phr.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((r) => (
                  <tr key={`${r.dispNo}-${r.batchNo}-${r.item}`}>
                    <td className="px-3 py-2">{fmtDate(r.at, localeOf(i18n))}</td>
                    <td className="px-3 py-2">
                      {r.patient} <span className="text-muted">· {r.uhid}</span>
                    </td>
                    <td className="px-3 py-2">{r.item}</td>
                    <td className="px-3 py-2 font-mono">{r.batchNo}</td>
                    <td className="tabular px-3 py-2">{r.qty}</td>
                    <td className="px-3 py-2">
                      {r.prescriber} <span className="text-muted">· {r.regNo}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">{r.by}</td>
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

function TodayTab() {
  const { t, i18n } = useTranslation();
  const sum = useSalesSummaryQuery();
  const list = useDispensesQuery({ days: 1 });
  return (
    <div className="flex flex-col gap-4">
      <QueryView query={sum} rows={2}>
        {(s) => (
          <KpiRow
            items={[
              { label: t('inv.phr.kpi.sales'), value: inr(s.sales) },
              { label: t('inv.phr.kpi.issues'), value: inr(s.issues) },
              { label: t('inv.phr.kpi.count'), value: String(s.dispenses) },
              ...s.gst.map((g) => ({
                label: t('inv.phr.kpi.gst', { rate: g.rate }),
                value: inr(g.tax),
                sub: t('inv.phr.kpi.taxable', { amount: inr(g.taxable) }),
              })),
            ]}
          />
        )}
      </QueryView>
      <QueryView
        query={list}
        empty={<EmptyState bordered={false} title={t('inv.phr.noneToday')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{x.dispNo}</span>
                <span className="min-w-0 flex-1">
                  {x.patient.name} · {x.lines.map((l) => `${l.name} × ${l.qty}`).join(', ')}
                </span>
                <StatusBadge
                  tone={x.kind === 'ISSUE' ? 'info' : 'neutral'}
                  label={t(`inv.phr.kind.${x.kind}`)}
                />
                <span className="tabular">{inr(x.total)}</span>
                <span className="text-muted">{fmtTime(x.at, localeOf(i18n))}</span>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Pharmacy (board Pharmacy, route /pharmacy): the queue of OPD prescriptions and ward orders with
 * dispensing (FEFO batches, generic substitution with consent, the child weight check), counter
 * sales against outside prescriptions, ward returns, the Schedule H1/X/narcotic registers and
 * today's sales with GST by rate.
 */
export default function PharmacyPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addInventoryStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('inv.phr.crumb') }, { label: t('inv.phr.title') }]}
        title={t('inv.phr.title')}
        description={t('inv.phr.description')}
      />
      <UrlTabs
        param="tab"
        label={t('inv.phr.tabsLabel')}
        reset={['source', 'schedule', 'month']}
        tabs={[
          { id: 'queue', label: t('inv.phr.tabs.queue'), body: <QueueTab /> },
          { id: 'counter', label: t('inv.phr.tabs.counter'), body: <CounterTab /> },
          { id: 'returns', label: t('inv.phr.tabs.returns'), body: <ReturnsTab /> },
          { id: 'registers', label: t('inv.phr.tabs.registers'), body: <RegistersTab /> },
          { id: 'today', label: t('inv.phr.tabs.today'), body: <TodayTab /> },
        ]}
      />
    </Page>
  );
}
