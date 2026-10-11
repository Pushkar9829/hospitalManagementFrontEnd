import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { addBillingStrings } from '@hms/i18n/billing';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Page,
  PageHeader,
  StatusBadge,
  cn,
} from '@hms/ui';
import { inr } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { BarList } from '../../dx-kit/BarList.jsx';
import { ColumnChart } from '../../dx-kit/ColumnChart.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import { downloadCsv } from '../../opd/opd.js';
import { useBillingAnalyticsQuery } from '../api.js';

const DAY = 86_400_000;
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const shift = (iso, days) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);

/** The from/to of a preset, in IST calendar days. */
function presetRange(preset, today = istToday()) {
  const month = today.slice(0, 7);
  if (preset === 'week') return { from: shift(today, -6), to: today };
  if (preset === 'month') return { from: `${month}-01`, to: today };
  if (preset === 'lastMonth') {
    const end = shift(`${month}-01`, -1);
    return { from: `${end.slice(0, 7)}-01`, to: end };
  }
  return { from: today, to: today };
}

const PRESETS = ['today', 'week', 'month', 'lastMonth'];
const STATE_TONE = { ok: 'success', watch: 'warning', act: 'critical', logged: 'neutral' };

/**
 * Billing analytics (design board "Billing analytics"): net revenue against the previous period,
 * collection efficiency, days to collect, patient dues; daily billed and collected; revenue by
 * service group and payer; receivables by age and payer; leakage checks with targets. The period
 * is kept in the URL so a link opens the same view.
 */
