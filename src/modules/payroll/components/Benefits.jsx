import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, FormField, Input, StatusBadge, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inr, paiseFrom } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import {
  useBonusRunsQuery,
  useDraftBonusMutation,
  useGratuityQuery,
  usePayBonusMutation,
} from '../../hr/api.js';

const BONUS_TONE = { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', PAID: 'success' };

/** The financial year ("2025-26") that a date falls in. */
export function fyOf(d = new Date()) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Gratuity register: what each employee has earned so far and whether it is payable now. */
export function GratuityTab() {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState('');
  const q = useGratuityQuery(asOf ? { asOf } : {});
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('pay.gr.hint')}</p>
      <FormField label={t('pay.gr.asOf')} className="max-w-xs">
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={4}>
        {(d) => (
          <>
            <KpiRow
              items={[
                { label: t('pay.gr.liability'), value: inr(d.liability) },
                { label: t('pay.gr.payable'), value: inr(d.payableNow) },
              ]}
            />
            <DataTable
              caption={t('pay.gr.tab')}
              data={d.items}
              empty={t('pay.gr.none')}
              columns={[
                {
                  id: 'emp',
                  header: t('pay.gr.employee'),
                  cell: ({ row }) => (
                    <span>
                      {row.original.name}{' '}
                      <span className="font-mono text-sm text-muted">{row.original.empNo}</span>
                    </span>
                  ),
                },
                {
                  id: 'joined',
                  header: t('pay.gr.joined'),
                  cell: ({ row }) => row.original.joinedOn,
                },
                {
                  id: 'years',
                  header: t('pay.gr.years'),
                  cell: ({ row }) => row.original.countedYears,
                },
                {
                  id: 'wage',
                  header: t('pay.gr.wage'),
                  cell: ({ row }) => inr(row.original.monthlyWage),
                },
                {
                  id: 'amount',
                  header: t('pay.gr.amount'),
                  cell: ({ row }) => inr(row.original.amount),
                },
                {
                  id: 'eligible',
                  header: t('common.status'),
                  cell: ({ row }) =>
                    row.original.eligible ? (
                      <StatusBadge tone="success" label={t('pay.gr.eligible')} />
                    ) : (
                      <StatusBadge tone="neutral" label={t('pay.gr.notYet')} />
                    ),
                },
              ]}
            />
          </>
        )}
      </QueryView>
    </div>
  );
}

/** Statutory bonus: worked out from locked months, then sent to Finance for payment. */
export function BonusTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('payroll:bonus:create') || can('payroll:run:create');
  const q = useBonusRunsQuery();
  const [draft, drafting] = useDraftBonusMutation();
  const [pay, paying] = usePayBonusMutation();
  const [f, setF] = useState({ fy: fyOf(), percent: '8.33', minimumWage: '' });
  const [pending, setPending] = useState(null);
  const error = drafting.error ?? paying.error;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('pay.bn.hint')}</p>
      {edit && (
        <div className="flex flex-wrap items-end gap-3">
          <FormField label={t('pay.bn.fy')}>
            <Input value={f.fy} onChange={(e) => setF({ ...f, fy: e.target.value })} />
          </FormField>
          <FormField label={t('pay.bn.percent')}>
            <Input
              inputMode="decimal"
              value={f.percent}
              onChange={(e) => setF({ ...f, percent: e.target.value })}
            />
          </FormField>
          <FormField label={t('pay.bn.minimumWage')}>
            <Input
              inputMode="decimal"
              value={f.minimumWage}
              onChange={(e) => setF({ ...f, minimumWage: e.target.value })}
            />
          </FormField>
          <Button
            loading={drafting.isLoading}
            onClick={async () => {
              await draft({
                fy: f.fy.trim(),
                percent: Number(f.percent),
                minimumWage: f.minimumWage ? paiseFrom(f.minimumWage) : 0,
              }).unwrap();
              toast({ tone: 'success', title: t('pay.bn.drafted') });
            }}
          >
            {t('pay.bn.draft')}
          </Button>
        </div>
      )}
      {error && <ApiErrorNotice error={error} />}
      <QueryView query={q} rows={4}>
        {(d) =>
          d.items.length ? (
            d.items.map((b) => (
              <section key={b.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold">
                    {b.fy} · {b.percent}%
                  </h3>
                  <StatusBadge tone={BONUS_TONE[b.status]} label={t(`pay.bn.status.${b.status}`)} />
                  <span className="text-sm">
                    {t('pay.bn.total')}: <strong>{inr(b.total)}</strong>
                  </span>
                  {edit && b.status === 'DRAFT' && b.total > 0 && (
                    <Button
                      size="sm"
                      loading={paying.isLoading}
                      onClick={async () => {
                        const out = await pay({ id: b.id, version: b.version }).unwrap();
                        if (out.status === 'PENDING_APPROVAL') setPending(out.approvalId);
                        toast({
                          tone: 'success',
                          title: t(out.status === 'PAID' ? 'pay.bn.paid' : 'pay.bn.sent'),
                        });
                      }}
                    >
                      {t('pay.bn.pay')}
                    </Button>
                  )}
                </div>
                {b.status === 'PENDING_APPROVAL' && (
                  <PendingApprovalNotice approvalId={pending ?? b.approvalId} />
                )}
                <DataTable
                  caption={`${t('pay.bn.lines')} ${b.fy}`}
                  data={b.lines}
                  empty={t('pay.bn.none')}
                  columns={[
                    {
                      id: 'emp',
                      header: t('pay.bn.employee'),
                      cell: ({ row }) => (
                        <span>
                          {row.original.name}{' '}
                          <span className="font-mono text-sm text-muted">{row.original.empNo}</span>
                        </span>
                      ),
                    },
                    { id: 'days', header: t('pay.bn.days'), cell: ({ row }) => row.original.days },
                    {
                      id: 'basis',
                      header: t('pay.bn.basis'),
                      cell: ({ row }) => inr(row.original.basis),
                    },
                    {
                      id: 'bonus',
                      header: t('pay.bn.bonus'),
                      cell: ({ row }) => inr(row.original.bonus),
                    },
                  ]}
                />
              </section>
            ))
          ) : (
            <p className="text-muted">{t('pay.bn.none')}</p>
          )
        }
      </QueryView>
    </div>
  );
}
