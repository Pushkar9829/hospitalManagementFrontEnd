import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addConsoleStrings } from '@hms/i18n/console';
import { Card, EmptyState, Page, PageHeader } from '@hms/ui';
import { useStrings } from '../../../lib/useStrings.js';
import { BarList } from '../../dx-kit/BarList.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { usePlatformMetricsQuery, usePlatformTenantsQuery } from '../api.js';
import { TenantStatusBadge } from '../components/Badges.jsx';
import { TENANT_STATUSES, compactInr, daysUntil, fmtDate, localeOf } from '../format.js';

/** One hospital in a short list: name, state, and a note (days left, reason). */
function TenantRow({ tenant, note }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Link to={`/tenants/${tenant.id}`} className="font-semibold text-ink hover:underline">
        {tenant.name}
      </Link>
      <TenantStatusBadge status={tenant.status} />
      {note && <span className="text-sm text-muted">{note}</span>}
    </li>
  );
}

/**
 * Console dashboard (design board "Console"): revenue KPIs from GET /metrics, hospitals by state,
 * and the hospitals that need a look (overdue, read-only, suspended, trials about to end).
 */
export default function DashboardPage() {
  useStrings(addConsoleStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const metrics = usePlatformMetricsQuery();
  const trials = usePlatformTenantsQuery({ status: 'TRIAL', limit: 100 });
  const attention = [
    usePlatformTenantsQuery({ status: 'PAST_DUE', limit: 20 }),
    usePlatformTenantsQuery({ status: 'READ_ONLY', limit: 20 }),
    usePlatformTenantsQuery({ status: 'SUSPENDED', limit: 20 }),
  ];
  const ending = useMemo(
    () =>
      (trials.data?.items ?? [])
        .map((x) => ({ ...x, left: daysUntil(x.trialEndsAt) }))
        .filter((x) => x.left != null && x.left <= 7)
        .sort((a, b) => a.left - b.left),
    [trials.data],
  );
  const flagged = attention.flatMap((q) => q.data?.items ?? []);

  return (
    <Page>
      <PageHeader title={t('console.dash.title')} description={t('console.dash.description')} />
      <QueryView query={metrics} rows={2}>
        {(m) => (
          <div className="flex flex-col gap-4">
            <KpiRow
              items={[
                {
                  label: t('console.dash.mrr'),
                  value: compactInr(m.mrr),
                  sub: t('console.dash.mrrSub'),
                },
                {
                  label: t('console.dash.arr'),
                  value: compactInr(m.arr),
                  sub: t('console.dash.arrSub'),
                },
                {
                  label: t('console.dash.paying'),
                  value: m.paying.toLocaleString(locale),
                  sub: t('console.dash.payingSub'),
                },
                {
                  label: t('console.dash.trials'),
                  value: m.trials.toLocaleString(locale),
                  sub: t('console.dash.trialsSub', { n: ending.length }),
                  tone: ending.length ? 'warning' : 'neutral',
                },
                {
                  label: t('console.dash.churn'),
                  value: `${m.churn30}%`,
                  sub: t('console.dash.churnSub'),
                  tone: m.churn30 > 2 ? 'critical' : 'neutral',
                },
                {
                  label: t('console.dash.arpa'),
                  value: compactInr(m.arpa),
                  sub: t('console.dash.arpaSub'),
                },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title={t('console.dash.byStatus')}>
                <BarList
                  label={t('console.dash.byStatus')}
                  items={TENANT_STATUSES.map((s) => ({
                    label: t(`console.status.${s}`),
                    value: m.tenants?.[s] ?? 0,
                  }))}
                />
                <p className="mt-4 text-sm text-muted">
                  {t('console.dash.priceVersion', { v: m.priceVersion })}
                </p>
              </Card>
              <Card
                title={t('console.dash.attention')}
                description={t('console.dash.attentionHint')}
              >
                {flagged.length ? (
                  <ul className="divide-y divide-line">
                    {flagged.map((x) => (
                      <TenantRow key={x.id} tenant={x} note={x.statusReason} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState title={t('console.dash.attentionNone')} />
                )}
              </Card>
              <Card title={t('console.dash.endingTrials')}>
                {ending.length ? (
                  <ul className="divide-y divide-line">
                    {ending.map((x) => (
                      <TenantRow
                        key={x.id}
                        tenant={x}
                        note={
                          x.left < 0
                            ? t('console.ten.ended')
                            : `${t('console.ten.daysLeft', { count: x.left })} · ${fmtDate(x.trialEndsAt, locale)}`
                        }
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState title={t('console.dash.endingNone')} />
                )}
              </Card>
            </div>
          </div>
        )}
      </QueryView>
    </Page>
  );
}