export default function BillAnalyticsPage() {
  useStrings(addBillingStrings, addDxkitStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [preset, setPreset] = useUrlState('period', 'month');
  const [fromParam, setFrom] = useUrlState('from', '');
  const [toParam, setTo] = useUrlState('to', '');
  const range = fromParam && toParam ? { from: fromParam, to: toParam } : presetRange(preset);
  const query = useBillingAnalyticsQuery(range);
  const groupName = (g) =>
    t(`billing.ana.groups.${g}`, { defaultValue: g.charAt(0) + g.slice(1).toLowerCase() });

  return (
    <Page>
      <PageHeader title={t('billing.ana.title')} description={t('billing.ana.description')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label={t('billing.ana.period')}
          className="inline-flex gap-1 rounded-control bg-neutral-bg p-1"
        >
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={!fromParam && preset === p}
              onClick={() => setPreset(p, { reset: ['from', 'to'] })}
              className={cn(
                'min-h-9 cursor-pointer rounded-control px-3 text-sm font-semibold',
                !fromParam && preset === p
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-muted hover:text-ink',
              )}
            >
              {t(`billing.ana.periods.${p}`)}
            </button>
          ))}
        </div>
        <FormField label={t('billing.ana.from')}>
          <Input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setFrom(e.target.value, { set: { to: range.to } })}
          />
        </FormField>
        <FormField label={t('billing.ana.to')}>
          <Input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && setTo(e.target.value, { set: { from: range.from } })}
          />
        </FormField>
      </div>

      <QueryView query={query} errorTitle={t('billing.ana.failed')} rows={4}>
        {(a) => {
          const days = a.daily.length;
          const change = a.revenue.change;
          const checks = [
            {
              id: 'discount',
              label: t('billing.ana.checks.discount'),
              value: `${a.leakage.discount.percent}% · ${inr(a.leakage.discount.amount)}`,
              target: t('billing.ana.checks.discountTarget'),
              state:
                a.leakage.discount.percent < 5
                  ? 'ok'
                  : a.leakage.discount.percent < 8
                    ? 'watch'
                    : 'act',
            },
            {
              id: 'cancellations',
              label: t('billing.ana.checks.cancellations'),
              value: t('billing.ana.checks.cancellationsValue', {
                count: a.leakage.cancellations.count,
                amount: inr(a.leakage.cancellations.amount),
              }),
              target: t('billing.ana.checks.cancellationsTarget'),
              state: 'logged',
            },
            {
              id: 'refunds',
              label: t('billing.ana.checks.refunds'),
              value: t('billing.ana.checks.cancellationsValue', {
                count: a.leakage.refunds.count,
                amount: inr(a.leakage.refunds.amount),
              }),
              target: t('billing.ana.checks.refundsTarget'),
              state: 'logged',
            },
            {
              id: 'drafts',
              label: t('billing.ana.checks.drafts'),
              value: a.leakage.oldDrafts.toLocaleString(locale),
              target: t('billing.ana.checks.draftsTarget'),
              state: a.leakage.oldDrafts ? 'act' : 'ok',
            },
            {
              id: 'variance',
              label: t('billing.ana.checks.variance', {
                limit: inr(a.leakage.shiftVariance.threshold),
              }),
              value: t('billing.ana.checks.varianceValue', {
                over: a.leakage.shiftVariance.over,
                shifts: a.leakage.shiftVariance.shifts,
              }),
              target: t('billing.ana.checks.varianceTarget'),
              state: a.leakage.shiftVariance.over ? 'watch' : 'ok',
            },
          ];
          const exportCsv = () =>
            downloadCsv(
              `billing-${a.from}-${a.to}.csv`,
              [t('billing.ana.day'), t('billing.ana.billed'), t('billing.ana.collected')],
              a.daily.map((d) => [d.date, d.billed / 100, d.collected / 100]),
            );
          return (
            <div className="flex flex-col gap-4">
              <KpiRow
                items={[
                  {
                    label: t('billing.ana.net'),
                    value: inr(a.revenue.net),
                    sub:
                      change == null
                        ? t('billing.ana.bills', {
                            n: a.revenue.bills,
                            op: a.revenue.op,
                            ip: a.revenue.ip,
                          })
                        : t('billing.ana.vsPrevious', {
                            change: `${change > 0 ? '+' : ''}${change}%`,
                            days,
                          }),
                    tone: change == null ? 'neutral' : change >= 0 ? 'success' : 'critical',
                  },
                  {
                    label: t('billing.ana.averageDay'),
                    value: inr(a.revenue.averageDay),
                    sub: t('billing.ana.bills', {
                      n: a.revenue.bills,
                      op: a.revenue.op,
                      ip: a.revenue.ip,
                    }),
                  },
                  {
                    label: t('billing.ana.efficiency'),
                    value: `${a.collection.efficiency}%`,
                    sub: t('billing.ana.efficiencySub', { amount: inr(a.collection.collected) }),
                    tone: a.collection.efficiency >= 95 ? 'success' : 'warning',
                  },
                  {
                    label: t('billing.ana.daysToCollect'),
                    value:
                      a.collection.daysToCollect == null ? '–' : String(a.collection.daysToCollect),
                    sub:
                      a.collection.daysToCollect == null
                        ? t('billing.ana.noDays')
                        : t('billing.ana.daysToCollectSub'),
                  },
                  {
                    label: t('billing.ana.patientDues'),
                    value: inr(a.collection.patientDues),
                    sub: t('billing.ana.patientDuesSub', { date: fmtDate(a.to, locale) }),
                  },
                ]}
              />

              <Card
                title={t('billing.ana.trend')}
                actions={
                  <Button size="sm" variant="secondary" onClick={exportCsv}>
                    <Download aria-hidden="true" className="size-4" />
                    {t('billing.ana.export')}
                  </Button>
                }
              >
                <ColumnChart
                  label={t('billing.ana.trend')}
                  tableLabel={t('billing.ana.trend')}
                  columnHeader={t('billing.ana.day')}
                  valueHeader={t('billing.ana.billed')}
                  items={a.daily.map((d) => ({
                    key: d.date,
                    label: days > 14 ? d.date.slice(8) : fmtDate(d.date, locale).slice(0, 6),
                    value: d.billed,
                    tooltip: t('billing.ana.trendTip', {
                      date: fmtDate(d.date, locale),
                      billed: inr(d.billed),
                      collected: inr(d.collected),
                    }),
                  }))}
                />
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title={t('billing.ana.byGroup')}>
                  <BarList
                    label={t('billing.ana.byGroup')}
                    items={a.byGroup.map((g) => ({
                      label: groupName(g.group),
                      value: g.amount,
                      text: inr(g.amount),
                    }))}
                  />
                </Card>
                <Card title={t('billing.ana.byPayer')}>
                  <BarList
                    tone="accent"
                    label={t('billing.ana.byPayer')}
                    items={a.byPayer.map((p) => ({
                      label: t(`billing.ana.payers.${p.payer}`),
                      value: p.amount,
                      text: inr(p.amount),
                    }))}
                  />
                </Card>
              </div>

              <Card
                title={t('billing.ana.ageing')}
                description={t('billing.ana.ageingHint')}
                padding={false}
              >
                <DataTable
                  caption={t('billing.ana.ageing')}
                  data={a.ageing}
                  getRowId={(r) => r.payer}
                  columns={[
                    {
                      id: 'payer',
                      header: t('billing.ana.payer'),
                      cell: ({ row }) => t(`billing.ana.payers.${row.original.payer}`),
                    },
                    ...['d0_30', 'd31_60', 'd61_90', 'd90', 'total'].map((k) => ({
                      id: k,
                      header:
                        k === 'total' ? t('billing.ana.total') : t(`billing.ana.buckets.${k}`),
                      cell: ({ row }) => (
                        <span
                          className={cn(
                            'tabular',
                            k === 'd90' && row.original.d90 > 0 && 'font-semibold text-critical',
                          )}
                        >
                          {inr(row.original[k])}
                        </span>
                      ),
                    })),
                  ]}
                />
              </Card>

              <Card title={t('billing.ana.leakage')} padding={false}>
                <DataTable
                  caption={t('billing.ana.leakage')}
                  data={checks}
                  columns={[
                    {
                      id: 'label',
                      header: t('billing.ana.check'),
                      cell: ({ row }) => row.original.label,
                    },
                    {
                      id: 'value',
                      header: t('billing.ana.value'),
                      cell: ({ row }) => <span className="tabular">{row.original.value}</span>,
                    },
                    {
                      id: 'target',
                      header: t('billing.ana.target'),
                      cell: ({ row }) => row.original.target,
                    },
                    {
                      id: 'state',
                      header: t('billing.ana.state'),
                      cell: ({ row }) => (
                        <StatusBadge
                          tone={STATE_TONE[row.original.state]}
                          label={t(`billing.ana.states.${row.original.state}`)}
                        />
                      ),
                    },
                  ]}
                />
              </Card>
            </div>
          );
        }}
      </QueryView>
    </Page>
  );
}
