import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addBillingStrings } from '@hms/i18n/billing';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { Banner, Button, Card, EmptyState, Input, Page, PageHeader, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr, inrExact } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { DepositDialog } from '../../billing/components/DepositDialog.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { useAdmissionQuery, useAdmissionsQuery, useFinalBillMutation } from '../api.js';
import { STAY_TONE } from '../ipd.js';
import { StayHeader } from '../components/StayHeader.jsx';

/** Running bill lines (room days, services, medicines), with the total under them. */
function Lines({ bill }) {
  const { t } = useTranslation();
  if (!bill.lines.length) return <EmptyState bordered={false} title={t('ipd.bill.noLines')} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">{t('ipd.bill.lines')}</caption>
        <thead className="bg-surface-2 text-left text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">{t('ipd.bill.item')}</th>
            <th className="px-3 py-2 text-right font-semibold">{t('ipd.bill.qty')}</th>
            <th className="px-3 py-2 text-right font-semibold">{t('ipd.bill.rate')}</th>
            <th className="px-3 py-2 text-right font-semibold">{t('ipd.bill.amount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {bill.lines.map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-2">
                {l.name}
                {l.category && <span className="text-muted"> · {l.category}</span>}
              </td>
              <td className="tabular px-3 py-2 text-right">{l.qty}</td>
              <td className="tabular px-3 py-2 text-right">{inrExact(l.unitPrice)}</td>
              <td className="tabular px-3 py-2 text-right">{inrExact(l.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-strong font-semibold">
            <td className="px-3 py-2" colSpan={3}>
              {t('ipd.bill.total')}
            </td>
            <td className="tabular px-3 py-2 text-right">{inrExact(bill.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StayBill({ id }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const q = useAdmissionQuery(id);
  const [finalBill, finalising] = useFinalBillMutation();
  const [failure, setFailure] = useState(null);
  const [depositOpen, setDepositOpen] = useState(false);
  return (
    <QueryView query={q} rows={8}>
      {(a) => {
        const b = a.bill;
        const isFinal = b.status && b.status !== 'DRAFT';
        const low = b.usedPct != null && b.usedPct >= 80;
        return (
          <Card>
            <div className="flex flex-col gap-4">
              <StayHeader stay={a} />
              <KpiRow
                items={[
                  {
                    label: t('ipd.bill.total'),
                    value: inr(b.total),
                    sub: t('ipd.bill.roomDays', { count: b.roomDays }),
                  },
                  {
                    label: t('ipd.bill.deposit'),
                    value: inr(b.deposit),
                    sub:
                      b.usedPct != null
                        ? t('ipd.bill.used', { pct: b.usedPct })
                        : t('ipd.bill.noDeposit'),
                    tone: low ? 'warning' : undefined,
                  },
                  {
                    label: b.balance > 0 ? t('ipd.bill.due') : t('ipd.bill.refundable'),
                    value: inr(Math.abs(b.balance)),
                    tone: b.balance > 0 ? 'warning' : 'success',
                  },
                  {
                    label: t('ipd.bill.status'),
                    value: isFinal ? t('ipd.bill.final', { no: b.billNo }) : t('ipd.bill.running'),
                  },
                ]}
              />
              {low && !isFinal && (
                <Banner tone="warning">{t('ipd.bill.topUp', { pct: b.usedPct })}</Banner>
              )}
              <ApiErrorNotice error={failure} />
              <div className="flex flex-wrap gap-2">
                {can('billing:deposit:create') && !isFinal && (
                  <Button variant="secondary" onClick={() => setDepositOpen(true)}>
                    {t('ipd.bill.takeDeposit')}
                  </Button>
                )}
                {!isFinal && a.status === 'DISCHARGE_STARTED' && can('billing:ip:finalize') && (
                  <Button
                    loading={finalising.isLoading}
                    onClick={async () => {
                      setFailure(null);
                      try {
                        const r = await finalBill({ id: a.id }).unwrap();
                        toast({
                          tone: 'success',
                          title: t('ipd.bill.finalised', { no: r.billNo }),
                        });
                      } catch (err) {
                        setFailure(err);
                      }
                    }}
                  >
                    {t('ipd.bill.makeFinal')}
                  </Button>
                )}
                {isFinal && b.billId && (
                  <Link
                    className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 font-semibold text-on-primary"
                    to={`/billing/bills/${b.billId}`}
                  >
                    {t('ipd.bill.collect')}
                  </Link>
                )}
              </div>
              {!isFinal && a.status !== 'DISCHARGE_STARTED' && (
                <p className="text-sm text-muted">{t('ipd.bill.finalHint')}</p>
              )}
              <Lines bill={b} />
            </div>
            <DepositDialog
              open={depositOpen}
              onOpenChange={setDepositOpen}
              patient={a.patient}
              onDone={() => q.refetch()}
            />
          </Card>
        );
      }}
    </QueryView>
  );
}

/**
 * In-patient bills (board IpdBill, route /ipd/bills): each stay's running bill against its
 * deposit, deposit top-ups, the final bill once discharge has started (POST
 * /ipd/admissions/{id}/final-bill), then payment on the bill itself.
 */
export default function IpdBillPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addBillingStrings, addIpdStrings);
  const { t } = useTranslation();
  const [id, setId] = useUrlState('id', '');
  const [q, setQ] = useUrlState('q', '');
  const list = useAdmissionsQuery({ q: q || undefined, limit: 100 });
  // Discharges in progress first: they are the ones waiting at the counter.
  const items = [...(list.data?.items ?? [])].sort(
    (x, y) =>
      Number(y.status === 'DISCHARGE_STARTED') - Number(x.status === 'DISCHARGE_STARTED') ||
      Number(y.status === 'DISCHARGE_PLANNED') - Number(x.status === 'DISCHARGE_PLANNED'),
  );
  const current = id || items[0]?.id || '';
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.bill.title') }]}
        title={t('ipd.bill.title')}
        description={t('ipd.bill.description')}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card title={t('ipd.bill.stays', { count: items.length })}>
          <Input
            type="search"
            className="mb-3"
            aria-label={t('ipd.bill.search')}
            placeholder={t('ipd.bill.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <QueryView
            query={list}
            empty={<EmptyState bordered={false} title={t('ipd.bill.none')} />}
            isEmpty={(d) => !d.items.length}
          >
            {() => (
              <PickList
                label={t('ipd.bill.title')}
                selectedId={current}
                onPick={(v) => setId(v)}
                items={items.map((a) => ({
                  id: a.id,
                  lead: a.bed?.code,
                  title: a.patient.name,
                  sub: `${a.ipNo} · ${t(`ipd.payer.${a.payer?.kind ?? 'CASH'}`)}`,
                  badge: { tone: STAY_TONE[a.status], label: t(`ipd.stay.${a.status}`) },
                }))}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <StayBill key={current} id={current} />
        ) : (
          <EmptyState title={t('ipd.bill.pick')} />
        )}
      </div>
    </Page>
  );
}
