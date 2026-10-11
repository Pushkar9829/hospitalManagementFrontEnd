import { useTranslation } from 'react-i18next';
import { addLabStrings } from '@hms/i18n/lab';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { Card, EmptyState, Page, PageHeader, cn } from '@hms/ui';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { BarList } from '../../dx-kit/BarList.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtNumber, localeOf } from '../../dx-kit/format.js';
import { useLabIndicatorsQuery, useLabTatQuery } from '../api.js';

const PERIODS = ['today', 'week', 'month'];

function PeriodSwitch({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('lab.ana.period')}
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
          {t(`lab.ana.periods.${p}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * Lab analytics (board LabAnalytics, route /lab/analytics): TAT by stage, priority and test
 * against the targets (rule R11) and the NABL quality indicators: rejection rate by reason and
 * ward, critical calls in time, QC rejections and amended reports.
 */
export default function LabAnalyticsPage() {
  useStrings(addDxkitStrings, addLabStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [period, setPeriod] = useUrlState('period', 'today');
  const tat = useLabTatQuery({ period });
  const ind = useLabIndicatorsQuery({ period });
  const pct = (n) => (n == null ? '-' : `${fmtNumber(n, locale, 1)}%`);
  const min = (n) => (n == null ? '-' : t('lab.ana.min', { n }));
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.crumb') }, { label: t('lab.ana.title') }]}
        title={t('lab.ana.title')}
        description={t('lab.ana.description')}
      />
      <PeriodSwitch value={period} onChange={setPeriod} />
      <QueryView query={ind} rows={2}>
        {(k) => (
          <KpiRow
            className="xl:grid-cols-6"
            items={[
              {
                label: t('lab.ana.kpi.ordered'),
                value: fmtNumber(k.ordered, locale),
                sub: t('lab.ana.kpi.stat', { count: k.stat }),
              },
              { label: t('lab.ana.kpi.released'), value: fmtNumber(k.released, locale) },
              {
                label: t('lab.ana.kpi.rejection'),
                value: pct(k.rejectionRate),
                sub: t('lab.ana.kpi.target', { n: `< ${k.targets.rejectionRate}%` }),
                tone: k.rejectionRate > k.targets.rejectionRate ? 'warning' : undefined,
              },
              {
                label: t('lab.ana.kpi.critical'),
                value: pct(k.criticalInTime),
                sub: t('lab.ana.kpi.criticalSub', { count: k.criticalCalls, open: k.criticalOpen }),
                tone: k.criticalCalls && k.criticalInTime < 100 ? 'critical' : undefined,
              },
              {
                label: t('lab.ana.kpi.qc'),
                value: pct(k.qcRejectionRate),
                sub: t('lab.ana.kpi.qcSub', { count: k.qcRuns }),
                tone: k.qcRejectionRate > k.targets.qcRejectionRate ? 'warning' : undefined,
              },
              {
                label: t('lab.ana.kpi.amended'),
                value: pct(k.amendedRate),
                sub: t('lab.ana.kpi.amendedSub'),
              },
            ]}
          />
        )}
      </QueryView>
      <QueryView query={tat} rows={4}>
        {(d) => (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card
              title={t('lab.ana.tatTitle')}
              description={t('lab.ana.tatSub', { pct: pct(d.withinTarget), count: d.released })}
            >
              <BarList
                label={t('lab.ana.tatTitle')}
                items={d.stages.map((s) => ({
                  label: t(`lab.ana.stages.${s.stage}`),
                  value: s.medianMin ?? 0,
                  text: min(s.medianMin),
                }))}
              />
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                {d.byPriority.map((p) => (
                  <li key={p.priority}>
                    <strong>{t(`lab.priority.${p.priority}`)}</strong>{' '}
                    {t('lab.ana.priorityLine', {
                      pct: pct(p.withinTarget),
                      target: p.targetMin,
                      count: p.released,
                    })}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={t('lab.ana.byTest')}>
              {d.byTest.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-sm">
                    <caption className="sr-only">{t('lab.ana.byTest')}</caption>
                    <thead className="bg-surface-2 text-left text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t('lab.ana.cols.test')}</th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {t('lab.ana.cols.released')}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {t('lab.ana.cols.median')}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {t('lab.ana.cols.inTarget')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {d.byTest.map((x) => (
                        <tr key={x.code}>
                          <td className="px-3 py-2">{x.name}</td>
                          <td className="tabular px-3 py-2 text-right">{x.released}</td>
                          <td className="tabular px-3 py-2 text-right">{min(x.medianMin)}</td>
                          <td className="tabular px-3 py-2 text-right">{pct(x.withinTarget)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState bordered={false} title={t('lab.ana.noReleased')} />
              )}
            </Card>
          </div>
        )}
      </QueryView>
      <QueryView query={ind} rows={3}>
        {(k) => (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title={t('lab.ana.rejectReasons', { count: k.rejected })}>
              {k.rejectionsByReason.length ? (
                <BarList
                  label={t('lab.ana.rejectReasons', { count: k.rejected })}
                  items={k.rejectionsByReason.map((r) => ({
                    label: t(`lab.reject.${r.key}`, { defaultValue: r.key }),
                    value: r.count,
                    text: String(r.count),
                  }))}
                />
              ) : (
                <EmptyState bordered={false} title={t('lab.ana.noRejections')} />
              )}
            </Card>
            <Card title={t('lab.ana.byDepartment')}>
              <BarList
                label={t('lab.ana.byDepartment')}
                items={k.byDepartment.map((r) => ({
                  label: t(`lab.dept.${r.key}`, { defaultValue: r.key }),
                  value: r.count,
                  text: String(r.count),
                }))}
              />
            </Card>
            <Card title={t('lab.ana.pending')}>
              {k.pendingByDepartment.length ? (
                <BarList
                  label={t('lab.ana.pending')}
                  items={k.pendingByDepartment.map((r) => ({
                    label: t(`lab.dept.${r.key}`, { defaultValue: r.key }),
                    value: r.count,
                    text: String(r.count),
                  }))}
                />
              ) : (
                <EmptyState bordered={false} title={t('lab.none')} />
              )}
            </Card>
          </div>
        )}
      </QueryView>
    </Page>
  );
}
