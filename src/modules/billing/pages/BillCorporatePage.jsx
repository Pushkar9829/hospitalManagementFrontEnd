import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { addBillingStrings } from '@hms/i18n/billing';
import {
  Banner,
  Button,
  Card,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  cn,
  useToast,
} from '@hms/ui';
import { useCan } from '../../../lib/useCan.js';
import { inr, paiseFrom, rupeesText } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import {
  useAddLetterOfCreditMutation,
  useCancelLetterOfCreditMutation,
  useCorporateAgeingQuery,
  useCorporateInvoicesQuery,
  useCorporatePaymentMutation,
  useCorporateQuery,
  useCorporateStatementQuery,
  useCorporatesQuery,
  useIssueCorporateInvoiceMutation,
  useLettersOfCreditQuery,
  useSetCorporateHoldMutation,
} from '../api.js';

const STATUS_TONE = {
  ACTIVE: 'success',
  NEAR_LIMIT: 'warning',
  ON_HOLD: 'critical',
  INACTIVE: 'neutral',
};
const INV_TONE = { ISSUED: 'info', PARTLY_PAID: 'warning', PAID: 'success', CANCELLED: 'neutral' };
const thisMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

function InvoiceStatus({ inv }) {
  const { t } = useTranslation();
  if (inv.overdueDays > 0)
    return (
      <StatusBadge
        tone="critical"
        label={`${t('billing.corp.inv.status.OVERDUE')} · ${t('billing.corp.days', { n: inv.overdueDays })}`}
      />
    );
  return (
    <StatusBadge
      tone={INV_TONE[inv.status] ?? 'neutral'}
      label={t(`billing.corp.inv.status.${inv.status}`)}
    />
  );
}

/** Invoices with "record payment" for the ones still open. */
function InvoiceTable({ invoices, showPayer = false }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const [paying, setPaying] = useState(null);
  const [pay] = useCorporatePaymentMutation();
  return (
    <>
      <DataTable
        caption={t('billing.corp.tabs.invoices')}
        data={invoices}
        empty={t('billing.corp.inv.none')}
        columns={[
          {
            id: 'no',
            header: t('billing.corp.inv.number'),
            cell: ({ row }) => <span className="font-mono">{row.original.invoiceNo}</span>,
          },
          showPayer && {
            id: 'payer',
            header: t('billing.corp.inv.payer'),
            cell: ({ row }) => row.original.payer?.name,
          },
          {
            id: 'month',
            header: t('billing.corp.inv.month'),
            cell: ({ row }) => row.original.month,
          },
          {
            id: 'total',
            header: t('billing.corp.inv.total'),
            cell: ({ row }) => <span className="tabular">{inr(row.original.total)}</span>,
          },
          {
            id: 'balance',
            header: t('billing.corp.inv.balance'),
            cell: ({ row }) => <span className="tabular">{inr(row.original.balance)}</span>,
          },
          {
            id: 'due',
            header: t('billing.corp.inv.due'),
            cell: ({ row }) => fmtDate(row.original.dueAt, locale),
          },
          {
            id: 'status',
            header: t('common.status'),
            cell: ({ row }) => <InvoiceStatus inv={row.original} />,
          },
          {
            id: 'act',
            header: '',
            cell: ({ row }) =>
              row.original.balance > 0 && can('billing:corporate:update') ? (
                <Button size="sm" variant="secondary" onClick={() => setPaying(row.original)}>
                  {t('billing.corp.inv.record')}
                </Button>
              ) : null,
          },
        ].filter(Boolean)}
      />
      <FormDialog
        open={Boolean(paying)}
        onOpenChange={(o) => !o && setPaying(null)}
        title={paying ? t('billing.corp.inv.recordTitle', { no: paying.invoiceNo }) : ''}
        description={t('billing.corp.inv.recordHint')}
        schema={z.object({
          mode: z.enum(['BANK_TRANSFER', 'CHEQUE']),
          reference: z.string().trim().min(4).max(60),
          amount: z.string().trim().min(1),
        })}
        defaultValues={{
          mode: 'BANK_TRANSFER',
          reference: '',
          amount: paying ? rupeesText(paying.balance) : '',
        }}
        fields={[
          {
            name: 'mode',
            label: t('billing.corp.inv.mode'),
            type: 'select',
            options: ['BANK_TRANSFER', 'CHEQUE'].map((m) => ({
              value: m,
              label: t(`billing.corp.inv.modes.${m}`),
            })),
          },
          { name: 'reference', label: t('billing.corp.inv.reference'), required: true, mono: true },
          { name: 'amount', label: t('billing.corp.inv.amountField'), required: true },
        ]}
        submitLabel={t('billing.corp.inv.record')}
        onSubmit={(v) =>
          pay({
            id: paying.id,
            version: paying.version,
            mode: v.mode,
            reference: v.reference,
            amount: (paiseFrom(v.amount) ?? 0) / 100,
          }).unwrap()
        }
        onDone={() =>
          toast({
            tone: 'success',
            title: t('billing.corp.inv.recorded', { no: paying.invoiceNo }),
          })
        }
      />
    </>
  );
}

