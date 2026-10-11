import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { addConsoleStrings } from '@hms/i18n/console';
import { Button, Page, PageHeader, Select, useToast } from '@hms/ui';
import { inr, paiseFrom, rupeesText } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { RecordsTable } from '../../dx-kit/RecordsTable.jsx';
import { usePlatformCan } from '../access.js';
import { CONSOLE_BASE, usePlatformInvoicesQuery, useRecordInvoicePaymentMutation } from '../api.js';
import { InvoiceStatusBadge } from '../components/Badges.jsx';
import { daysUntil, fmtDate, localeOf } from '../format.js';

const STATUSES = ['ISSUED', 'PAID', 'VOID'];

/**
 * Platform billing (console menu "Billing"): every subscription invoice, newest first. Finance
 * records a bank transfer against an issued invoice; paying it clears the hospital's overdue
 * state and applies a pending plan change.
 */
export default function InvoicesPage() {
  useStrings(addConsoleStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = usePlatformCan();
  const [status, setStatus] = useUrlState('status', '');
  const [paying, setPaying] = useState(null);
  const [record] = useRecordInvoicePaymentMutation();

  const columns = useMemo(
    () => [
      {
        id: 'number',
        header: t('console.inv.number'),
        cell: ({ row }) => <span className="font-mono">{row.original.number}</span>,
      },
      {
        id: 'hospital',
        header: t('console.inv.hospital'),
        cell: ({ row }) => (
          <Link to={`/tenants/${row.original.tenantId}`} className="text-ink hover:underline">
            {row.original.billTo?.legalName ?? row.original.tenantId}
          </Link>
        ),
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
        id: 'due',
        header: t('console.inv.due'),
        cell: ({ row }) => {
          const x = row.original;
          if (x.status === 'PAID')
            return t('console.inv.paidOn', { date: fmtDate(x.paidAt, locale) });
          const late = x.status === 'ISSUED' && daysUntil(x.dueAt) < 0;
          return (
            <span className={late ? 'font-semibold text-critical' : undefined}>
              {fmtDate(x.dueAt, locale)}
              {late ? ` · ${t('console.inv.overdue')}` : ''}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: t('console.ten.state'),
        cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-2">
            <a
              className="text-primary hover:underline"
              href={`${CONSOLE_BASE}/invoices/${row.original.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              {t('console.inv.pdf')}
            </a>
            {row.original.status === 'ISSUED' && can('platform:invoice:update') && (
              <Button size="sm" variant="secondary" onClick={() => setPaying(row.original)}>
                {t('console.inv.record')}
              </Button>
            )}
          </span>
        ),
      },
    ],
    [t, locale, can],
  );

  return (
    <Page>
      <PageHeader title={t('console.inv.title')} description={t('console.inv.description')} />
      <div className="mb-3">
        <Select
          aria-label={t('console.ten.state')}
          value={status}
          onChange={(e) => setStatus(e.target.value, { reset: ['page'] })}
          className="w-full sm:w-56"
        >
          <option value="">{t('console.inv.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`console.invoice.status.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <RecordsTable
        useQuery={usePlatformInvoicesQuery}
        args={{ status: status || undefined }}
        columns={columns}
        caption={t('console.inv.caption')}
        emptyTitle={t('console.inv.empty')}
      />
      <FormDialog
        open={Boolean(paying)}
        onOpenChange={(o) => !o && setPaying(null)}
        title={paying ? t('console.inv.recordTitle', { number: paying.number }) : ''}
        description={t('console.inv.recordHint')}
        schema={z.object({
          reference: z.string().trim().min(4).max(60),
          amount: z.string().trim().min(1),
        })}
        defaultValues={{ reference: '', amount: paying ? rupeesText(paying.total) : '' }}
        fields={[
          { name: 'reference', label: t('console.inv.reference'), required: true, mono: true },
          { name: 'amount', label: t('console.inv.amount'), required: true },
        ]}
        submitLabel={t('console.inv.record')}
        onSubmit={(v) =>
          record({ id: paying.id, reference: v.reference, amount: paiseFrom(v.amount) }).unwrap()
        }
        onDone={() =>
          toast({ tone: 'success', title: t('console.inv.recorded', { number: paying.number }) })
        }
      />
    </Page>
  );
}
