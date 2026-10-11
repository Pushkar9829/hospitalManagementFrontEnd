import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { addOpdStrings } from '@hms/i18n/opd';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { Button, Card, FormField, Page, PageHeader, Select, StatusBadge, cn } from '@hms/ui';
import { inr } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { BarList } from '../../dx-kit/BarList.jsx';
import { ColumnChart } from '../../dx-kit/ColumnChart.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtNumber, localeOf } from '../../dx-kit/format.js';
import {
  useOpdDepartmentsQuery,
  useOpdDoctorPerformanceQuery,
  useOpdWaitTimesQuery,
} from '../api.js';
import { downloadCsv } from '../opd.js';

const PERIODS = ['today', 'week', 'month'];
const hh = (h) => String(h).padStart(2, '0');

/** Today / This week / This month, kept in the URL. */
function PeriodSwitch({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('opd.ana.period')}
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
          {t(`opd.ana.periods.${p}`)}
        </button>
      ))}
    </div>
  );
}

/** Late start: on time, a little late, or late enough to matter (status colour plus words). */
function StartBadge({ min }) {
  const { t } = useTranslation();
  if (!min) return <StatusBadge tone="success" label={t('opd.ana.onTime')} />;
  return (
    <StatusBadge tone={min >= 20 ? 'critical' : 'warning'} label={t('opd.ana.late', { min })} />
  );
}

/**
 * OPD analytics (board OpdAnalytics, route /opd/analytics): visits, wait and consult times
 * against the NABH targets, no-shows, revenue per visit and OPD to IPD conversion
 * (GET /reports/opd-wait-times), the median wait at each stage, arrivals by hour, and each
 * doctor's day (GET /reports/opd-doctor-performance). Filters are kept in the URL.
 */
