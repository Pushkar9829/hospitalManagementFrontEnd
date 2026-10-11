import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addFinanceStrings } from '@hms/i18n/finance';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inrExact, paiseFrom } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import {
  VOUCHER_TONE,
  useBalanceSheetQuery,
  useCreateAccountMutation,
  useCreateVoucherMutation,
  useFinAccountsQuery,
  useGstQuery,
  useLedgerQuery,
  useLockPeriodMutation,
  usePeriodQuery,
  useProfitLossQuery,
  useReopenPeriodMutation,
  useTrialBalanceQuery,
  useVouchersQuery,
} from '../api.js';
import {
  BudgetsTab,
  PayablesTab,
  PayoutsTab,
  PettyCashTab,
  ReceivablesTab,
} from '../components/Ledgers.jsx';

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const money = (p) => (p ? inrExact(p) : '');
const TYPES = [
  'SALES',
  'RECEIPT',
  'PAYMENT',
  'JOURNAL',
  'CONTRA',
  'PURCHASE',
  'PAYROLL',
  'REVERSAL',
];
const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

function useAccounts() {
  return useFinAccountsQuery().data?.items ?? [];
}

function AccountSelect({ value, onChange, label, className }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  return (
    <FormField label={label ?? t('fin.account')} className={className}>
      <Select
        value={value}
        placeholder={t('fin.pickAccount')}
        onChange={(e) => onChange(e.target.value)}
        options={accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
      />
    </FormField>
  );
}

const blankLine = () => ({ accountId: '', debit: '', credit: '' });

function VoucherForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [f, setF] = useState({ type: 'PAYMENT', date: today(), narration: '' });
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [failure, setFailure] = useState(null);
  const [pending, setPending] = useState(null);
  const [create, state] = useCreateVoucherMutation();
  const dr = lines.reduce((s, l) => s + (paiseFrom(l.debit) ?? 0), 0);
  const cr = lines.reduce((s, l) => s + (paiseFrom(l.credit) ?? 0), 0);
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <Card title={t('fin.voucher.title')} description={t('fin.voucher.hint')}>
      <div className="flex flex-col gap-3">
        {pending && (
          <PendingApprovalNotice approvalId={pending} approver={t('fin.voucher.approver')} />
        )}
        {failure && <ApiErrorNotice error={failure} />}
        <div className="flex flex-wrap items-end gap-3">
          <FormField label={t('fin.voucher.type')} className="w-40">
            <Select
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value })}
              options={['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'].map((x) => ({
                value: x,
                label: t(`fin.type.${x}`),
              }))}
            />
          </FormField>
          <FormField label={t('fin.date')} className="w-40">
            <Input
              type="date"
              value={f.date}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
          </FormField>
          <FormField label={t('fin.voucher.narration')} className="min-w-64 flex-1">
            <Input
              value={f.narration}
              onChange={(e) => setF({ ...f, narration: e.target.value })}
            />
          </FormField>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <AccountSelect
              className="min-w-64 flex-1"
              value={l.accountId}
              onChange={(v) => setLine(i, 'accountId', v)}
            />
            <FormField label={t('fin.debit')} className="w-32">
              <Input
                inputMode="decimal"
                value={l.debit}
                onChange={(e) => setLine(i, 'debit', e.target.value)}
              />
            </FormField>
            <FormField label={t('fin.credit')} className="w-32">
              <Input
                inputMode="decimal"
                value={l.credit}
                onChange={(e) => setLine(i, 'credit', e.target.value)}
              />
            </FormField>
            {lines.length > 2 && (
              <Button
                variant="ghost"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              >
                {t('fin.remove')}
              </Button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            {t('fin.voucher.addLine')}
          </Button>
          <span
            className={`tabular text-sm ${dr !== cr ? 'font-semibold text-critical' : 'text-muted'}`}
          >
            {t('fin.voucher.totals', { dr: inrExact(dr), cr: inrExact(cr) })}
          </span>
          <Button
            className="ml-auto"
            loading={state.isLoading}
            disabled={
              !dr || dr !== cr || f.narration.trim().length < 3 || lines.some((l) => !l.accountId)
            }
            onClick={async () => {
              setFailure(null);
              setPending(null);
              try {
                const out = await create({
                  ...f,
                  narration: f.narration.trim(),
                  lines: lines.map((l) => ({
                    accountId: l.accountId,
                    debit: paiseFrom(l.debit) ?? 0,
                    credit: paiseFrom(l.credit) ?? 0,
                  })),
                }).unwrap();
                if (out.status === 'PENDING_APPROVAL') setPending(out.approvalId);
                else
                  toast({ tone: 'success', title: t('fin.voucher.posted', { no: out.voucherNo }) });
                setLines([blankLine(), blankLine()]);
                setF({ ...f, narration: '' });
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('fin.voucher.post')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DayBook() {
  const { t } = useTranslation();
  const can = useCan();
  const [from, setFrom] = useUrlState('from', today().slice(0, 8) + '01');
  const [to, setTo] = useUrlState('to', today());
  const [type, setType] = useUrlState('type', '');
  const q = useVouchersQuery({ from, to, type: type || undefined });
  const [open, setOpen] = useState('');
  return (
    <div className="flex flex-col gap-3">
      {can('finance:voucher:create') && <VoucherForm />}
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('fin.from')} className="w-40">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t('fin.to')} className="w-40">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <FormField label={t('fin.voucher.type')} className="w-44">
          <Select
            value={type}
            placeholder={t('fin.allTypes')}
            onChange={(e) => setType(e.target.value)}
            options={TYPES.map((x) => ({ value: x, label: t(`fin.type.${x}`) }))}
          />
        </FormField>
      </div>
      <QueryView
        query={q}
        rows={6}
        empty={<EmptyState bordered={false} title={t('fin.noVouchers')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t('fin.tabs.daybook')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['date', 'voucher', 'narration', 'amount', 'status'].map((k) => (
                    <th
                      key={k}
                      className={`px-3 py-2 font-semibold ${k === 'amount' ? 'text-right' : ''}`}
                    >
                      {t(`fin.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((v) => (
                  <tr key={v.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(v.date)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-expanded={open === v.id}
                        className="font-mono underline-offset-2 hover:underline"
                        onClick={() => setOpen(open === v.id ? '' : v.id)}
                      >
                        {v.voucherNo}
                      </button>
                      <span className="block text-muted">{t(`fin.type.${v.type}`)}</span>
                    </td>
                    <td className="px-3 py-2">
                      {v.narration}
                      {open === v.id && (
                        <table className="mt-2 w-full text-xs">
                          <caption className="sr-only">{v.voucherNo}</caption>
                          <tbody>
                            {v.lines.map((l, i) => (
                              <tr key={i}>
                                <td className="py-0.5">
                                  {l.credit ? '    ' : ''}
                                  {l.code} {l.name}
                                </td>
                                <td className="tabular py-0.5 text-right">{money(l.debit)}</td>
                                <td className="tabular py-0.5 text-right">{money(l.credit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{inrExact(v.total)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        tone={VOUCHER_TONE[v.status]}
                        label={t(`fin.status.${v.status}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </div>
  );
}

function TrialBalance() {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useUrlState('asOf', today());
  const q = useTrialBalanceQuery({ asOf });
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('fin.asOf')} className="w-40">
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={8}>
        {(d) => (
          <>
            {!d.balanced && <Banner tone="critical">{t('fin.tb.unbalanced')}</Banner>}
            <table className="w-full text-sm">
              <caption className="sr-only">{t('fin.tabs.tb')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('fin.account')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('fin.debit')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('fin.credit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-muted">{r.code}</span> {r.name}
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">{money(r.debit)}</td>
                    <td className="tabular px-3 py-1.5 text-right">{money(r.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line font-semibold">
                <tr>
                  <td className="px-3 py-2">{t('fin.total')}</td>
                  <td className="tabular px-3 py-2 text-right">{inrExact(d.debit)}</td>
                  <td className="tabular px-3 py-2 text-right">{inrExact(d.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </QueryView>
    </div>
  );
}

function Section({ title, rows, total }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <caption className="sr-only">{title}</caption>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5">
                {r.code !== '-' && <span className="font-mono text-muted">{r.code}</span>} {r.name}
              </td>
              <td className="tabular py-1.5 text-right">{inrExact(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-line font-semibold">
          <tr>
            <td className="py-1.5">{t('fin.total')}</td>
            <td className="tabular py-1.5 text-right">{inrExact(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ProfitLoss() {
  const { t } = useTranslation();
  const [from, setFrom] = useUrlState('from', `${today().slice(0, 4)}-04-01`);
  const [to, setTo] = useUrlState('to', today());
  const q = useProfitLossQuery({ from, to });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <FormField label={t('fin.from')} className="w-40">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t('fin.to')} className="w-40">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>
      <QueryView query={q} rows={8}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <KpiRow
              items={[
                { label: t('fin.pl.income'), value: inrExact(d.totalIncome) },
                { label: t('fin.pl.expenses'), value: inrExact(d.totalExpenses) },
                {
                  label: d.profit >= 0 ? t('fin.pl.profit') : t('fin.pl.loss'),
                  value: inrExact(Math.abs(d.profit)),
                  tone: d.profit >= 0 ? 'success' : 'critical',
                },
              ]}
            />
            <div className="grid gap-6 md:grid-cols-2">
              <Section title={t('fin.pl.income')} rows={d.income} total={d.totalIncome} />
              <Section title={t('fin.pl.expenses')} rows={d.expenses} total={d.totalExpenses} />
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}

function BalanceSheet() {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useUrlState('asOf', today());
  const q = useBalanceSheetQuery({ asOf });
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('fin.asOf')} className="w-40">
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={8}>
        {(d) => (
          <div className="flex flex-col gap-4">
            {d.balanced ? (
              <Banner tone="success">{t('fin.bs.balanced')}</Banner>
            ) : (
              <Banner tone="critical">{t('fin.bs.unbalanced')}</Banner>
            )}
            <div className="grid gap-6 md:grid-cols-2">
              <Section title={t('fin.bs.assets')} rows={d.assets} total={d.totalAssets} />
              <div className="flex flex-col gap-4">
                <Section
                  title={t('fin.bs.liabilities')}
                  rows={d.liabilities}
                  total={d.liabilities.reduce((s, r) => s + r.amount, 0)}
                />
                <Section
                  title={t('fin.bs.equity')}
                  rows={d.equity.map((r) =>
                    r.id === 'PL' ? { ...r, name: t('fin.bs.profit') } : r,
                  )}
                  total={d.equity.reduce((s, r) => s + r.amount, 0)}
                />
                <p className="flex justify-between border-t-2 border-line pt-2 text-sm font-semibold">
                  <span>{t('fin.bs.totalLE')}</span>
                  <span className="tabular">{inrExact(d.totalLiabilitiesEquity)}</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}

function Ledger() {
  const { t } = useTranslation();
  const [id, setId] = useUrlState('acct', '');
  const [from, setFrom] = useUrlState('from', today().slice(0, 8) + '01');
  const [to, setTo] = useUrlState('to', today());
  const q = useLedgerQuery({ id, from, to }, { skip: !id });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <AccountSelect className="w-80" value={id} onChange={setId} />
        <FormField label={t('fin.from')} className="w-40">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t('fin.to')} className="w-40">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>
      {!id ? (
        <Banner tone="info">{t('fin.ledger.pick')}</Banner>
      ) : (
        <QueryView query={q} rows={6}>
          {(d) => (
            <table className="w-full text-sm">
              <caption className="sr-only">{d.account.name}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['date', 'voucher', 'narration', 'debit', 'credit', 'balance'].map((k) => (
                    <th
                      key={k}
                      className={`px-3 py-2 font-semibold ${['debit', 'credit', 'balance'].includes(k) ? 'text-right' : ''}`}
                    >
                      {t(`fin.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr className="text-muted">
                  <td className="px-3 py-1.5" colSpan={5}>
                    {t('fin.ledger.opening')}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">{inrExact(d.opening)}</td>
                </tr>
                {d.items.map((r, i) => (
                  <tr key={`${r.voucherNo}${i}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-1.5 font-mono">{r.voucherNo}</td>
                    <td className="px-3 py-1.5">{r.narration}</td>
                    <td className="tabular px-3 py-1.5 text-right">{money(r.debit)}</td>
                    <td className="tabular px-3 py-1.5 text-right">{money(r.credit)}</td>
                    <td className="tabular px-3 py-1.5 text-right">{inrExact(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={5}>
                    {t('fin.ledger.closing')}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{inrExact(d.closing)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </QueryView>
      )}
    </div>
  );
}

function Gst() {
  const { t } = useTranslation();
  const [month, setMonth] = useUrlState('month', today().slice(0, 7));
  const q = useGstQuery(month);
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('fin.month')} className="w-44">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={4}>
        {(d) => (
          <div className="flex flex-col gap-3">
            <KpiRow
              items={[
                { label: t('fin.gst.output'), value: inrExact(d.outputTax) },
                { label: t('fin.gst.input'), value: inrExact(d.inputTax) },
                { label: t('fin.gst.payable'), value: inrExact(d.payable) },
              ]}
            />
            {d.output.length ? (
              <table className="w-full text-sm">
                <caption className="sr-only">{t('fin.gst.byRate')}</caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    {['rate', 'taxable', 'cgst', 'sgst'].map((k) => (
                      <th
                        key={k}
                        className={`px-3 py-2 font-semibold ${k === 'rate' ? '' : 'text-right'}`}
                      >
                        {t(`fin.gst.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.output.map((r) => (
                    <tr key={r.rate}>
                      <td className="px-3 py-1.5">{r.rate}%</td>
                      <td className="tabular px-3 py-1.5 text-right">{inrExact(r.taxable)}</td>
                      <td className="tabular px-3 py-1.5 text-right">{inrExact(r.cgst)}</td>
                      <td className="tabular px-3 py-1.5 text-right">{inrExact(r.sgst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState bordered={false} title={t('fin.gst.none')} />
            )}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function Period() {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const q = usePeriodQuery();
  const [month, setMonth] = useState('');
  const [reason, setReason] = useState('');
  const [lock, locking] = useLockPeriodMutation();
  const [reopen, reopening] = useReopenPeriodMutation();
  const [failure, setFailure] = useState(null);
  return (
    <QueryView query={q} rows={3}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <Banner tone={d.lockedThrough ? 'info' : 'warning'}>
            {d.lockedThrough
              ? t('fin.period.lockedThrough', { month: d.lockedThrough })
              : t('fin.period.open')}
          </Banner>
          {failure && <ApiErrorNotice error={failure} />}
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('fin.month')} className="w-44">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </FormField>
            {can('finance:period:lock') && (
              <Button
                loading={locking.isLoading}
                disabled={!month}
                onClick={async () => {
                  setFailure(null);
                  try {
                    await lock({ month }).unwrap();
                    toast({ tone: 'success', title: t('fin.period.locked', { month }) });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('fin.period.lock')}
              </Button>
            )}
            {can('settings:accounts:reopen') && (
              <>
                <FormField label={t('fin.period.reason')} className="min-w-56 flex-1">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                </FormField>
                <Button
                  variant="danger"
                  loading={reopening.isLoading}
                  disabled={!month || reason.trim().length < 5}
                  onClick={async () => {
                    setFailure(null);
                    try {
                      await reopen({ month, reason: reason.trim() }).unwrap();
                      setReason('');
                    } catch (err) {
                      setFailure(err);
                    }
                  }}
                >
                  {t('fin.period.reopen')}
                </Button>
              </>
            )}
          </div>
          {d.history.length > 0 && (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {[...d.history].reverse().map((h, i) => (
                <li key={i} className="flex flex-wrap gap-3 py-1.5">
                  <span className="font-mono">{h.month}</span>
                  <span>{t(`fin.period.action.${h.action}`)}</span>
                  <span className="text-muted">
                    {h.by} · {fmtDate(h.at)}
                    {h.reason && ` · ${h.reason}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </QueryView>
  );
}

function Accounts() {
  const { t } = useTranslation();
  const can = useCan();
  const q = useFinAccountsQuery();
  const [create, state] = useCreateAccountMutation();
  const [f, setF] = useState({ code: '', name: '', type: 'EXPENSE', group: '' });
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      {can('finance:account:create') && (
        <Card title={t('fin.acct.add')}>
          {failure && <ApiErrorNotice error={failure} />}
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('fin.acct.code')} className="w-28">
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </FormField>
            <FormField label={t('fin.acct.name')} className="min-w-56 flex-1">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </FormField>
            <FormField label={t('fin.acct.type')} className="w-40">
              <Select
                value={f.type}
                onChange={(e) => setF({ ...f, type: e.target.value })}
                options={ACCOUNT_TYPES.map((x) => ({ value: x, label: t(`fin.acctType.${x}`) }))}
              />
            </FormField>
            <FormField label={t('fin.acct.group')} className="w-48">
              <Input value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} />
            </FormField>
            <Button
              loading={state.isLoading}
              disabled={!f.code.trim() || !f.name.trim()}
              onClick={async () => {
                setFailure(null);
                try {
                  await create({
                    code: f.code.trim(),
                    name: f.name.trim(),
                    type: f.type,
                    group: f.group.trim() || undefined,
                  }).unwrap();
                  setF({ ...f, code: '', name: '' });
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('fin.acct.save')}
            </Button>
          </div>
        </Card>
      )}
      <QueryView query={q} rows={8}>
        {(d) => (
          <div className="grid gap-4 md:grid-cols-2">
            {ACCOUNT_TYPES.map((type) => (
              <div key={type}>
                <h3 className="mb-1 font-semibold">{t(`fin.acctType.${type}`)}</h3>
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {d.items
                    .filter((a) => a.type === type)
                    .map((a) => (
                      <li key={a.id} className="flex gap-3 py-1">
                        <span className="w-12 font-mono text-muted">{a.code}</span>
                        <span className="flex-1">{a.name}</span>
                        {a.key && (
                          <span className="text-xs text-muted">{t('fin.acct.system')}</span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Finance (board Finance, route /finance): day book with vouchers (a manual journal goes for
 * approval), trial balance, profit and loss, balance sheet, ledgers, GST and the month close.
 * Bills, receipts, purchases and payroll post here automatically.
 */
export default function FinancePage() {
  useStrings(addDxkitStrings, addFinanceStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('fin.crumb') }, { label: t('fin.title') }]}
        title={t('fin.title')}
        description={t('fin.description')}
      />
      <UrlTabs
        param="tab"
        label={t('fin.tabsLabel')}
        reset={['from', 'to', 'type', 'asOf', 'acct', 'month', 'fy']}
        tabs={[
          { id: 'daybook', label: t('fin.tabs.daybook'), body: <DayBook /> },
          { id: 'tb', label: t('fin.tabs.tb'), body: <TrialBalance /> },
          { id: 'pl', label: t('fin.tabs.pl'), body: <ProfitLoss /> },
          { id: 'bs', label: t('fin.tabs.bs'), body: <BalanceSheet /> },
          { id: 'ledger', label: t('fin.tabs.ledger'), body: <Ledger /> },
          { id: 'gst', label: t('fin.tabs.gst'), body: <Gst /> },
          { id: 'period', label: t('fin.tabs.period'), body: <Period /> },
          { id: 'accounts', label: t('fin.tabs.accounts'), body: <Accounts /> },
          { id: 'payables', label: t('fin.led.tabs.payables'), body: <PayablesTab /> },
          { id: 'receivables', label: t('fin.led.tabs.receivables'), body: <ReceivablesTab /> },
          { id: 'budgets', label: t('fin.led.tabs.budgets'), body: <BudgetsTab /> },
          { id: 'petty', label: t('fin.led.tabs.petty'), body: <PettyCashTab /> },
          { id: 'payouts', label: t('fin.led.tabs.payouts'), body: <PayoutsTab /> },
        ]}
      />
    </Page>
  );
}
