import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addConsoleStrings } from '@hms/i18n/console';
import { Input, Page, PageHeader, Select } from '@hms/ui';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { RecordsTable } from '../../dx-kit/RecordsTable.jsx';
import { usePlatformTenantsQuery } from '../api.js';
import { TenantStatusBadge } from '../components/Badges.jsx';
import { TENANT_STATUSES, daysUntil, fmtDate, localeOf, tenantAddress } from '../format.js';

const MODES = {
  tenants: { title: 'console.ten.title', description: 'console.ten.description' },
  trials: { title: 'console.ten.trialsTitle', description: 'console.ten.trialsDescription' },
  subscriptions: { title: 'console.ten.subsTitle', description: 'console.ten.subsDescription' },
};

/**
 * Hospitals on the platform (design board "Console", tenants table). The same list serves three
 * menu items: every hospital, trials only (with days left), and subscriptions (plan, cycle and
 * the change due at renewal). A row opens the hospital's page.
 */
export function TenantList({ mode = 'tenants' }) {
  useStrings(addConsoleStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const navigate = useNavigate();
  const [q, setQ] = useUrlState('q', '');
  const [status, setStatus] = useUrlState('status', '');
  const args = { q: q || undefined, status: mode === 'trials' ? 'TRIAL' : status || undefined };

  const columns = useMemo(() => {
    const name = {
      id: 'name',
      header: t('console.ten.hospital'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-semibold text-ink">{row.original.name}</span>
          <span className="font-mono text-sm text-muted">
            {tenantAddress(row.original.subdomain)}
          </span>
        </span>
      ),
    };
    const plan = {
      id: 'plan',
      header: t('console.ten.plan'),
      cell: ({ row }) =>
        row.original.subscription?.plan ?? row.original.plan ?? t('console.ten.alaCarte'),
    };
    const state = {
      id: 'status',
      header: t('console.ten.state'),
      cell: ({ row }) => <TenantStatusBadge status={row.original.status} />,
    };
    if (mode === 'trials')
      return [
        name,
        plan,
        {
          id: 'ends',
          header: t('console.ten.trialEnds'),
          cell: ({ row }) => {
            const left = daysUntil(row.original.trialEndsAt);
            return (
              <span className="flex flex-col">
                <span>{fmtDate(row.original.trialEndsAt, locale)}</span>
                <span
                  className={
                    left != null && left <= 3 ? 'text-sm text-critical' : 'text-sm text-muted'
                  }
                >
                  {left == null
                    ? ''
                    : left < 0
                      ? t('console.ten.ended')
                      : t('console.ten.daysLeft', { count: left })}
                </span>
              </span>
            );
          },
        },
        {
          id: 'since',
          header: t('console.ten.since'),
          cell: ({ row }) => fmtDate(row.original.createdAt, locale),
        },
      ];
    if (mode === 'subscriptions')
      return [
        name,
        plan,
        {
          id: 'cycle',
          header: t('console.ten.cycle'),
          cell: ({ row }) => {
            const s = row.original.subscription;
            if (!s) return '–';
            return (
              <span className="flex flex-col">
                <span>{t(`console.ten.cycles.${s.cycle}`, { defaultValue: s.cycle })}</span>
                <span className="text-sm text-muted">
                  {s.converted ? t('console.ten.converted') : t('console.ten.notConverted')}
                </span>
              </span>
            );
          },
        },
        {
          id: 'period',
          header: t('console.ten.period'),
          cell: ({ row }) => {
            const p = row.original.subscription?.currentPeriod;
            return p?.start ? `${fmtDate(p.start, locale)} – ${fmtDate(p.end, locale)}` : '–';
          },
        },
        {
          id: 'pending',
          header: t('console.ten.pending'),
          cell: ({ row }) => {
            const p = row.original.subscription?.pending ?? [];
            if (!p.length) return <span className="text-muted">{t('console.ten.noPending')}</span>;
            return p
              .map((c) => (c.op === 'REMOVE' ? `− ${c.module}` : `${c.op} ${c.module ?? ''}`))
              .join(', ');
          },
        },
        state,
      ];
    return [
      name,
      plan,
      {
        id: 'modules',
        header: t('console.ten.modules'),
        cell: ({ row }) => t('console.ten.moduleCount', { count: row.original.modules.length }),
      },
      state,
      {
        id: 'since',
        header: t('console.ten.since'),
        cell: ({ row }) => fmtDate(row.original.createdAt, locale),
      },
    ];
  }, [mode, t, locale]);

  return (
    <Page>
      <PageHeader title={t(MODES[mode].title)} description={t(MODES[mode].description)} />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Input
          type="search"
          aria-label={t('console.ten.search')}
          placeholder={t('console.ten.search')}
          value={q}
          onChange={(e) => setQ(e.target.value, { reset: ['page'] })}
          className="w-full sm:w-80"
        />
        {mode !== 'trials' && (
          <Select
            aria-label={t('console.ten.state')}
            value={status}
            onChange={(e) => setStatus(e.target.value, { reset: ['page'] })}
            className="w-full sm:w-56"
          >
            <option value="">{t('console.ten.allStates')}</option>
            {TENANT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`console.status.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <RecordsTable
        useQuery={usePlatformTenantsQuery}
        args={args}
        columns={columns}
        caption={t('console.ten.caption')}
        emptyTitle={t('console.ten.empty')}
        onRowClick={(row) => navigate(`/tenants/${row.id}`)}
      />
    </Page>
  );
}

export default function TenantsPage() {
  return <TenantList mode="tenants" />;
}

export function TrialsPage() {
  return <TenantList mode="trials" />;
}

export function SubscriptionsPage() {
  return <TenantList mode="subscriptions" />;
}