export default function OpdAnalyticsPage() {
  useStrings(addDxkitStrings, addOpdStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [period, setPeriod] = useUrlState('period', 'today');
  const [department, setDepartment] = useUrlState('department', '');
  const params = { period, department: department || undefined };
  const waits = useOpdWaitTimesQuery(params);
  const doctors = useOpdDoctorPerformanceQuery(params);
  const departments = useOpdDepartmentsQuery();
  const periodName = t(`opd.ana.periods.${period}`);

  const exportCsv = () => {
    const rows = (doctors.data?.items ?? []).map((d) => [
      d.doctor.name,
      d.doctor.department,
      d.booked,
      d.seen,
      d.noShow,
      d.lateStartMin,
      d.medianWaitMin,
      d.medianConsultMin,
      d.utilisation,
      d.testsPerVisit,
      d.revenue / 100,
    ]);
    downloadCsv(
      `opd-doctor-performance-${period}.csv`,
      [
        t('opd.ana.cols.doctor'),
        t('opd.ana.cols.department'),
        t('opd.ana.cols.booked'),
        t('opd.ana.cols.seen'),
        t('opd.ana.cols.noShow'),
        t('opd.ana.cols.lateMin'),
        t('opd.ana.cols.wait'),
        t('opd.ana.cols.consult'),
        t('opd.ana.cols.utilisation'),
        t('opd.ana.cols.tests'),
        t('opd.ana.cols.revenueRupees'),
      ],
      rows,
    );
  };

  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('opd.crumbs.opd') }, { label: t('opd.ana.title') }]}
        title={t('opd.ana.title')}
        description={t('opd.ana.description')}
      />
      <div className="flex flex-wrap items-end gap-3">
        <PeriodSwitch value={period} onChange={setPeriod} />
        <FormField label={t('opd.ana.department')} className="w-56">
          <Select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder={t('opd.ana.allDepartments')}
            options={(departments.data?.items ?? []).map((d) => ({ value: d.name, label: d.name }))}
          />
        </FormField>
        <Button
          variant="secondary"
          className="ml-auto"
          onClick={exportCsv}
          disabled={!doctors.data?.items?.length}
        >
          <Download size={16} aria-hidden="true" />
          {t('opd.ana.export')}
        </Button>
      </div>

      <QueryView query={waits} rows={6}>
        {(w) => {
          const k = w.kpis;
          const peak = w.arrivalsByHour.reduce(
            (a, b) => (b.count > a.count ? b : a),
            w.arrivalsByHour[0],
          );
          return (
            <div className="flex flex-col gap-4">
              <KpiRow
                className="xl:grid-cols-6"
                items={[
                  {
                    label: t(`opd.ana.kpi.visits.${period}`),
                    value: fmtNumber(k.visits, locale),
                    sub: t('opd.ana.kpi.mix', { booked: k.bookedShare, walkIn: k.walkInShare }),
                  },
                  {
                    label: t('opd.ana.kpi.total'),
                    value: t('opd.ana.min', { n: k.medianTotalMin }),
                    sub: t('opd.ana.kpi.totalTarget', { n: w.targets.totalMin }),
                    tone: k.medianTotalMin <= w.targets.totalMin ? 'success' : 'warning',
                  },
                  {
                    label: t('opd.ana.kpi.wait'),
                    value: t('opd.ana.min', { n: k.waitToDoctorMin }),
                    sub: t('opd.ana.kpi.waitTarget', { n: w.targets.waitToDoctorMin }),
                    tone: k.waitToDoctorMin <= w.targets.waitToDoctorMin ? 'success' : 'warning',
                  },
                  {
                    label: t('opd.ana.kpi.noShow'),
                    value: `${fmtNumber(k.noShowRate, locale, 1)}%`,
                    sub: t('opd.ana.kpi.noShows', { count: k.noShows }),
                    tone: k.noShowRate <= w.targets.noShowRate ? 'neutral' : 'warning',
                  },
                  {
                    label: t('opd.ana.kpi.revenue'),
                    value: inr(k.revenuePerVisit),
                    sub: t('opd.ana.kpi.revenueSub'),
                  },
                  {
                    label: t('opd.ana.kpi.ipd'),
                    value: `${fmtNumber(k.ipdConversion, locale, 1)}%`,
                    sub: t('opd.ana.kpi.admissions', { count: k.admissions }),
                  },
                ]}
              />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card
                  title={t('opd.ana.stagesTitle', { period: periodName })}
                  description={t('opd.ana.stagesHint', { n: w.targets.totalMin })}
                >
                  <BarList
                    label={t('opd.ana.stagesTitle', { period: periodName })}
                    items={w.stages.map((s) => ({
                      label: t(`opd.ana.stages.${s.stage}`),
                      value: s.medianMin,
                      text: t('opd.ana.min', { n: s.medianMin }),
                    }))}
                  />
                </Card>
                <Card
                  title={t('opd.ana.arrivalsTitle', { period: periodName })}
                  description={t('opd.ana.peak', {
                    from: `${hh(peak.hour)}:00`,
                    to: `${hh(peak.hour + 1)}:00`,
                  })}
                >
                  <ColumnChart
                    label={t('opd.ana.arrivalsTitle', { period: periodName })}
                    highlight={peak.hour}
                    tableLabel={t('opd.ana.showTable')}
                    columnHeader={t('opd.ana.hour')}
                    valueHeader={t('opd.ana.arrivals')}
                    items={w.arrivalsByHour.map((a) => ({
                      key: a.hour,
                      label: hh(a.hour),
                      value: a.count,
                      tooltip: t('opd.ana.hourTip', {
                        from: `${hh(a.hour)}:00`,
                        to: `${hh(a.hour)}:59`,
                        count: a.count,
                      }),
                    }))}
                  />
                </Card>
              </div>
            </div>
          );
        }}
      </QueryView>

      <Card title={t('opd.ana.doctorsTitle', { period: periodName })} padding={false}>
        <QueryView query={doctors} empty={t('opd.ana.noDoctors')} isEmpty={(d) => !d.items.length}>
          {(d) => (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-sm">
                <caption className="sr-only">
                  {t('opd.ana.doctorsTitle', { period: periodName })}
                </caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      {t('opd.ana.cols.doctor')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t('opd.ana.cols.booked')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t('opd.ana.cols.seen')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t('opd.ana.cols.noShow')}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t('opd.ana.cols.started')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t('opd.ana.cols.wait')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t('opd.ana.cols.consult')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t('opd.ana.cols.utilisation')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t('opd.ana.cols.tests')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">
                      {t('opd.ana.cols.revenue')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.items.map((r) => (
                    <tr key={r.doctor.id}>
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <strong className="block font-semibold text-ink">{r.doctor.name}</strong>
                        <span className="text-muted">{r.doctor.department}</span>
                      </th>
                      <td className="tabular px-3 py-2 text-right">
                        {fmtNumber(r.booked, locale)}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{fmtNumber(r.seen, locale)}</td>
                      <td className="tabular px-3 py-2 text-right">
                        {fmtNumber(r.noShow, locale)}
                      </td>
                      <td className="px-3 py-2">
                        <StartBadge min={r.lateStartMin} />
                      </td>
                      <td
                        className={cn(
                          'tabular px-3 py-2 text-right',
                          r.medianWaitMin > (waits.data?.targets.waitToDoctorMin ?? 30) &&
                            'font-semibold text-critical',
                        )}
                      >
                        {t('opd.ana.min', { n: r.medianWaitMin })}
                        {r.medianWaitMin > (waits.data?.targets.waitToDoctorMin ?? 30) && (
                          <span className="sr-only"> ({t('opd.ana.overTarget')})</span>
                        )}
                      </td>
                      <td className="tabular px-3 py-2 text-right">
                        {t('opd.ana.min', { n: r.medianConsultMin })}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{r.utilisation}%</td>
                      <td className="tabular px-3 py-2 text-right">
                        {fmtNumber(r.testsPerVisit, locale, 1)}
                      </td>
                      <td className="tabular px-4 py-2 text-right">{inr(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryView>
      </Card>
    </Page>
  );
}