function Statement({ id }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const q = useCorporateStatementQuery(id);
  return (
    <QueryView query={q} rows={2}>
      {(s) => (
        <DataTable
          caption={t('billing.corp.statement')}
          data={s.entries.map((e, i) => ({ ...e, id: i }))}
          empty={t('billing.corp.inv.none')}
          columns={[
            {
              id: 'at',
              header: t('billing.corp.date'),
              cell: ({ row }) => fmtDate(row.original.at, locale),
            },
            {
              id: 'kind',
              header: '',
              cell: ({ row }) => t(`billing.corp.st.kind.${row.original.kind}`),
            },
            {
              id: 'ref',
              header: t('billing.corp.st.ref'),
              cell: ({ row }) => <span className="font-mono">{row.original.ref}</span>,
            },
            {
              id: 'debit',
              header: t('billing.corp.st.debit'),
              cell: ({ row }) => (row.original.debit ? inr(row.original.debit) : ''),
            },
            {
              id: 'credit',
              header: t('billing.corp.st.credit'),
              cell: ({ row }) => (row.original.credit ? inr(row.original.credit) : ''),
            },
            {
              id: 'bal',
              header: t('billing.corp.st.balance'),
              cell: ({ row }) => (
                <span className="tabular font-semibold">{inr(row.original.balance)}</span>
              ),
            },
          ]}
        />
      )}
    </QueryView>
  );
}

