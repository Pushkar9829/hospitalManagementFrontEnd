import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { MODULE_CODES, MODULES } from '@hms/shared';
import { addConsoleStrings } from '@hms/i18n/console';
import { Button, Card, DataTable, Page, PageHeader, StatusBadge, useToast } from '@hms/ui';
import { inr, paiseFrom } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { usePlatformCan } from '../access.js';
import {
  CONSOLE_BASE,
  usePlatformPlansQuery,
  usePlatformTenantQuery,
  useSetTenantPlanMutation,
  useTenantStatusMutation,
} from '../api.js';
import { InvoiceStatusBadge, TenantStatusBadge } from '../components/Badges.jsx';
import { fmtDate, fmtDateTime, localeOf, tenantAddress } from '../format.js';

const MODULE_TONE = { ACTIVE: 'success', READ_ONLY: 'warning', DISABLED: 'neutral' };

/** Which status actions fit a hospital's state. */
function statusActions(status) {
  if (status === 'TRIAL') return ['EXTEND_TRIAL', 'SUSPEND'];
  if (status === 'READ_ONLY') return ['EXTEND_TRIAL', 'REACTIVATE', 'SUSPEND'];
  if (status === 'SUSPENDED') return ['REACTIVATE'];
  if (status === 'CLOSED') return [];
  return ['SUSPEND'];
}

