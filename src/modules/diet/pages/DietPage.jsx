import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDietStrings } from '@hms/i18n/diet';
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
  Select,
  Sheet,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import {
  TRAY_TONE,
  useAddDietNoteMutation,
  useClearNbmMutation,
  useDeliverTraysMutation,
  useDietNotesQuery,
  useDietOrdersQuery,
  useDietSettingsQuery,
  useDietTraysQuery,
  useMissTrayMutation,
  useMissedMealsQuery,
  usePrepareMealMutation,
  useProductionQuery,
  useSaveDietSettingsMutation,
  useSetDietMutation,
  useSetNbmMutation,
} from '../api.js';
import { BillingTab, MenuTab } from '../components/DietMaster.jsx';

const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const timeIST = (d) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(d));
const localNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16);

/** The next meal by time of day, so the kitchen opens on what it is cooking now. */
function useNextMeal(meals) {
  const now = new Date(Date.now() + 330 * 60_000).toISOString().slice(11, 16);
  return (meals.find((m) => m.time >= now) ?? meals[0])?.code ?? 'BREAKFAST';
}

/** Printable tray labels: name, bed, diet, allergy warning, NBM block. */
function TrayLabels({ trays }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
      {trays.map((x) => (
        <div
          key={x.admissionId}
          className={`rounded-control border-2 p-3 text-sm ${x.nbm ? 'border-critical bg-critical-bg' : 'border-line'}`}
        >
          <p className="flex justify-between font-semibold">
            <span>{x.patient}</span>
            <span className="font-mono">{x.bed}</span>
          </p>
          <p className="text-muted">
            {x.ward} · {x.uhid}
          </p>
          {x.nbm ? (
            <p className="mt-1 text-lg font-bold text-critical">
              {t('diet.label.nbm')} · {x.nbmReason}
            </p>
          ) : (
            <p className="mt-1 text-lg font-bold">{x.dietName}</p>
          )}
          {x.allergies.length > 0 && (
            <p className="font-semibold text-critical">
              {t('diet.label.allergy', { list: x.allergies.join(', ') })}
            </p>
          )}
          {x.special && <p>{x.special}</p>}
          {x.attendant && <p className="text-muted">{t('diet.label.attendant')}</p>}
        </div>
      ))}
    </div>
  );
}