function CorporateDetail({ id }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const edit = can('billing:corporate:update');
  const q = useCorporateQuery(id);
  const [month, setMonth] = useState(thisMonth());
  const [failure, setFailure] = useState(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [issue, { isLoading: issuing }] = useIssueCorporateInvoiceMutation();
  const [setHold] = useSetCorporateHoldMutation();
  return (
    <QueryView query={q} rows={4}>
      {(c) => (
        <div className="flex flex-col gap-4">
          <Card
            title={c.name}
            description={[
              t(`billing.corp.kinds.${c.kind}`),
              c.gstin && t('billing.corp.gstin', { gstin: c.gstin }),
            ]
              .filter(Boolean)
              .join(' · ')}
            actions={
              edit &&
              (c.hold ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await setHold({ id: c.id, on: false }).unwrap();
                    toast({ tone: 'success', title: t('billing.corp.released', { name: c.name }) });
                  }}
                >
                  {t('billing.corp.release')}
                </Button>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setHoldOpen(true)}>
                  {t('billing.corp.hold')}
                </Button>
              ))
            }
          >
            {c.hold && (
              <Banner tone="critical" className="mb-3">
                {t('billing.corp.onHold', {
                  date: fmtDate(c.hold.at, locale),
                  reason: c.hold.reason,
                })}
              </Banner>
            )}
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <dt className="text-sm text-muted">{t('billing.corp.limit')}</dt>
                <dd className="tabular text-lg font-semibold">
                  {c.creditLimit ? inr(c.creditLimit) : t('billing.corp.noLimit')}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">{t('billing.corp.kpi.used')}</dt>
                <dd className="tabular text-lg font-semibold">{inr(c.used)}</dd>
                {c.creditLimit > 0 && (
                  <dd className="text-sm text-muted">
                    {t('billing.corp.usedOf', { percent: c.percent })}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-sm text-muted">{t('billing.corp.period')}</dt>
                <dd className="text-lg font-semibold">
                  {t('billing.corp.days', { n: c.creditDays })}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">{t('billing.corp.kpi.overdue')}</dt>
                <dd
                  className={cn('tabular text-lg font-semibold', c.overdue > 0 && 'text-critical')}
                >
                  {inr(c.overdue)}
                </dd>
                <dd className="text-sm text-muted">
                  {c.overdueDays
                    ? t('billing.corp.overdueFor', { n: c.overdueDays })
                    : t('billing.corp.nothingOverdue')}
                </dd>
              </div>
            </dl>
          </Card>

          <Card
            title={t('billing.corp.draft')}
            description={
              c.draftBills.length
                ? t('billing.corp.draftBills', {
                    count: c.draftBills.length,
                    amount: inr(c.draft.amount),
                  })
                : ''
            }
            padding={false}
          >
            {c.draftBills.length ? (
              <>
                <DataTable
                  caption={t('billing.corp.draft')}
                  data={c.draftBills.map((b) => ({ ...b, id: b.billId }))}
                  columns={[
                    {
                      id: 'bill',
                      header: t('billing.corp.bill'),
                      cell: ({ row }) => <span className="font-mono">{row.original.billNo}</span>,
                    },
                    {
                      id: 'patient',
                      header: t('billing.corp.patient'),
                      cell: ({ row }) => row.original.patient,
                    },
                    {
                      id: 'date',
                      header: t('billing.corp.date'),
                      cell: ({ row }) => fmtDate(row.original.date, locale),
                    },
                    {
                      id: 'amount',
                      header: t('billing.corp.amount'),
                      cell: ({ row }) => (
                        <span className="tabular">{inr(row.original.amount)}</span>
                      ),
                    },
                    {
                      id: 'tax',
                      header: t('billing.corp.taxable'),
                      cell: ({ row }) =>
                        row.original.taxable ? inr(row.original.taxable) : t('billing.corp.exempt'),
                    },
                  ]}
                />
                {edit && (
                  <div className="flex flex-wrap items-end gap-3 border-t border-line p-4">
                    <FormField label={t('billing.corp.month')}>
                      <Input
                        type="month"
                        value={month}
                        max={thisMonth()}
                        onChange={(e) => setMonth(e.target.value)}
                      />
                    </FormField>
                    <Button
                      loading={issuing}
                      onClick={async () => {
                        setFailure(null);
                        try {
                          const inv = await issue({ payerId: c.id, month }).unwrap();
                          toast({
                            tone: 'success',
                            title: t('billing.corp.issued', {
                              no: inv.invoiceNo,
                              amount: inr(inv.total),
                            }),
                          });
                        } catch (e) {
                          setFailure(e);
                        }
                      }}
                    >
                      {t('billing.corp.issue')}
                    </Button>
                    <ApiErrorNotice error={failure} className="w-full" />
                  </div>
                )}
              </>
            ) : (
              <p className="p-4 text-muted">{t('billing.corp.noDraft')}</p>
            )}
          </Card>

          <Card title={t('billing.corp.tabs.invoices')} padding={false}>
            <InvoiceTable invoices={c.invoices} />
          </Card>
          <Card title={t('billing.corp.statement')} padding={false}>
            <Statement id={c.id} />
          </Card>

          <FormDialog
            open={holdOpen}
            onOpenChange={setHoldOpen}
            title={t('billing.corp.holdTitle', { name: c.name })}
            description={t('billing.corp.holdHint')}
            destructive
            schema={z.object({ reason: z.string().trim().min(5).max(200) })}
            defaultValues={{ reason: '' }}
            fields={[
              {
                name: 'reason',
                label: t('billing.corp.holdReason'),
                type: 'textarea',
                required: true,
              },
            ]}
            submitLabel={t('billing.corp.hold')}
            onSubmit={(v) => setHold({ id: c.id, on: true, reason: v.reason }).unwrap()}
            onDone={() =>
              toast({ tone: 'success', title: t('billing.corp.held', { name: c.name }) })
            }
          />
        </div>
      )}
    </QueryView>
  );
}

