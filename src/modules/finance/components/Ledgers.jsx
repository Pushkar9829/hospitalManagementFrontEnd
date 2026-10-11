import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  Banner,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inrExact, paiseFrom, rupeesText } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import { useFinAccountsQuery, useFinLedgerQuery, useFinLedgerWriteMutation } from '../api.js';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const MODES = ['BANK_TRANSFER', 'CHEQUE', 'CASH'];
const AGES = ['d30', 'd60', 'd90', 'over90'];
const rupees = (msg) =>
  z
    .string()
    .trim()
    .refine((v) => (paiseFrom(v) ?? 0) > 0, msg);

function fyOf(date = istToday()) {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Ageing tiles: outstanding and the four buckets. */
function Ageing({ total, buckets }) {
  const { t } = useTranslation();
  return (
    <KpiRow
      items={[
        { label: t('fin.led.age.total'), value: inrExact(total) },
        ...AGES.map((k) => ({
          label: t(`fin.led.age.${k}`),
          value: inrExact(buckets[k]),
          tone: k === 'over90' && buckets[k] ? 'critical' : undefined,
        })),
      ]}
    />
  );
}

// ---------------------------------------------------------------- payables

export function PayablesTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const q = useFinLedgerQuery({ path: 'payables' });
  const history = useFinLedgerQuery({ path: 'vendor-payments' });
  const [write] = useFinLedgerWriteMutation();
  const [paying, setPaying] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t('fin.led.pay.hint')}</p>
      <QueryView query={q} rows={4}>
        {(d) => (
          <>
            <Ageing total={d.total} buckets={d.buckets} />
            <Card padding={false}>
              <DataTable
                caption={t('fin.led.tabs.payables')}
                data={d.items.map((v) => ({ ...v, id: v.vendorId }))}
                empty={t('fin.led.pay.none')}
                columns={[
                  {
                    id: 'vendor',
                    header: t('fin.led.pay.vendor'),
                    cell: ({ row }) => row.original.vendorName,
                  },
                  {
                    id: 'grns',
                    header: t('fin.led.pay.grns'),
                    cell: ({ row }) => row.original.grns.length,
                  },
                  ...AGES.map((k) => ({
                    id: k,
                    header: t(`fin.led.age.${k}`),
                    cell: ({ row }) =>
                      row.original.buckets[k] ? inrExact(row.original.buckets[k]) : '',
                  })),
                  {
                    id: 'out',
                    header: t('fin.led.age.total'),
                    cell: ({ row }) => <strong>{inrExact(row.original.outstanding)}</strong>,
                  },
                  can('finance:payable:create') && {
                    id: 'act',
                    header: '',
                    cell: ({ row }) => (
                      <Button size="sm" variant="secondary" onClick={() => setPaying(row.original)}>
                        {t('fin.led.pay.pay')}
                      </Button>
                    ),
                  },
                ].filter(Boolean)}
              />
            </Card>
          </>
        )}
      </QueryView>
      <Card title={t('fin.led.pay.history')} padding={false}>
        <QueryView query={history} rows={3}>
          {(d) => (
            <DataTable
              caption={t('fin.led.pay.history')}
              data={d.items}
              empty={t('fin.led.none')}
              columns={[
                {
                  id: 'no',
                  header: t('fin.led.pay.no'),
                  cell: ({ row }) => <span className="font-mono">{row.original.paymentNo}</span>,
                },
                {
                  id: 'date',
                  header: t('fin.led.pay.date'),
                  cell: ({ row }) => fmtDate(row.original.date, locale),
                },
                {
                  id: 'vendor',
                  header: t('fin.led.pay.vendor'),
                  cell: ({ row }) => row.original.vendorName,
                },
                {
                  id: 'mode',
                  header: t('fin.led.pay.mode'),
                  cell: ({ row }) => t(`fin.led.mode.${row.original.mode}`),
                },
                {
                  id: 'ref',
                  header: t('fin.led.pay.reference'),
                  cell: ({ row }) => row.original.reference ?? '',
                },
                {
                  id: 'tds',
                  header: t('fin.led.pay.tdsShort'),
                  cell: ({ row }) => (row.original.tds ? inrExact(row.original.tds) : ''),
                },
                {
                  id: 'amt',
                  header: t('fin.led.pay.amountShort'),
                  cell: ({ row }) => inrExact(row.original.amount),
                },
              ]}
            />
          )}
        </QueryView>
      </Card>
      <FormDialog
        open={Boolean(paying)}
        onOpenChange={(o) => !o && setPaying(null)}
        title={paying ? t('fin.led.pay.title', { name: paying.vendorName }) : ''}
        description={paying ? t('fin.led.pay.owed', { amount: inrExact(paying.outstanding) }) : ''}
        schema={z.object({
          amount: rupees(t('fin.led.errors.amount')),
          tds: z.string().optional(),
          mode: z.enum(MODES),
          reference: z.string().max(60).optional(),
          date: z.string().min(10),
        })}
        defaultValues={{
          amount: paying ? rupeesText(paying.outstanding) : '',
          tds: '',
          mode: 'BANK_TRANSFER',
          reference: '',
          date: istToday(),
        }}
        fields={[
          { name: 'amount', label: t('fin.led.pay.amount'), required: true },
          { name: 'tds', label: t('fin.led.pay.tds'), optional: true },
          {
            name: 'mode',
            label: t('fin.led.pay.mode'),
            type: 'select',
            options: MODES.map((m) => ({ value: m, label: t(`fin.led.mode.${m}`) })),
          },
          { name: 'reference', label: t('fin.led.pay.reference'), optional: true },
          { name: 'date', label: t('fin.led.pay.date'), type: 'date' },
        ]}
        submitLabel={t('fin.led.pay.pay')}
        onSubmit={(v) =>
          write({
            path: 'vendor-payments',
            body: {
              vendorId: paying.vendorId,
              amount: paiseFrom(v.amount),
              tds: paiseFrom(v.tds) ?? 0,
              mode: v.mode,
              reference: v.reference || undefined,
              date: v.date,
            },
          }).unwrap()
        }
        onDone={(p) =>
          toast({ tone: 'success', title: t('fin.led.pay.paid', { no: p.paymentNo }) })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- receivables

export function ReceivablesTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const q = useFinLedgerQuery({ path: 'receivables' });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t('fin.led.rec.hint')}</p>
      <QueryView query={q} rows={4}>
        {(d) => (
          <>
            <Card title={t('fin.led.rec.corporate')}>
              <div className="flex flex-col gap-3">
                <Ageing total={d.corporate.total} buckets={d.corporate.buckets} />
                <DataTable
                  caption={t('fin.led.rec.corporate')}
                  data={d.corporate.items.map((p) => ({ ...p, id: p.payerId }))}
                  empty={t('fin.led.rec.none')}
                  columns={[
                    {
                      id: 'payer',
                      header: t('fin.led.rec.payer'),
                      cell: ({ row }) => row.original.name,
                    },
                    {
                      id: 'inv',
                      header: t('fin.led.rec.invoiced'),
                      cell: ({ row }) => inrExact(row.original.invoiced),
                    },
                    {
                      id: 'uninv',
                      header: t('fin.led.rec.uninvoiced'),
                      cell: ({ row }) => inrExact(row.original.uninvoiced),
                    },
                    {
                      id: 'over90',
                      header: t('fin.led.age.over90'),
                      cell: ({ row }) =>
                        row.original.buckets.over90 ? (
                          <StatusBadge
                            tone="critical"
                            label={inrExact(row.original.buckets.over90)}
                          />
                        ) : (
                          ''
                        ),
                    },
                    {
                      id: 'total',
                      header: t('fin.led.age.total'),
                      cell: ({ row }) => <strong>{inrExact(row.original.total)}</strong>,
                    },
                  ]}
                />
              </div>
            </Card>
            <Card title={t('fin.led.rec.patients')}>
              <div className="flex flex-col gap-3">
                <Ageing total={d.patients.total} buckets={d.patients.buckets} />
                <DataTable
                  caption={t('fin.led.rec.patients')}
                  data={d.patients.items.map((b) => ({ ...b, id: b.billId }))}
                  empty={t('fin.led.rec.none')}
                  columns={[
                    {
                      id: 'bill',
                      header: t('fin.led.rec.bill'),
                      cell: ({ row }) => <span className="font-mono">{row.original.billNo}</span>,
                    },
                    {
                      id: 'patient',
                      header: t('fin.led.rec.patient'),
                      cell: ({ row }) =>
                        [row.original.patient, row.original.uhid].filter(Boolean).join(' · '),
                    },
                    {
                      id: 'date',
                      header: t('fin.led.rec.date'),
                      cell: ({ row }) => fmtDate(row.original.date, locale),
                    },
                    {
                      id: 'days',
                      header: t('fin.led.rec.days'),
                      cell: ({ row }) => row.original.days,
                    },
                    {
                      id: 'bal',
                      header: t('fin.led.rec.balance'),
                      cell: ({ row }) => inrExact(row.original.balance),
                    },
                  ]}
                />
              </div>
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}

// ---------------------------------------------------------------- budgets

export function BudgetsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [fy, setFy] = useUrlState('fy', fyOf());
  const q = useFinLedgerQuery({ path: 'budgets', params: { fy } });
  const [write] = useFinLedgerWriteMutation();
  const [editing, setEditing] = useState(null);
  const years = [
    fyOf(`${Number(fyOf().slice(0, 4)) + 1}-04-01`),
    fyOf(),
    fyOf(`${Number(fyOf().slice(0, 4)) - 1}-04-01`),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-muted">{t('fin.led.bud.hint')}</p>
        <FormField label={t('fin.led.bud.fy')} className="w-40">
          <Select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            options={years.map((y) => ({ value: y, label: y }))}
          />
        </FormField>
      </div>
      <QueryView query={q} rows={6}>
        {(d) =>
          ['INCOME', 'EXPENSE'].map((type) => (
            <Card key={type} title={t(`fin.led.bud.${type}`)} padding={false}>
              <DataTable
                caption={t(`fin.led.bud.${type}`)}
                data={d.items
                  .filter((r) => r.type === type)
                  .map((r) => ({ ...r, id: r.accountId }))}
                empty={t('fin.led.none')}
                columns={[
                  {
                    id: 'ledger',
                    header: t('fin.led.bud.ledger'),
                    cell: ({ row }) => `${row.original.code} · ${row.original.name}`,
                  },
                  {
                    id: 'budget',
                    header: t('fin.led.bud.budget'),
                    cell: ({ row }) =>
                      row.original.budgetTotal ? inrExact(row.original.budgetTotal) : '',
                  },
                  {
                    id: 'actual',
                    header: t('fin.led.bud.actual'),
                    cell: ({ row }) => inrExact(row.original.actualTotal),
                  },
                  {
                    id: 'used',
                    header: t('fin.led.bud.used'),
                    cell: ({ row }) => {
                      const u = row.original.usedPercent;
                      if (u == null) return '';
                      const bad = type === 'EXPENSE' ? u > 100 : u < 100;
                      return (
                        <StatusBadge
                          tone={bad ? (type === 'EXPENSE' ? 'critical' : 'warning') : 'success'}
                          label={`${u}%`}
                        />
                      );
                    },
                  },
                  can('finance:budget:update') && {
                    id: 'act',
                    header: '',
                    cell: ({ row }) => (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(row.original)}>
                        {t('fin.led.bud.set')}
                      </Button>
                    ),
                  },
                ].filter(Boolean)}
              />
            </Card>
          ))
        }
      </QueryView>
      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? t('fin.led.bud.title', { name: editing.name, fy }) : ''}
        description={t('fin.led.bud.spread')}
        schema={z.object({
          annual: z
            .string()
            .trim()
            .refine((v) => paiseFrom(v) != null, t('fin.led.errors.amount')),
        })}
        defaultValues={{ annual: editing?.budgetTotal ? rupeesText(editing.budgetTotal) : '' }}
        fields={[{ name: 'annual', label: t('fin.led.bud.annual'), required: true }]}
        submitLabel={t('fin.led.save')}
        onSubmit={(v) =>
          write({
            method: 'PUT',
            path: 'budgets',
            body: { fy, accountId: editing.accountId, annual: paiseFrom(v.annual) },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.led.bud.saved') })}
      />
    </div>
  );
}

// ---------------------------------------------------------------- petty cash

const PETTY_TONE = { POSTED: 'success', PENDING_APPROVAL: 'warning', REJECTED: 'critical' };

export function PettyCashTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const q = useFinLedgerQuery({ path: 'petty-cash' });
  const accounts = useFinAccountsQuery().data?.items ?? [];
  const [write] = useFinLedgerWriteMutation();
  const [dialog, setDialog] = useState(null); // 'TOPUP' | 'EXPENSE' | 'LIMITS'
  const [pending, setPending] = useState(null);
  const heads = accounts.filter((a) => a.type === 'EXPENSE' && a.isActive);
  const d = q.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{t('fin.led.petty.hint')}</p>
        {can('finance:pettycash:create') && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog('TOPUP')}>
              {t('fin.led.petty.topup')}
            </Button>
            <Button onClick={() => setDialog('EXPENSE')}>{t('fin.led.petty.expense')}</Button>
            {can('finance:pettycash:update') && (
              <Button variant="ghost" onClick={() => setDialog('LIMITS')}>
                {t('fin.led.petty.settings')}
              </Button>
            )}
          </div>
        )}
      </div>
      {pending && (
        <PendingApprovalNotice approvalId={pending} approver={t('fin.led.petty.approver')} />
      )}
      <QueryView query={q} rows={4}>
        {(b) => (
          <>
            {b.balance < b.float / 4 && (
              <Banner tone="warning">{t('fin.led.petty.lowFloat')}</Banner>
            )}
            <KpiRow
              items={[
                { label: t('fin.led.petty.balance'), value: inrExact(b.balance) },
                { label: t('fin.led.petty.pending'), value: inrExact(b.pending) },
                { label: t('fin.led.petty.float'), value: inrExact(b.float) },
                { label: t('fin.led.petty.limit'), value: inrExact(b.approvalOver) },
              ]}
            />
            <Card padding={false}>
              <DataTable
                caption={t('fin.led.tabs.petty')}
                data={b.items}
                empty={t('fin.led.none')}
                columns={[
                  {
                    id: 'no',
                    header: t('fin.led.petty.entry'),
                    cell: ({ row }) => <span className="font-mono">{row.original.entryNo}</span>,
                  },
                  {
                    id: 'date',
                    header: t('fin.led.pay.date'),
                    cell: ({ row }) => fmtDate(row.original.date, locale),
                  },
                  {
                    id: 'kind',
                    header: t('fin.led.petty.kindLabel'),
                    cell: ({ row }) => t(`fin.led.petty.kind.${row.original.kind}`),
                  },
                  {
                    id: 'what',
                    header: t('fin.led.petty.payee'),
                    cell: ({ row }) =>
                      [row.original.payee, row.original.accountName, row.original.note]
                        .filter(Boolean)
                        .join(' · '),
                  },
                  {
                    id: 'amt',
                    header: t('fin.led.pay.amountShort'),
                    cell: ({ row }) => inrExact(row.original.amount),
                  },
                  {
                    id: 'status',
                    header: t('common.status'),
                    cell: ({ row }) => (
                      <StatusBadge
                        tone={PETTY_TONE[row.original.status]}
                        label={t(`fin.led.petty.status.${row.original.status}`)}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </QueryView>
      <FormDialog
        open={dialog === 'TOPUP'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('fin.led.petty.topup')}
        schema={z.object({
          amount: rupees(t('fin.led.errors.amount')),
          note: z.string().max(200).optional(),
        })}
        defaultValues={{ amount: d ? rupeesText(Math.max(0, d.float - d.balance)) : '', note: '' }}
        fields={[
          { name: 'amount', label: t('fin.led.pay.amount'), required: true },
          { name: 'note', label: t('fin.led.petty.note'), optional: true },
        ]}
        submitLabel={t('fin.led.petty.topup')}
        onSubmit={(v) =>
          write({
            path: 'petty-cash',
            body: { kind: 'TOPUP', amount: paiseFrom(v.amount), note: v.note || undefined },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.led.petty.saved') })}
      />
      <FormDialog
        open={dialog === 'EXPENSE'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('fin.led.petty.expense')}
        description={d ? t('fin.led.petty.limitHint', { amount: inrExact(d.approvalOver) }) : ''}
        schema={z.object({
          amount: rupees(t('fin.led.errors.amount')),
          accountId: z.string().min(1, t('fin.led.errors.head')),
          payee: z.string().trim().min(2),
          billRef: z.string().max(60).optional(),
          note: z.string().max(200).optional(),
        })}
        defaultValues={{ amount: '', accountId: '', payee: '', billRef: '', note: '' }}
        fields={[
          { name: 'amount', label: t('fin.led.pay.amount'), required: true },
          {
            name: 'accountId',
            label: t('fin.led.petty.head'),
            type: 'select',
            options: [
              { value: '', label: '' },
              ...heads.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
            ],
          },
          { name: 'payee', label: t('fin.led.petty.payee'), required: true },
          { name: 'billRef', label: t('fin.led.petty.billRef'), optional: true },
          { name: 'note', label: t('fin.led.petty.note'), optional: true, span: 2 },
        ]}
        submitLabel={t('fin.led.petty.expense')}
        onSubmit={(v) =>
          write({
            path: 'petty-cash',
            body: {
              kind: 'EXPENSE',
              amount: paiseFrom(v.amount),
              accountId: v.accountId,
              payee: v.payee,
              billRef: v.billRef || undefined,
              note: v.note || undefined,
            },
          }).unwrap()
        }
        onDone={(e) => {
          if (e.status === 'PENDING_APPROVAL') {
            setPending(e.approvalId);
            toast({ tone: 'info', title: t('fin.led.petty.sentForApproval') });
          } else toast({ tone: 'success', title: t('fin.led.petty.saved') });
        }}
      />
      <FormDialog
        open={dialog === 'LIMITS'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('fin.led.petty.settings')}
        schema={z.object({
          float: z.string().refine((v) => paiseFrom(v) != null, t('fin.led.errors.amount')),
          approvalOver: z.string().refine((v) => paiseFrom(v) != null, t('fin.led.errors.amount')),
        })}
        defaultValues={{
          float: d ? rupeesText(d.float) : '',
          approvalOver: d ? rupeesText(d.approvalOver) : '',
        }}
        fields={[
          { name: 'float', label: t('fin.led.petty.floatLabel'), required: true },
          { name: 'approvalOver', label: t('fin.led.petty.limitLabel'), required: true },
        ]}
        submitLabel={t('fin.led.save')}
        onSubmit={(v) =>
          write({
            method: 'PUT',
            path: 'petty-cash/settings',
            body: {
              version: d.version,
              float: paiseFrom(v.float),
              approvalOver: paiseFrom(v.approvalOver),
            },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.led.petty.settingsSaved') })}
      />
    </div>
  );
}

// ---------------------------------------------------------------- doctor payouts

export function PayoutsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [month, setMonth] = useUrlState('month', istToday().slice(0, 7));
  const q = useFinLedgerQuery({ path: 'doctor-payouts', params: { month } });
  const rules = useFinLedgerQuery({ path: 'doctor-shares' });
  const [write, writing] = useFinLedgerWriteMutation();
  const [paying, setPaying] = useState(null);
  const [rule, setRule] = useState(null); // {} new or a rule
  const [failure, setFailure] = useState(null);
  const cats = rules.data?.categories ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t('fin.led.po.hint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('fin.led.po.month')} className="w-44">
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </FormField>
        {can('finance:payout:create') && (
          <Button
            loading={writing.isLoading}
            onClick={async () => {
              setFailure(null);
              try {
                await write({ path: 'doctor-payouts/draft', body: { month } }).unwrap();
                toast({ tone: 'success', title: t('fin.led.po.drafted') });
              } catch (e) {
                setFailure(e);
              }
            }}
          >
            {t('fin.led.po.draft')}
          </Button>
        )}
      </div>
      <ApiErrorNotice error={failure} />
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('fin.led.tabs.payouts')}
              data={d.items}
              empty={t('fin.led.po.none')}
              columns={[
                {
                  id: 'doctor',
                  header: t('fin.led.po.doctor'),
                  cell: ({ row }) => row.original.name,
                },
                {
                  id: 'bills',
                  header: t('fin.led.po.bills'),
                  cell: ({ row }) => row.original.bills,
                },
                {
                  id: 'lines',
                  header: t('fin.led.po.basis'),
                  cell: ({ row }) =>
                    row.original.lines
                      .map(
                        (l) =>
                          `${t(`fin.led.po.cat.${l.category}`)} ${l.percent}% × ${inrExact(l.base)}`,
                      )
                      .join('; '),
                },
                {
                  id: 'gross',
                  header: t('fin.led.po.gross'),
                  cell: ({ row }) => inrExact(row.original.gross),
                },
                {
                  id: 'tds',
                  header: t('fin.led.po.tds'),
                  cell: ({ row }) => inrExact(row.original.tds),
                },
                {
                  id: 'net',
                  header: t('fin.led.po.net'),
                  cell: ({ row }) => <strong>{inrExact(row.original.net)}</strong>,
                },
                {
                  id: 'status',
                  header: t('common.status'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={row.original.status === 'PAID' ? 'success' : 'warning'}
                      label={t(`fin.led.po.status.${row.original.status}`)}
                    />
                  ),
                },
                can('finance:payout:update') && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) =>
                    row.original.status === 'DRAFT' && row.original.gross > 0 ? (
                      <Button size="sm" variant="secondary" onClick={() => setPaying(row.original)}>
                        {t('fin.led.po.pay')}
                      </Button>
                    ) : null,
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
      <Card
        title={t('fin.led.po.rules')}
        padding={false}
        actions={
          can('finance:payout:update') && (
            <Button size="sm" variant="secondary" onClick={() => setRule({})}>
              {t('fin.led.po.rule')}
            </Button>
          )
        }
      >
        <QueryView query={rules} rows={3}>
          {(d) => (
            <DataTable
              caption={t('fin.led.po.rules')}
              data={d.items}
              empty={t('fin.led.po.noRules')}
              columns={[
                {
                  id: 'doctor',
                  header: t('fin.led.po.doctor'),
                  cell: ({ row }) => row.original.name,
                },
                {
                  id: 'shares',
                  header: t('fin.led.po.shares'),
                  cell: ({ row }) =>
                    Object.entries(row.original.shares)
                      .map(([c, p]) => `${t(`fin.led.po.cat.${c}`)} ${p}%`)
                      .join(', '),
                },
                {
                  id: 'tds',
                  header: t('fin.led.po.tdsPercent'),
                  cell: ({ row }) => `${row.original.tdsPercent}%`,
                },
                can('finance:payout:update') && {
                  id: 'edit',
                  header: '',
                  cell: ({ row }) => (
                    <Button size="sm" variant="ghost" onClick={() => setRule(row.original)}>
                      {t('fin.led.edit')}
                    </Button>
                  ),
                },
              ].filter(Boolean)}
            />
          )}
        </QueryView>
      </Card>
      <FormDialog
        open={Boolean(paying)}
        onOpenChange={(o) => !o && setPaying(null)}
        title={
          paying
            ? t('fin.led.po.payTitle', { name: paying.name, amount: inrExact(paying.net) })
            : ''
        }
        schema={z.object({ mode: z.enum(MODES), reference: z.string().max(60).optional() })}
        defaultValues={{ mode: 'BANK_TRANSFER', reference: '' }}
        fields={[
          {
            name: 'mode',
            label: t('fin.led.pay.mode'),
            type: 'select',
            options: MODES.map((m) => ({ value: m, label: t(`fin.led.mode.${m}`) })),
          },
          { name: 'reference', label: t('fin.led.pay.reference'), optional: true },
        ]}
        submitLabel={t('fin.led.po.pay')}
        onSubmit={(v) =>
          write({
            path: `doctor-payouts/${paying.id}/pay`,
            body: { version: paying.version, mode: v.mode, reference: v.reference || undefined },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.led.po.paid') })}
      />
      <FormDialog
        open={Boolean(rule)}
        onOpenChange={(o) => !o && setRule(null)}
        title={t('fin.led.po.ruleTitle')}
        schema={z.object({
          userId: z.string().min(1, t('fin.led.errors.doctor')),
          tdsPercent: z.coerce.number().min(0).max(30),
          ...Object.fromEntries(cats.map((c) => [c, z.string().optional()])),
        })}
        defaultValues={{
          userId: rule?.userId ?? '',
          tdsPercent: String(rule?.tdsPercent ?? 10),
          ...Object.fromEntries(
            cats.map((c) => [c, rule?.shares?.[c] != null ? String(rule.shares[c]) : '']),
          ),
        }}
        fields={[
          {
            name: 'userId',
            label: t('fin.led.po.doctor'),
            type: 'select',
            options: [
              { value: '', label: '' },
              ...(rules.data?.doctors ?? []).map((x) => ({ value: x.userId, label: x.name })),
            ],
          },
          { name: 'tdsPercent', label: t('fin.led.po.tdsPercent'), type: 'number' },
          ...cats.map((c) => ({
            name: c,
            label: t('fin.led.po.catPercent', { cat: t(`fin.led.po.cat.${c}`) }),
            type: 'number',
            optional: true,
          })),
        ]}
        submitLabel={t('fin.led.save')}
        onSubmit={(v) =>
          write({
            method: 'PUT',
            path: 'doctor-shares',
            body: {
              userId: v.userId,
              tdsPercent: Number(v.tdsPercent),
              shares: Object.fromEntries(
                cats
                  .filter((c) => v[c] !== '' && v[c] != null && Number(v[c]) > 0)
                  .map((c) => [c, Number(v[c])]),
              ),
            },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.led.po.ruleSaved') })}
      />
    </div>
  );
}