function ProductionTab({ settings }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const next = useNextMeal(settings.meals);
  const [date, setDate] = useUrlState('date', todayIST());
  const [meal, setMeal] = useUrlState('meal', next);
  const sheet = useProductionQuery({ date, meal });
  const trays = useDietTraysQuery({ date, meal });
  const [prepare, preparing] = usePrepareMealMutation();
  const [deliver, delivering] = useDeliverTraysMutation();
  const [miss] = useMissTrayMutation();
  const [failure, setFailure] = useState(null);
  const [labels, setLabels] = useState(false);
  const run = async (fn) => {
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <FormField label={t('diet.date')} className="w-44">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label={t('diet.meal')} className="w-48">
          <Select
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            options={settings.meals.map((m) => ({ value: m.code, label: `${m.name} · ${m.time}` }))}
          />
        </FormField>
        {can('diet:production:update') && (
          <Button
            loading={preparing.isLoading}
            onClick={() =>
              run(async () => {
                await prepare({ date, meal }).unwrap();
                toast({ tone: 'success', title: t('diet.prod.preparedToast') });
              })
            }
          >
            {t('diet.prod.prepare')}
          </Button>
        )}
        <Button variant="secondary" onClick={() => setLabels((v) => !v)}>
          {labels ? t('diet.prod.hideLabels') : t('diet.prod.labels')}
        </Button>
        {labels && (
          <Button variant="ghost" onClick={() => window.print()}>
            {t('diet.prod.print')}
          </Button>
        )}
      </div>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView query={sheet} rows={5}>
        {(s) => (
          <div className="flex flex-col gap-3">
            <KpiRow
              className="print:hidden"
              items={[
                { label: t('diet.prod.trays'), value: String(s.total) },
                {
                  label: t('diet.prod.held'),
                  value: String(s.held),
                  tone: s.held ? 'warning' : undefined,
                },
                { label: t('diet.prod.attendants'), value: String(s.attendants) },
                {
                  label: t('diet.prod.delivered'),
                  value: s.prepared ? `${s.delivered}/${s.total}` : '–',
                },
              ]}
            />
            <p className="text-sm text-muted print:hidden">
              {t('diet.prod.cutoff', { time: s.cutoff })}
            </p>
            {s.byDiet.length ? (
              <div className="overflow-x-auto print:hidden">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {t('diet.prod.caption', { meal: s.mealName })}
                  </caption>
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t('diet.prod.diet')}</th>
                      {s.wards.map((w) => (
                        <th key={w} className="px-3 py-2 text-right font-semibold">
                          {w}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-semibold">{t('diet.prod.total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.byDiet.map((r) => (
                      <tr key={r.diet}>
                        <td className="px-3 py-2">{r.name}</td>
                        {s.wards.map((w) => (
                          <td key={w} className="tabular px-3 py-2 text-right">
                            {r.wards[w] ?? ''}
                          </td>
                        ))}
                        <td className="tabular px-3 py-2 text-right font-semibold">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState bordered={false} title={t('diet.prod.none')} />
            )}
            {labels && <TrayLabels trays={s.trays} />}
            {s.prepared && (
              <Card title={t('diet.prod.deliveryTitle')} className="print:hidden">
                <QueryView query={trays} rows={3}>
                  {(d) => (
                    <div className="flex flex-col gap-3">
                      {s.wards.map((w) => {
                        const ward = d.items.filter((x) => x.ward === w);
                        const waiting = ward.filter((x) => x.status === 'PREPARED').length;
                        return (
                          <div key={w}>
                            <div className="mb-1 flex items-center gap-3">
                              <h3 className="font-semibold">{w}</h3>
                              {waiting > 0 && (
                                <Button
                                  size="sm"
                                  loading={delivering.isLoading}
                                  onClick={() =>
                                    run(() => deliver({ date, meal, ward: w }).unwrap())
                                  }
                                >
                                  {t('diet.prod.deliverWard', { count: waiting })}
                                </Button>
                              )}
                            </div>
                            <ul className="flex flex-col divide-y divide-line text-sm">
                              {ward.map((x) => (
                                <li key={x.id} className="flex flex-wrap items-center gap-3 py-1.5">
                                  <span className="w-16 font-mono">{x.bed}</span>
                                  <span className="flex-1">{x.patient}</span>
                                  <span className="text-muted">{x.diet}</span>
                                  <StatusBadge
                                    tone={TRAY_TONE[x.status]}
                                    label={t(`diet.tray.${x.status}`)}
                                  />
                                  {x.deliveredAt && (
                                    <span className="text-xs text-muted">
                                      {timeIST(x.deliveredAt)}
                                      {x.charged && ` · ${t('diet.tray.charged')}`}
                                    </span>
                                  )}
                                  {x.status === 'PREPARED' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        run(() =>
                                          miss({
                                            id: x.id,
                                            reason: t('diet.tray.notInWard'),
                                          }).unwrap(),
                                        )
                                      }
                                    >
                                      {t('diet.tray.markMissed')}
                                    </Button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </QueryView>
              </Card>
            )}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function OrderSheet({ order, settings, onClose }) {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const [f, setF] = useState({
    diet: order.diet,
    special: order.special ?? '',
    attendantMeals: order.attendantMeals,
  });
  const [nbm, setNbmF] = useState({ from: localNow(), to: '', reason: '' });
  const [note, setNote] = useState({ kind: 'ASSESSMENT', heightCm: '', weightKg: '', text: '' });
  const [save, saving] = useSetDietMutation();
  const [setNbm, settingNbm] = useSetNbmMutation();
  const [clear] = useClearNbmMutation();
  const [addNote, adding] = useAddDietNoteMutation();
  const notes = useDietNotesQuery(order.admissionId);
  const [failure, setFailure] = useState(null);
  const run = async (fn, msg) => {
    setFailure(null);
    try {
      await fn();
      if (msg) toast({ tone: 'success', title: msg });
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={`${order.patient} · ${order.bed}`}
      description={[order.ward, order.ipNo, order.uhid].filter(Boolean).join(' · ')}
    >
      <div className="flex flex-col gap-4">
        {failure && <ApiErrorNotice error={failure} />}
        {order.allergies.length > 0 && (
          <Banner tone="critical">
            {t('diet.label.allergy', { list: order.allergies.join(', ') })}
          </Banner>
        )}
        <Card title={t('diet.order.title')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('diet.order.diet')}>
              <Select
                value={f.diet}
                onChange={(e) => setF({ ...f, diet: e.target.value })}
                options={settings.diets
                  .filter((d) => d.active !== false)
                  .map((d) => ({ value: d.code, label: d.name }))}
              />
            </FormField>
            <FormField label={t('diet.order.special')}>
              <Input value={f.special} onChange={(e) => setF({ ...f, special: e.target.value })} />
            </FormField>
            <Checkbox
              checked={f.attendantMeals}
              onChange={(e) => setF({ ...f, attendantMeals: e.target.checked })}
              label={t('diet.order.attendant')}
            />
          </div>
          <Button
            className="mt-3"
            loading={saving.isLoading}
            onClick={() =>
              run(
                () =>
                  save({
                    admissionId: order.admissionId,
                    diet: f.diet,
                    special: f.special.trim() || undefined,
                    attendantMeals: f.attendantMeals,
                    source: can('diet:order:update') ? 'DIETITIAN' : 'DOCTOR',
                  }).unwrap(),
                t('diet.order.saved'),
              )
            }
          >
            {t('diet.order.save')}
          </Button>
        </Card>
        <Card title={t('diet.nbm.title')} description={t('diet.nbm.hint')}>
          {order.nbm ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge tone="warning" label={t('diet.label.nbm')} />
              <span>
                {t('diet.nbm.window', {
                  from: `${fmtDate(order.nbm.from)} ${timeIST(order.nbm.from)}`,
                  to: order.nbm.to
                    ? `${fmtDate(order.nbm.to)} ${timeIST(order.nbm.to)}`
                    : t('diet.nbm.untilLifted'),
                })}
                {' · '}
                {order.nbm.reason}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run(() => clear(order.admissionId).unwrap())}
              >
                {t('diet.nbm.lift')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <FormField label={t('diet.nbm.from')} className="w-52">
                <Input
                  type="datetime-local"
                  value={nbm.from}
                  onChange={(e) => setNbmF({ ...nbm, from: e.target.value })}
                />
              </FormField>
              <FormField label={t('diet.nbm.to')} className="w-52">
                <Input
                  type="datetime-local"
                  value={nbm.to}
                  onChange={(e) => setNbmF({ ...nbm, to: e.target.value })}
                />
              </FormField>
              <FormField label={t('diet.nbm.reason')} className="min-w-48 flex-1">
                <Input
                  value={nbm.reason}
                  onChange={(e) => setNbmF({ ...nbm, reason: e.target.value })}
                />
              </FormField>
              <Button
                loading={settingNbm.isLoading}
                disabled={nbm.reason.trim().length < 3}
                onClick={() =>
                  run(() =>
                    setNbm({
                      admissionId: order.admissionId,
                      from: `${nbm.from}:00+05:30`,
                      to: nbm.to ? `${nbm.to}:00+05:30` : undefined,
                      reason: nbm.reason.trim(),
                    }).unwrap(),
                  )
                }
              >
                {t('diet.nbm.set')}
              </Button>
            </div>
          )}
        </Card>
        <Card title={t('diet.note.title')}>
          {can('diet:note:create') && (
            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              <FormField label={t('diet.note.kind')}>
                <Select
                  value={note.kind}
                  onChange={(e) => setNote({ ...note, kind: e.target.value })}
                  options={['ASSESSMENT', 'COUNSELLING', 'DISCHARGE_PLAN'].map((k) => ({
                    value: k,
                    label: t(`diet.note.kinds.${k}`),
                  }))}
                />
              </FormField>
              <FormField label={t('diet.note.height')}>
                <Input
                  inputMode="decimal"
                  value={note.heightCm}
                  onChange={(e) => setNote({ ...note, heightCm: e.target.value })}
                />
              </FormField>
              <FormField label={t('diet.note.weight')}>
                <Input
                  inputMode="decimal"
                  value={note.weightKg}
                  onChange={(e) => setNote({ ...note, weightKg: e.target.value })}
                />
              </FormField>
              <FormField label={t('diet.note.text')} className="sm:col-span-4">
                <Input
                  value={note.text}
                  onChange={(e) => setNote({ ...note, text: e.target.value })}
                />
              </FormField>
              <Button
                className="self-end"
                loading={adding.isLoading}
                disabled={note.text.trim().length < 3}
                onClick={() =>
                  run(async () => {
                    await addNote({
                      admissionId: order.admissionId,
                      kind: note.kind,
                      heightCm: Number(note.heightCm) || undefined,
                      weightKg: Number(note.weightKg) || undefined,
                      text: note.text.trim(),
                    }).unwrap();
                    setNote({ ...note, text: '' });
                  })
                }
              >
                {t('diet.note.add')}
              </Button>
            </div>
          )}
          <QueryView
            query={notes}
            rows={2}
            empty={t('diet.note.none')}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {d.items.map((n) => (
                  <li key={n.id} className="py-2">
                    <p className="font-semibold">
                      {t(`diet.note.kinds.${n.kind}`)}
                      {n.data.bmi && ` · ${t('diet.note.bmi', { bmi: n.data.bmi })}`}
                    </p>
                    <p>{n.text}</p>
                    <p className="text-xs text-muted">
                      {n.by} · {fmtDate(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </Card>
      </div>
    </Sheet>
  );
}

function OrdersTab({ settings }) {
  const { t } = useTranslation();
  const [ward, setWard] = useUrlState('ward', '');
  const all = useDietOrdersQuery({});
  const q = useDietOrdersQuery({ ward: ward || undefined });
  const [open, setOpen] = useState(null);
  const wards = [...new Set((all.data?.items ?? []).map((o) => o.ward).filter(Boolean))].sort();
  const name = (c) => settings.diets.find((d) => d.code === c)?.name ?? c;
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('diet.ward')} className="w-56">
        <Select
          value={ward}
          placeholder={t('diet.allWards')}
          onChange={(e) => setWard(e.target.value)}
          options={wards.map((w) => ({ value: w, label: w }))}
        />
      </FormField>
      <QueryView
        query={q}
        rows={6}
        empty={<EmptyState bordered={false} title={t('diet.order.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t('diet.tabs.orders')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['bed', 'patient', 'diet', 'notes'].map((k) => (
                    <th key={k} className="px-3 py-2 font-semibold">
                      {t(`diet.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-mono">
                      {o.bed}
                      <span className="block font-sans text-xs text-muted">{o.ward}</span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-semibold underline-offset-2 hover:underline"
                        onClick={() => setOpen(o)}
                      >
                        {o.patient}
                      </button>
                      <span className="block text-xs text-muted">{o.uhid}</span>
                    </td>
                    <td className="px-3 py-2">
                      {name(o.diet)}
                      {o.source === 'DEFAULT' && (
                        <span className="block text-xs text-muted">{t('diet.order.default')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {o.nbmNow && <StatusBadge tone="warning" label={t('diet.label.nbm')} />}
                        {!o.nbmNow && o.nbm && (
                          <StatusBadge tone="info" label={t('diet.nbm.scheduled')} />
                        )}
                        {o.allergies.length > 0 && (
                          <StatusBadge
                            tone="critical"
                            label={t('diet.order.allergies', { count: o.allergies.length })}
                          />
                        )}
                        {o.special && <span className="text-muted">{o.special}</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      {open && <OrderSheet order={open} settings={settings} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MissedTab() {
  const { t } = useTranslation();
  const [date, setDate] = useUrlState('date', todayIST());
  const q = useMissedMealsQuery(date);
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('diet.date')} className="w-44">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <QueryView
        query={q}
        rows={3}
        empty={<EmptyState bordered={false} title={t('diet.missed.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line text-sm">
            {d.items.map((x) => (
              <li key={x.id} className="flex flex-wrap gap-3 px-3 py-2">
                <span className="w-28">{x.meal}</span>
                <span className="font-mono">{x.bed}</span>
                <span className="flex-1">
                  {x.patient} · {x.ward}
                </span>
                <span className="text-muted">
                  {x.missedReason ?? t('diet.missed.notDelivered')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function SettingsTab({ settings }) {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const [f, setF] = useState({
    defaultDiet: settings.defaultDiet,
    chargeCategories: settings.chargeCategories.join(', '),
    meals: settings.meals,
  });
  const [save, state] = useSaveDietSettingsMutation();
  const [failure, setFailure] = useState(null);
  const edit = can('diet:settings:update');
  return (
    <Card title={t('diet.set.title')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('diet.set.default')}>
            <Select
              value={f.defaultDiet}
              disabled={!edit}
              onChange={(e) => setF({ ...f, defaultDiet: e.target.value })}
              options={settings.diets.map((d) => ({ value: d.code, label: d.name }))}
            />
          </FormField>
          <FormField label={t('diet.set.charge')} hint={t('diet.set.chargeHint')}>
            <Input
              value={f.chargeCategories}
              disabled={!edit}
              onChange={(e) => setF({ ...f, chargeCategories: e.target.value })}
            />
          </FormField>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">{t('diet.set.meals')}</caption>
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-semibold">{t('diet.meal')}</th>
              <th className="py-1 font-semibold">{t('diet.set.time')}</th>
              <th className="py-1 font-semibold">{t('diet.set.cutoff')}</th>
            </tr>
          </thead>
          <tbody>
            {f.meals.map((m, i) => (
              <tr key={m.code}>
                <td className="py-1">{m.name}</td>
                {['time', 'cutoff'].map((k) => (
                  <td key={k} className="py-1">
                    <Input
                      type="time"
                      aria-label={`${m.name} ${t(`diet.set.${k}`)}`}
                      className="w-32"
                      disabled={!edit}
                      value={m[k]}
                      onChange={(e) =>
                        setF({
                          ...f,
                          meals: f.meals.map((x, j) =>
                            j === i ? { ...x, [k]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-muted">
          {t('diet.set.diets')}: {settings.diets.map((d) => d.name).join(' · ')}
        </p>
        {edit && (
          <Button
            className="self-start"
            loading={state.isLoading}
            onClick={async () => {
              setFailure(null);
              try {
                await save({
                  defaultDiet: f.defaultDiet,
                  chargeCategories: f.chargeCategories
                    .split(',')
                    .map((x) => x.trim().toUpperCase())
                    .filter(Boolean),
                  meals: f.meals,
                }).unwrap();
                toast({ tone: 'success', title: t('diet.set.saved') });
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('diet.set.save')}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Diet and kitchen (board Diet, route /diet): the production sheet for each meal with tray
 * labels and ward delivery, diet orders with nil-by-mouth windows and the dietitian's notes,
 * missed meals, and diet types, meal times and charging.
 */
export default function DietPage() {
  useStrings(addDxkitStrings, addDietStrings);
  const { t } = useTranslation();
  const settings = useDietSettingsQuery();
  return (
    <Page>
      <PageHeader
        className="print:hidden"
        breadcrumb={[{ label: t('diet.crumb') }, { label: t('diet.title') }]}
        title={t('diet.title')}
        description={t('diet.description')}
      />
      <QueryView query={settings} rows={4}>
        {(s) => (
          <UrlTabs
            param="tab"
            label={t('diet.tabsLabel')}
            reset={['date', 'meal', 'ward']}
            tabs={[
              {
                id: 'production',
                label: t('diet.tabs.production'),
                body: <ProductionTab settings={s} />,
              },
              { id: 'orders', label: t('diet.tabs.orders'), body: <OrdersTab settings={s} /> },
              { id: 'missed', label: t('diet.tabs.missed'), body: <MissedTab /> },
              { id: 'menu', label: t('diet.master.tab'), body: <MenuTab settings={s} /> },
              { id: 'billing', label: t('diet.bill.tab'), body: <BillingTab /> },
              {
                id: 'settings',
                label: t('diet.tabs.settings'),
                body: <SettingsTab settings={s} />,
              },
            ]}
          />
        )}
      </QueryView>
    </Page>
  );
}