function AccountsTab() {
  const { t } = useTranslation();
  const q = useCorporatesQuery();
  const [selected, setSelected] = useUrlState('id', '');
  return (
    <QueryView query={q} rows={3}>
      {(data) => {
        if (!data.items.length) return <EmptyState title={t('billing.corp.none')} />;
        return (
          <div className="flex flex-col gap-4">
            <KpiRow
              items={[
                { label: t('billing.corp.kpi.active'), value: String(data.totals.active) },
                { label: t('billing.corp.kpi.used'), value: inr(data.totals.used) },
                {
                  label: t('billing.corp.kpi.overdue'),
                  value: inr(data.totals.overdue),
                  tone: data.totals.overdue ? 'critical' : 'neutral',
                },
                {
                  label: t('billing.corp.kpi.drafts'),
                  value: inr(data.totals.drafts),
                  sub: t('billing.corp.kpi.draftsSub'),
                },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
              <nav aria-label={t('billing.corp.list')}>
                <ul className="flex flex-col gap-2">
                  {data.items.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-current={c.id === selected ? 'true' : undefined}
                        onClick={() => setSelected(c.id)}
                        className={cn(
                          'flex w-full cursor-pointer flex-col gap-1 rounded-card border border-line bg-surface p-3 text-left hover:border-muted',
                          c.id === selected && 'border-primary bg-info-bg',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">{c.name}</span>
                          <StatusBadge
                            tone={STATUS_TONE[c.status]}
                            label={t(`billing.corp.status.${c.status}`)}
                          />
                        </span>
                        <span className="text-sm text-muted">
                          {inr(c.used)}
                          {c.creditLimit ? ` / ${inr(c.creditLimit)}` : ''}
                        </span>
                        {c.creditLimit > 0 && (
                          <span
                            className="h-2 overflow-hidden rounded-chip bg-neutral-bg"
                            aria-hidden="true"
                          >
                            <span
                              className={cn(
                                'block h-full rounded-chip',
                                c.percent >= 90 ? 'bg-critical' : 'bg-primary',
                              )}
                              style={{ width: `${Math.min(100, Math.max(2, c.percent))}%` }}
                            />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              {selected ? (
                <CorporateDetail id={selected} />
              ) : (
                <EmptyState title={t('billing.corp.pick')} />
              )}
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}

function InvoicesTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useUrlState('status', '');
  const q = useCorporateInvoicesQuery({ status: status || undefined, limit: 100 });
  return (
    <div className="flex flex-col gap-3">
      <Select
        aria-label={t('common.status')}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-full sm:w-56"
      >
        <option value="">{t('billing.corp.inv.all')}</option>
        {['ISSUED', 'PARTLY_PAID', 'OVERDUE', 'PAID'].map((s) => (
          <option key={s} value={s}>
            {t(`billing.corp.inv.status.${s}`)}
          </option>
        ))}
      </Select>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <InvoiceTable invoices={d.items} showPayer />
          </Card>
        )}
      </QueryView>
    </div>
  );
}

function EinvoiceTab() {
  const { t } = useTranslation();
  const q = useCorporateInvoicesQuery({ limit: 100 });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('billing.corp.einv.hint')}</p>
      <QueryView query={q} rows={3}>
        {(d) => (
          <>
            {d.items.some((i) => i.einvoice.status === 'PENDING') && (
              <Banner tone="warning">{t('billing.corp.einv.pendingHint')}</Banner>
            )}
            <Card padding={false}>
              <DataTable
                caption={t('billing.corp.tabs.einvoice')}
                data={d.items}
                empty={t('billing.corp.inv.none')}
                columns={[
                  {
                    id: 'no',
                    header: t('billing.corp.inv.number'),
                    cell: ({ row }) => <span className="font-mono">{row.original.invoiceNo}</span>,
                  },
                  {
                    id: 'payer',
                    header: t('billing.corp.inv.payer'),
                    cell: ({ row }) => row.original.payer?.name,
                  },
                  {
                    id: 'taxable',
                    header: t('billing.corp.taxable'),
                    cell: ({ row }) => inr(row.original.taxable),
                  },
                  {
                    id: 'irn',
                    header: t('billing.corp.einv.irn'),
                    cell: ({ row }) => (
                      <StatusBadge
                        tone={row.original.einvoice.status === 'PENDING' ? 'warning' : 'neutral'}
                        label={t(`billing.corp.einv.${row.original.einvoice.status}`)}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}

function AgeingTab() {
  const { t } = useTranslation();
  const q = useCorporateAgeingQuery();
  const keys = ['d0_30', 'd31_60', 'd61_90', 'd90', 'total'];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('billing.corp.ageing.hint')}</p>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('billing.corp.tabs.ageing')}
              data={
                d.items.length
                  ? [
                      ...d.items,
                      { payerId: 'total', name: t('billing.corp.ageing.total'), ...d.totals },
                    ]
                  : []
              }
              getRowId={(r) => r.payerId}
              empty={t('billing.corp.ageing.none')}
              columns={[
                {
                  id: 'name',
                  header: t('billing.corp.inv.payer'),
                  cell: ({ row }) => (
                    <span className={cn(row.original.payerId === 'total' && 'font-semibold')}>
                      {row.original.name}
                    </span>
                  ),
                },
                ...keys.map((k) => ({
                  id: k,
                  header: t(`billing.corp.ageing.${k}`),
                  cell: ({ row }) => (
                    <span
                      className={cn(
                        'tabular',
                        k === 'd90' && row.original.d90 > 0 && 'font-semibold text-critical',
                        row.original.payerId === 'total' && 'font-semibold',
                      )}
                    >
                      {inr(row.original[k])}
                    </span>
                  ),
                })),
              ]}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}

function LettersTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const edit = can('billing:corporate:update');
  const q = useLettersOfCreditQuery({});
  const payers = useCorporatesQuery();
  const [open, setOpen] = useState(false);
  const [add] = useAddLetterOfCreditMutation();
  const [cancel] = useCancelLetterOfCreditMutation();
  const tone = { VALID: 'success', EXPIRED: 'critical', CANCELLED: 'neutral' };
  return (
    <div className="flex flex-col gap-3">
      {edit && (
        <div>
          <Button onClick={() => setOpen(true)}>{t('billing.corp.letters.add')}</Button>
        </div>
      )}
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('billing.corp.tabs.letters')}
              data={d.items}
              empty={t('billing.corp.letters.none')}
              columns={[
                {
                  id: 'patient',
                  header: t('billing.corp.patient'),
                  cell: ({ row }) => row.original.patient?.name,
                },
                {
                  id: 'payer',
                  header: t('billing.corp.inv.payer'),
                  cell: ({ row }) => row.original.payerName,
                },
                {
                  id: 'no',
                  header: t('billing.corp.letters.letterNo'),
                  cell: ({ row }) => <span className="font-mono">{row.original.letterNo}</span>,
                },
                {
                  id: 'valid',
                  header: t('billing.corp.letters.validTill'),
                  cell: ({ row }) => fmtDate(row.original.validTill, locale),
                },
                {
                  id: 'covers',
                  header: t('billing.corp.letters.covers'),
                  cell: ({ row }) => row.original.covers ?? '',
                },
                {
                  id: 'status',
                  header: t('common.status'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={tone[row.original.status]}
                      label={t(`billing.corp.letters.status.${row.original.status}`)}
                    />
                  ),
                },
                {
                  id: 'act',
                  header: '',
                  cell: ({ row }) =>
                    edit && row.original.status === 'VALID' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await cancel({
                            id: row.original.id,
                            version: row.original.version,
                          }).unwrap();
                          toast({ tone: 'success', title: t('billing.corp.letters.cancelled') });
                        }}
                      >
                        {t('billing.corp.letters.cancel')}
                      </Button>
                    ) : null,
                },
              ]}
            />
          </Card>
        )}
      </QueryView>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('billing.corp.letters.addTitle')}
        schema={z.object({
          payerId: z.string().min(1),
          patient: z.object({ id: z.string() }, { error: 'Choose the patient' }),
          letterNo: z.string().trim().min(2).max(40),
          validTill: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          covers: z.string().max(200).optional(),
          limit: z.string().optional(),
        })}
        defaultValues={{
          payerId: '',
          patient: null,
          letterNo: '',
          validTill: '',
          covers: '',
          limit: '',
        }}
        fields={[
          {
            name: 'payerId',
            label: t('billing.corp.inv.payer'),
            type: 'select',
            options: [
              { value: '', label: '' },
              ...(payers.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })),
            ],
          },
          { name: 'patient', label: t('billing.corp.patient'), type: 'patient' },
          {
            name: 'letterNo',
            label: t('billing.corp.letters.letterNo'),
            required: true,
            mono: true,
          },
          {
            name: 'validTill',
            label: t('billing.corp.letters.validTill'),
            type: 'date',
            required: true,
          },
          { name: 'covers', label: t('billing.corp.letters.covers'), optional: true },
          { name: 'limit', label: t('billing.corp.letters.limit'), optional: true },
        ]}
        submitLabel={t('billing.corp.letters.add')}
        onSubmit={(v) =>
          add({
            payerId: v.payerId,
            patientId: v.patient.id,
            letterNo: v.letterNo,
            validTill: v.validTill,
            covers: v.covers || undefined,
            limit: v.limit ? (paiseFrom(v.limit) ?? 0) / 100 : undefined,
          }).unwrap()
        }
        onDone={(l) =>
          toast({ tone: 'success', title: t('billing.corp.letters.added', { no: l.letterNo }) })
        }
      />
    </div>
  );
}

/**
 * Corporate and credit desk (design board "Corporate and credit"): companies and government
 * bodies billed on credit, their monthly invoices and receipts, e-invoice status, receivables
 * by age and letters of credit.
 */
export default function BillCorporatePage() {
  useStrings(addBillingStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={t('billing.corp.title')} description={t('billing.corp.description')} />
      <UrlTabs
        label={t('billing.corp.tabsLabel')}
        tabs={[
          { id: 'accounts', label: t('billing.corp.tabs.accounts'), body: <AccountsTab /> },
          { id: 'invoices', label: t('billing.corp.tabs.invoices'), body: <InvoicesTab /> },
          { id: 'einvoice', label: t('billing.corp.tabs.einvoice'), body: <EinvoiceTab /> },
          { id: 'ageing', label: t('billing.corp.tabs.ageing'), body: <AgeingTab /> },
          { id: 'letters', label: t('billing.corp.tabs.letters'), body: <LettersTab /> },
        ]}
      />
    </Page>
  );
}
