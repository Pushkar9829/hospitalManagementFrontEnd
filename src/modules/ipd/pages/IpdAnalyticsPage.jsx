import { useTranslation } from 'react-i18next';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { Card, EmptyState, Page, PageHeader, cn } from '@hms/ui';
import { inr } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { BarList } from '../../dx-kit/BarList.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtNumber, localeOf } from '../../dx-kit/format.js';
import { useIpdCensusQuery, useIpdIndicatorsQuery } from '../api.js';

const PERIODS = ['today', 'week', 'month'];

function PeriodSwitch({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('ipd.ana.period')}
      className="inline-flex gap-1 rounded-control bg-neutral-bg p-1"
    >
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={cn(
            'min-h-9 cursor-pointer rounded-control px-3 text-sm font-semibold',
            value === p ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {t(`ipd.ana.periods.${p}`)}
        </button>
      ))}
    </div>
  );
}

/** Minutes as "45 min" or "2 h 10 min"; a dash when there is nothing to measure. */
function useDuration() {
  const { t } = useTranslation();
  return (m) => {
    if (m == null) return '-';
    if (m < 60) return t('ipd.ana.min', { n: m });
    return t('ipd.ana.hMin', { h: Math.floor(m / 60), m: m % 60 });
  };
}

/**
 * IPD analytics (board IpdAnalytics, route /ipd/analytics): the census now by ward
 * (GET /reports/ipd-census) and the period's indicators: occupancy, length of stay, turnover,
 * death and LAMA rates, discharge and bed turnaround, revenue per bed day, doses on time and the
 * insurer's reply time (GET /reports/ipd-indicators).
 */
export default function IpdAnalyticsPage() {
  useStrings(addDxkitStrings, addIpdStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const dur = useDuration();
  const [period, setPeriod] = useUrlState('period', 'month');
  const census = useIpdCensusQuery();
  const ind = useIpdIndicatorsQuery({ period });
  const pct = (n) => `${fmtNumber(n, locale, 1)}%`;
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.ana.title') }]}
        title={t('ipd.ana.title')}
        description={t('ipd.ana.description')}
      />
      <QueryView query={census} rows={4}>
        {(c) => (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
            <Card
              title={t('ipd.ana.censusTitle')}
              description={t('ipd.ana.censusSub', {
                occupied: c.occupied,
                beds: c.beds,
                pct: pct(c.occupancy),
              })}
            >
              <BarList
                label={t('ipd.ana.censusTitle')}
                items={c.items.map((w) => ({
                  label: w.ward.name,
                  value: w.occupancy,
                  text: t('ipd.ana.wardLine', {
                    n: w.occupied,
                    total: w.beds,
                    pct: pct(w.occupancy),
                  }),
                }))}
              />
            </Card>
            <Card title={t('ipd.ana.patientsTitle', { count: c.occupied })}>
              {c.occupied ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm">
                    <caption className="sr-only">
                      {t('ipd.ana.patientsTitle', { count: c.occupied })}
                    </caption>
                    <thead className="bg-surface-2 text-left text-muted">
                      <tr>
                        {['bed', 'patient', 'ward', 'days', 'consultant'].map((k) => (
                          <th key={k} className="px-3 py-2 font-semibold">
                            {t(`ipd.ana.cols.${k}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {c.items.flatMap((w) =>
                        w.patients.map((p) => (
                          <tr key={p.admissionId}>
                            <td className="tabular px-3 py-2">{p.bed}</td>
                            <td className="px-3 py-2">
                              {p.name} <span className="text-muted">· {p.ipNo}</span>
                            </td>
                            <td className="px-3 py-2">{w.ward.name}</td>
                            <td className="tabular px-3 py-2">{p.days}</td>
                            <td className="px-3 py-2 text-muted">{p.consultant ?? '-'}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState bordered={false} title={t('ipd.ana.noPatients')} />
              )}
            </Card>
          </div>
        )}
      </QueryView>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-ink">{t('ipd.ana.indicators')}</h2>
        <PeriodSwitch value={period} onChange={setPeriod} />
      </div>
      <QueryView query={ind} rows={4}>
        {(k) => (
          <div className="flex flex-col gap-4">
            <KpiRow
              className="xl:grid-cols-6"
              items={[
                {
                  label: t('ipd.ana.kpi.occupancy'),
                  value: pct(k.occupancy),
                  sub: t('ipd.ana.kpi.beds', { count: k.beds }),
                },
                {
                  label: t('ipd.ana.kpi.admissions'),
                  value: fmtNumber(k.admissions, locale),
                  sub: t('ipd.ana.kpi.discharges', { count: k.discharges }),
                },
                {
                  label: t('ipd.ana.kpi.alos'),
                  value: k.alos != null ? t('ipd.ana.days', { n: k.alos }) : '-',
                  sub: t('ipd.ana.kpi.turnover', { n: k.bedTurnover }),
                },
                {
                  label: t('ipd.ana.kpi.deathRate'),
                  value: pct(k.deathRate),
                  sub: t('ipd.ana.kpi.deaths', { count: k.deaths }),
                  tone: k.deaths ? 'warning' : undefined,
                },
                {
                  label: t('ipd.ana.kpi.lamaRate'),
                  value: pct(k.lamaRate),
                  sub: t('ipd.ana.kpi.lama', { count: k.lama }),
                },
                {
                  label: t('ipd.ana.kpi.revenue'),
                  value: inr(k.revenuePerBedDay),
                  sub: t('ipd.ana.kpi.revenueSub'),
                },
              ]}
            />
            <KpiRow
              items={[
                {
                  label: t('ipd.ana.kpi.dischargeTat'),
                  value: dur(k.dischargeTurnaroundMin),
                  sub: t('ipd.ana.kpi.dischargeTatSub'),
                },
                {
                  label: t('ipd.ana.kpi.bedTat'),
                  value: dur(k.bedTurnaroundMin),
                  sub: t('ipd.ana.kpi.bedTatSub'),
                },
                {
                  label: t('ipd.ana.kpi.doses'),
                  value: k.dosesDue ? pct(k.dosesOnTime) : '-',
                  sub: t('ipd.ana.kpi.dosesSub', {
                    count: k.dosesDue,
                    target: k.targets.dosesOnTime,
                  }),
                  tone: k.dosesDue
                    ? k.dosesOnTime >= k.targets.dosesOnTime
                      ? 'success'
                      : 'warning'
                    : undefined,
                },
                {
                  label: t('ipd.ana.kpi.preauth'),
                  value: dur(k.preauthReplyMin),
                  sub: t('ipd.ana.kpi.preauthSub', { n: k.targets.preauthReplyMin }),
                  tone:
                    k.preauthReplyMin == null
                      ? undefined
                      : k.preauthReplyMin <= k.targets.preauthReplyMin
                        ? 'success'
                        : 'warning',
                },
              ]}
            />
            <p className="text-sm text-muted">{t('ipd.ana.range', { from: k.from, to: k.to })}</p>
          </div>
        )}
      </QueryView>
    </Page>
  );
}
