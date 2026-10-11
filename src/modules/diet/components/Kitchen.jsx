import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  Banner,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import {
  useKitchenConsumptionQuery,
  useKitchenCostingQuery,
  useKitchenStockQuery,
  useRecordConsumptionMutation,
} from '../api.js';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const monthStart = () => `${istToday().slice(0, 7)}-01`;
const blankLine = () => ({ itemId: '', qty: '' });

/** Kitchen stock costing: cost per meal, the food used each day, and the kitchen store. */
export function KitchenTab({ settings }) {
  const { t } = useTranslation();
  const [range, setRange] = useState({ from: monthStart(), to: istToday() });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t('diet.kit.hint')}</p>
      <div className="flex flex-wrap gap-3">
        <FormField label={t('diet.kit.from')}>
          <Input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
          />
        </FormField>
        <FormField label={t('diet.kit.to')}>
          <Input
            type="date"
            value={range.to}
            min={range.from}
            max={istToday()}
            onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
          />
        </FormField>
      </div>
      <Costing range={range} settings={settings} />
      <Consumption range={range} settings={settings} />
    </div>
  );
}

function Costing({ range, settings }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const q = useKitchenCostingQuery(range);
  const mealName = (code) => settings.meals.find((m) => m.code === code)?.name ?? code;
  return (
    <QueryView query={q} rows={4}>
      {(c) => (
        <>
          <KpiRow
            items={[
              { label: t('diet.kit.cost'), value: inr(c.cost) },
              { label: t('diet.kit.trays'), value: String(c.trays) },
              { label: t('diet.kit.perTray'), value: c.perTray == null ? '—' : inr(c.perTray) },
              {
                label: t('diet.kit.recovered'),
                value: inr(c.recovered),
                sub: t('diet.kit.chargedTrays', { count: c.charged }),
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t('diet.kit.byMeal')} padding={false}>
              <DataTable
                caption={t('diet.kit.byMeal')}
                data={c.meals.map((m) => ({ ...m, id: m.meal }))}
                empty={t('diet.kit.none')}
                columns={[
                  {
                    id: 'meal',
                    header: t('diet.kit.meal'),
                    cell: ({ row }) => mealName(row.original.meal),
                  },
                  {
                    id: 'trays',
                    header: t('diet.kit.trays'),
                    cell: ({ row }) => row.original.trays,
                  },
                  {
                    id: 'cost',
                    header: t('diet.kit.cost'),
                    cell: ({ row }) => inr(row.original.cost),
                  },
                  {
                    id: 'per',
                    header: t('diet.kit.perTray'),
                    cell: ({ row }) =>
                      row.original.perTray == null ? '—' : inr(row.original.perTray),
                  },
                ]}
              />
            </Card>
            <Card title={t('diet.kit.topItems')} padding={false}>
              <DataTable
                caption={t('diet.kit.topItems')}
                data={c.topItems.map((x) => ({ ...x, id: x.itemId }))}
                empty={t('diet.kit.none')}
                columns={[
                  { id: 'name', header: t('diet.kit.item'), cell: ({ row }) => row.original.name },
                  {
                    id: 'qty',
                    header: t('diet.kit.qty'),
                    cell: ({ row }) => `${row.original.qty} ${row.original.unit ?? ''}`,
                  },
                  {
                    id: 'value',
                    header: t('diet.kit.cost'),
                    cell: ({ row }) => inr(row.original.value),
                  },
                ]}
              />
            </Card>
          </div>
          <Card title={t('diet.kit.byDay')} padding={false}>
            <DataTable
              caption={t('diet.kit.byDay')}
              data={c.days.map((d) => ({ ...d, id: d.date }))}
              empty={t('diet.kit.none')}
              columns={[
                {
                  id: 'date',
                  header: t('diet.kit.date'),
                  cell: ({ row }) => fmtDate(row.original.date, locale),
                },
                { id: 'trays', header: t('diet.kit.trays'), cell: ({ row }) => row.original.trays },
                {
                  id: 'cost',
                  header: t('diet.kit.cost'),
                  cell: ({ row }) => inr(row.original.cost),
                },
                {
                  id: 'per',
                  header: t('diet.kit.perTray'),
                  cell: ({ row }) =>
                    row.original.perTray == null ? (
                      <StatusBadge tone="warning" label={t('diet.kit.noTrays')} />
                    ) : (
                      inr(row.original.perTray)
                    ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </QueryView>
  );
}

function Consumption({ range, settings }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const edit = can('diet:kitchen:update') || can('diet:production:update');
  const stock = useKitchenStockQuery();
  const used = useKitchenConsumptionQuery(range);
  const [record, state] = useRecordConsumptionMutation();
  const [date, setDate] = useState(istToday());
  const [meal, setMeal] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [failure, setFailure] = useState(null);
  const items = stock.data?.items ?? [];
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ready = lines.some((l) => l.itemId && Number(l.qty) > 0);
  return (
    <>
      {stock.isError && stock.error?.data?.error?.code === 'NO_KITCHEN_STORE' ? (
        <Banner tone="warning">{t('diet.kit.noStore')}</Banner>
      ) : (
        edit && (
          <Card title={t('diet.kit.record')} description={t('diet.kit.recordHint')}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3">
                <FormField label={t('diet.kit.date')}>
                  <Input
                    type="date"
                    value={date}
                    max={istToday()}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </FormField>
                <FormField label={t('diet.kit.meal')} className="w-48">
                  <Select
                    value={meal}
                    onChange={(e) => setMeal(e.target.value)}
                    options={[
                      { value: '', label: t('diet.kit.wholeDay') },
                      ...settings.meals.map((m) => ({ value: m.code, label: m.name })),
                    ]}
                  />
                </FormField>
              </div>
              {lines.map((l, i) => {
                const it = items.find((x) => x.itemId === l.itemId);
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <FormField label={t('diet.kit.item')} className="min-w-56 flex-1">
                      <Select
                        value={l.itemId}
                        onChange={(e) => setLine(i, { itemId: e.target.value })}
                        options={[
                          { value: '', label: '' },
                          ...items.map((x) => ({
                            value: x.itemId,
                            label: t('diet.kit.inStock', {
                              name: x.name,
                              qty: x.qty,
                              unit: x.unit,
                            }),
                          })),
                        ]}
                      />
                    </FormField>
                    <FormField
                      label={it ? t('diet.kit.qtyIn', { unit: it.unit }) : t('diet.kit.qty')}
                      className="w-32"
                    >
                      <Input
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) => setLine(i, { qty: e.target.value })}
                      />
                    </FormField>
                    {lines.length > 1 && (
                      <Button
                        variant="ghost"
                        aria-label={t('diet.kit.removeLine')}
                        icon={<Trash2 size={16} aria-hidden="true" />}
                        onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      />
                    )}
                  </div>
                );
              })}
              <ApiErrorNotice error={failure} />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon={<Plus size={16} aria-hidden="true" />}
                  onClick={() => setLines([...lines, blankLine()])}
                >
                  {t('diet.kit.addLine')}
                </Button>
                <Button
                  disabled={!ready}
                  loading={state.isLoading}
                  onClick={async () => {
                    setFailure(null);
                    try {
                      const r = await record({
                        date,
                        ...(meal ? { meal } : {}),
                        lines: lines
                          .filter((x) => x.itemId && Number(x.qty) > 0)
                          .map((x) => ({ itemId: x.itemId, qty: Number(x.qty) })),
                      }).unwrap();
                      toast({
                        tone: 'success',
                        title: t('diet.kit.recorded', { ref: r.ref, amount: inr(r.total) }),
                      });
                      setLines([blankLine()]);
                    } catch (e) {
                      setFailure(e);
                    }
                  }}
                >
                  {t('diet.kit.save')}
                </Button>
              </div>
            </div>
          </Card>
        )
      )}
      <Card title={t('diet.kit.used')} padding={false}>
        <QueryView query={used} rows={3}>
          {(d) => (
            <DataTable
              caption={t('diet.kit.used')}
              data={d.items}
              empty={t('diet.kit.none')}
              columns={[
                {
                  id: 'date',
                  header: t('diet.kit.date'),
                  cell: ({ row }) => fmtDate(row.original.date, locale),
                },
                {
                  id: 'meal',
                  header: t('diet.kit.meal'),
                  cell: ({ row }) =>
                    row.original.meal
                      ? (settings.meals.find((m) => m.code === row.original.meal)?.name ??
                        row.original.meal)
                      : t('diet.kit.wholeDay'),
                },
                {
                  id: 'lines',
                  header: t('diet.kit.items'),
                  cell: ({ row }) =>
                    row.original.lines.map((l) => `${l.name} ${l.qty} ${l.unit ?? ''}`).join(', '),
                },
                {
                  id: 'total',
                  header: t('diet.kit.cost'),
                  cell: ({ row }) => inr(row.original.total),
                },
                { id: 'by', header: t('diet.kit.by'), cell: ({ row }) => row.original.by ?? '' },
              ]}
            />
          )}
        </QueryView>
      </Card>
    </>
  );
}