function UsageLine({ label, used = 0, limit }) {
  const { t } = useTranslation();
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink">{label}</span>
        <span className="tabular font-semibold text-ink">
          {limit ? t('console.ten.ofLimit', { used, limit }) : t('console.ten.unlimited', { used })}
        </span>
      </div>
      {limit ? (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
          aria-valuetext={t('console.ten.ofLimit', { used, limit })}
          className="h-2.5 overflow-hidden rounded-chip bg-neutral-bg"
        >
          <div
            className={
              pct >= 90 ? 'h-full rounded-chip bg-critical' : 'h-full rounded-chip bg-primary'
            }
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One hospital (design board "Tenant detail"): state and why, subscription, usage against the
 * plan's limits, modules, invoices; Support/Sales act from here (suspend, reactivate, extend a
 * trial, set the plan). Every action asks for a reason and is audited on both sides.
 */
export default function TenantPage() {
  useStrings(addConsoleStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { id } = useParams();
  const { toast } = useToast();
  const can = usePlatformCan();
  const tenant = usePlatformTenantQuery(id);
  const plans = usePlatformPlansQuery(undefined, { skip: !can('platform:subscription:update') });
  const [statusAction, setStatusAction] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [setStatus] = useTenantStatusMutation();
  const [setPlan] = useSetTenantPlanMutation();

  return (
    <Page>
      <Link
        to="/tenants"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('console.ten.back')}
      </Link>
      <QueryView query={tenant} errorTitle={t('console.ten.notFound')}>
        {(x) => {
          const d = x.detail ?? {};
          const actions = can('platform:tenant:update') ? statusActions(x.status) : [];
          const invoiceColumns = [
            {
              id: 'number',
              header: t('console.inv.number'),
              cell: ({ row }) => <span className="font-mono">{row.original.number}</span>,
            },
            {
              id: 'period',
              header: t('console.inv.period'),
              cell: ({ row }) =>
                row.original.period?.start
                  ? `${fmtDate(row.original.period.start, locale)} – ${fmtDate(row.original.period.end, locale)}`
                  : fmtDate(row.original.issuedAt, locale),
            },
            {
              id: 'total',
              header: t('console.inv.total'),
              cell: ({ row }) => <span className="tabular">{inr(row.original.total)}</span>,
            },
            {
              id: 'status',
              header: t('console.ten.state'),
              cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
            },
            {
              id: 'pdf',
              header: t('console.inv.pdf'),
              cell: ({ row }) => (
                <a
                  className="text-primary hover:underline"
                  href={`${CONSOLE_BASE}/invoices/${row.original.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('console.inv.pdf')}
                </a>
              ),
            },
          ];
          return (
            <>
              <PageHeader
                title={x.name}
                description={<span className="font-mono">{tenantAddress(x.subdomain)}</span>}
                actions={
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <Button
                        key={a}
                        variant={a === 'SUSPEND' ? 'danger' : 'secondary'}
                        onClick={() => setStatusAction(a)}
                      >
                        {t(
                          a === 'SUSPEND'
                            ? 'console.ten.suspend'
                            : a === 'REACTIVATE'
                              ? 'console.ten.reactivate'
                              : 'console.ten.extend',
                        )}
                      </Button>
                    ))}
                    {can('platform:subscription:update') && x.status !== 'CLOSED' && (
                      <Button onClick={() => setPlanOpen(true)}>
                        {t('console.ten.changePlan')}
                      </Button>
                    )}
                  </div>
                }
              />
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <TenantStatusBadge status={x.status} />
                {x.statusReason && (
                  <span className="text-sm text-muted">
                    {t('console.ten.reason', {
                      reason: x.statusReason,
                      date: fmtDateTime(x.statusChangedAt, locale),
                    })}
                  </span>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card title={t('console.ten.subscription')}>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
                    <dt className="text-muted">{t('console.ten.plan')}</dt>
                    <dd className="text-ink">{d.planName ?? t('console.ten.alaCarte')}</dd>
                    <dt className="text-muted">{t('console.ten.cycle')}</dt>
                    <dd className="text-ink">
                      {d.cycle
                        ? t(`console.ten.cycles.${d.cycle}`, { defaultValue: d.cycle })
                        : '–'}
                      {' · '}
                      {d.converted ? t('console.ten.converted') : t('console.ten.notConverted')}
                    </dd>
                    {x.status === 'TRIAL' && (
                      <>
                        <dt className="text-muted">{t('console.ten.trialEnds')}</dt>
                        <dd className="text-ink">{fmtDate(x.trialEndsAt, locale)}</dd>
                      </>
                    )}
                    <dt className="text-muted">{t('console.ten.period')}</dt>
                    <dd className="text-ink">
                      {d.currentPeriod?.start
                        ? `${fmtDate(d.currentPeriod.start, locale)} – ${fmtDate(d.currentPeriod.end, locale)}`
                        : '–'}
                    </dd>
                    <dt className="text-muted">{t('console.ten.pending')}</dt>
                    <dd className="text-ink">
                      {d.pending?.length
                        ? d.pending
                            .map(
                              (c) =>
                                `${c.op === 'REMOVE' ? '−' : c.op} ${MODULES[c.module]?.name ?? c.module}`,
                            )
                            .join(', ')
                        : t('console.ten.noPending')}
                    </dd>
                    <dt className="text-muted">{t('console.ten.since')}</dt>
                    <dd className="text-ink">{fmtDate(x.createdAt, locale)}</dd>
                  </dl>
                </Card>
                <Card title={t('console.ten.usage')}>
                  <div className="flex flex-col gap-4">
                    <UsageLine
                      label={t('console.ten.users')}
                      used={d.usage?.users}
                      limit={d.limits?.users}
                    />
                    <UsageLine
                      label={t('console.ten.branches')}
                      used={d.usage?.branches}
                      limit={d.limits?.branches}
                    />
                    <UsageLine
                      label={t('console.ten.beds')}
                      used={d.usage?.beds}
                      limit={d.limits?.beds}
                    />
                  </div>
                </Card>
                <Card title={t('console.ten.moduleList')}>
                  <ul className="flex flex-wrap gap-2">
                    {(d.modules ?? []).map((m) => (
                      <li key={m.code}>
                        <StatusBadge
                          tone={MODULE_TONE[m.status] ?? 'neutral'}
                          icon={false}
                          label={`${m.name ?? m.code} · ${t(`console.ten.moduleState.${m.status}`, { defaultValue: m.status })}`}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
              <Card title={t('console.ten.invoices')} className="mt-4" padding={false}>
                <DataTable
                  columns={invoiceColumns}
                  data={d.invoices ?? []}
                  caption={t('console.ten.invoices')}
                  empty={t('console.ten.noInvoices')}
                />
              </Card>

              <FormDialog
                open={Boolean(statusAction)}
                onOpenChange={(o) => !o && setStatusAction(null)}
                title={
                  statusAction ? t(`console.ten.statusTitle.${statusAction}`, { name: x.name }) : ''
                }
                description={statusAction ? t(`console.ten.statusHint.${statusAction}`) : ''}
                destructive={statusAction === 'SUSPEND'}
                schema={z.object({
                  days: z.coerce.number().int().min(1).max(60).optional(),
                  reason: z.string().trim().min(5).max(300),
                })}
                defaultValues={{ days: 7, reason: '' }}
                fields={[
                  statusAction === 'EXTEND_TRIAL' && {
                    name: 'days',
                    label: t('console.ten.days'),
                    type: 'number',
                  },
                  {
                    name: 'reason',
                    label: t('console.ten.reasonField'),
                    type: 'textarea',
                    required: true,
                  },
                ].filter(Boolean)}
                submitLabel={
                  statusAction === 'SUSPEND'
                    ? t('console.ten.suspend')
                    : statusAction === 'REACTIVATE'
                      ? t('console.ten.reactivate')
                      : t('console.ten.extend')
                }
                onSubmit={(v) =>
                  setStatus({
                    id: x.id,
                    action: statusAction,
                    reason: v.reason,
                    days: statusAction === 'EXTEND_TRIAL' ? v.days : undefined,
                  }).unwrap()
                }
                onDone={() =>
                  toast({
                    tone: 'success',
                    title: t(`console.ten.done.${statusAction}`, { name: x.name }),
                  })
                }
              />

              <FormDialog
                open={planOpen}
                onOpenChange={setPlanOpen}
                title={t('console.ten.planTitle', { name: x.name })}
                description={t('console.ten.planHint')}
                schema={z.object({
                  plan: z.string().optional(),
                  cycle: z.enum(['MONTHLY', 'ANNUAL']),
                  addOns: z.array(z.string()).optional(),
                  customMonthly: z.string().optional(),
                })}
                defaultValues={{
                  plan: d.plan ?? '',
                  cycle: d.cycle ?? 'MONTHLY',
                  addOns: d.addOns ?? [],
                  customMonthly: '',
                }}
                fields={[
                  {
                    name: 'plan',
                    label: t('console.ten.planField'),
                    type: 'select',
                    options: [
                      { value: '', label: t('console.ten.alaCarte') },
                      ...(plans.data?.plans ?? [])
                        .filter((p) => p.isActive)
                        .map((p) => ({
                          value: p.code,
                          label:
                            p.monthly == null
                              ? `${p.name} (${t('console.cat.quote')})`
                              : `${p.name} · ${inr(p.monthly)}`,
                        })),
                    ],
                  },
                  {
                    name: 'cycle',
                    label: t('console.ten.cycle'),
                    type: 'select',
                    options: ['MONTHLY', 'ANNUAL'].map((c) => ({
                      value: c,
                      label: t(`console.ten.cycles.${c}`),
                    })),
                  },
                  {
                    name: 'customMonthly',
                    label: t('console.ten.customMonthly'),
                    hint: t('console.ten.customHint'),
                    optional: true,
                  },
                ]}
                submitLabel={t('console.ten.changePlan')}
                onSubmit={(v) =>
                  setPlan({
                    id: x.id,
                    plan: v.plan || null,
                    cycle: v.cycle,
                    addOns: (v.addOns ?? []).filter((m) => MODULE_CODES.includes(m)),
                    customMonthly: v.customMonthly ? paiseFrom(v.customMonthly) : undefined,
                  }).unwrap()
                }
                onDone={() =>
                  toast({ tone: 'success', title: t('console.ten.planSaved', { name: x.name }) })
                }
              />
            </>
          );
        }}
      </QueryView>
    </Page>
  );
}
