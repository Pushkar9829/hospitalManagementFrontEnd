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
import { fmtMonth, localeOf } from '../../dx-kit/format.js';
import { fyOf, fyOptions } from './fy.js';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PdfPreviewDialog } from '../../../components/PdfPreviewDialog.jsx';
import { inr, paiseFrom, rupeesText } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import {
  downloadText,
  useForm16ListQuery,
  usePaySettingsQuery,
  useRecordChallanMutation,
  useReturn24QQuery,
  useSavePaySettingsMutation,
  useTdsYearQuery,
} from '../../hr/api.js';

const DEDUCTOR = ['name', 'tan', 'pan', 'address', 'responsibleName', 'responsibleDesignation'];

/** The employer's TAN and the person who signs Form 16 (payroll settings, deductor). */
function DeductorCard() {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const q = usePaySettingsQuery();
  const [save, state] = useSavePaySettingsMutation();
  const [f, setF] = useState(null);
  if (!q.data) return <QueryView query={q} rows={2} />;
  const v = f ?? Object.fromEntries(DEDUCTOR.map((k) => [k, q.data.deductor?.[k] ?? '']));
  const edit = can('payroll:settings:update');
  return (
    <Card title={t('pay.tds.deductor')} description={t('pay.tds.deductorHint')}>
      {state.error && <ApiErrorNotice error={state.error} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {DEDUCTOR.map((k) => (
          <FormField key={k} label={t(`pay.tds.d.${k}`)}>
            <Input
              value={v[k]}
              disabled={!edit}
              onChange={(e) => setF({ ...v, [k]: e.target.value })}
            />
          </FormField>
        ))}
      </div>
      {edit && (
        <Button
          className="mt-3"
          disabled={!f}
          loading={state.isLoading}
          onClick={async () => {
            const deductor = Object.fromEntries(
              Object.entries(v)
                .map(([k, x]) => [k, x.trim()])
                .filter(([, x]) => x),
            );
            await save({ deductor }).unwrap();
            setF(null);
            toast({ tone: 'success', title: t('pay.tds.deductorSaved') });
          }}
        >
          {t('pay.tds.saveDeductor')}
        </Button>
      )}
    </Card>
  );
}

/** Month by month: TDS deducted, the challan that deposited it, short or late. */
function MonthsCard({ fy }) {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const q = useTdsYearQuery({ fy });
  const [record] = useRecordChallanMutation();
  const [month, setMonth] = useState(null);
  return (
    <Card title={t('pay.tds.months')} description={t('pay.tds.monthsHint')}>
      <QueryView query={q} rows={6}>
        {(d) => (
          <DataTable
            caption={t('pay.tds.months')}
            data={d.months}
            columns={[
              {
                id: 'month',
                header: t('pay.tds.month'),
                cell: ({ row }) => fmtMonth(`${row.original.month}-01`, localeOf(i18n)),
              },
              {
                id: 'tds',
                header: t('pay.tds.deducted'),
                cell: ({ row }) => (row.original.locked ? inr(row.original.tds) : '–'),
              },
              {
                id: 'challan',
                header: t('pay.tds.challan'),
                cell: ({ row }) => {
                  const c = row.original.challan;
                  return c ? (
                    <span className="text-sm">
                      {inr(c.amount)}{' '}
                      <span className="font-mono text-muted">
                        {c.bsrCode}/{c.challanSerial} · {c.depositedOn}
                      </span>
                    </span>
                  ) : (
                    '–'
                  );
                },
              },
              { id: 'due', header: t('pay.tds.due'), cell: ({ row }) => row.original.due },
              {
                id: 'state',
                header: t('common.status'),
                cell: ({ row }) => {
                  const m = row.original;
                  if (!m.locked) return <StatusBadge tone="neutral" label={t('pay.tds.open')} />;
                  if (m.short > 0)
                    return (
                      <StatusBadge
                        tone={m.late ? 'critical' : 'warning'}
                        label={t('pay.tds.short', { amount: inr(m.short) })}
                      />
                    );
                  return m.late ? (
                    <StatusBadge tone="warning" label={t('pay.tds.late')} />
                  ) : (
                    <StatusBadge tone="success" label={t('pay.tds.deposited')} />
                  );
                },
              },
              can('payroll:run:create') && {
                id: 'act',
                header: '',
                cell: ({ row }) =>
                  row.original.locked && row.original.tds > 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => setMonth(row.original)}>
                      {row.original.challan ? t('pay.tds.editChallan') : t('pay.tds.addChallan')}
                    </Button>
                  ) : null,
              },
            ].filter(Boolean)}
          />
        )}
      </QueryView>
      <FormDialog
        open={Boolean(month)}
        onOpenChange={(o) => !o && setMonth(null)}
        title={month ? t('pay.tds.challanTitle', { month: month.month }) : ''}
        schema={z.object({
          bsrCode: z.string().regex(/^\d{7}$/, t('pay.tds.bsrRule')),
          challanSerial: z.string().regex(/^\d{5}$/, t('pay.tds.serialRule')),
          depositedOn: z.string().min(10),
          amount: z.string().min(1),
        })}
        defaultValues={{
          bsrCode: month?.challan?.bsrCode ?? '',
          challanSerial: month?.challan?.challanSerial ?? '',
          depositedOn: month?.challan?.depositedOn ?? '',
          amount: rupeesText(month?.challan?.amount ?? month?.tds ?? 0),
        }}
        fields={[
          { name: 'bsrCode', label: t('pay.tds.bsr'), required: true },
          { name: 'challanSerial', label: t('pay.tds.serial'), required: true },
          { name: 'depositedOn', label: t('pay.tds.depositedOn'), type: 'date', required: true },
          { name: 'amount', label: t('pay.tds.amount'), required: true },
        ]}
        submitLabel={t('pay.tds.saveChallan')}
        onSubmit={(v) => record({ ...v, month: month.month, amount: paiseFrom(v.amount) }).unwrap()}
        onDone={() => toast({ tone: 'success', title: t('pay.tds.challanSaved') })}
      />
    </Card>
  );
}

/** The quarter's 24Q: problems first, the challans and the deductee rows (CSV for the RPU). */
function ReturnCard({ fy }) {
  const { t } = useTranslation();
  const [quarter, setQuarter] = useState(1);
  const q = useReturn24QQuery({ fy, quarter });
  return (
    <Card title={t('pay.tds.return')} description={t('pay.tds.returnHint')}>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t('pay.tds.quarter')}>
        {[1, 2, 3, 4].map((n) => (
          <Button
            key={n}
            size="sm"
            variant={quarter === n ? 'primary' : 'secondary'}
            aria-pressed={quarter === n}
            onClick={() => setQuarter(n)}
          >
            {`Q${n}`}
          </Button>
        ))}
      </div>
      <QueryView query={q} rows={4}>
        {(d) => (
          <div className="flex flex-col gap-3">
            {d.issues.length ? (
              <Banner tone="warning" title={t('pay.tds.issues', { count: d.issues.length })}>
                <ul className="list-disc pl-5">
                  {d.issues.map((i) => (
                    <li key={`${i.code}${i.month ?? ''}`}>{i.message}</li>
                  ))}
                </ul>
              </Banner>
            ) : (
              <Banner tone="success" title={t('pay.tds.ready')} />
            )}
            <p className="text-sm">
              {t('pay.tds.totals', {
                paid: inr(d.totals.amountPaid),
                tds: inr(d.totals.tds),
                deposited: inr(d.totals.deposited),
              })}
            </p>
            <div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!d.annexure1.length}
                onClick={() => downloadText(`24Q-${d.fy}-Q${d.quarter}.csv`, d.csv)}
              >
                {t('pay.tds.csv')}
              </Button>
            </div>
            {d.annexure2 && (
              <DataTable
                caption={t('pay.tds.annexure2')}
                data={d.annexure2}
                columns={[
                  {
                    id: 'emp',
                    header: t('pay.gr.employee'),
                    cell: ({ row }) => `${row.original.name} (${row.original.empNo})`,
                  },
                  { id: 'pan', header: 'PAN', cell: ({ row }) => row.original.pan },
                  {
                    id: 'gross',
                    header: t('pay.tds.gross'),
                    cell: ({ row }) => inr(row.original.gross),
                  },
                  {
                    id: 'taxable',
                    header: t('pay.tds.taxable'),
                    cell: ({ row }) => inr(row.original.taxable),
                  },
                  { id: 'tax', header: t('pay.tds.tax'), cell: ({ row }) => inr(row.original.tax) },
                  {
                    id: 'tds',
                    header: t('pay.tds.deducted'),
                    cell: ({ row }) => inr(row.original.tdsDeducted),
                  },
                ]}
              />
            )}
          </div>
        )}
      </QueryView>
    </Card>
  );
}

/** Form 16 for everyone paid salary in the year (provisional until March is over). */
function Form16Card({ fy }) {
  const { t } = useTranslation();
  const q = useForm16ListQuery({ fy });
  const [printing, setPrinting] = useState(null);
  return (
    <Card title={t('pay.tds.form16')} description={t('pay.tds.form16Hint')}>
      <QueryView query={q} rows={4}>
        {(d) => (
          <>
            {d.provisional && <Banner tone="info" title={t('pay.tds.provisional')} />}
            <DataTable
              caption={t('pay.tds.form16')}
              data={d.items}
              empty={t('pay.tds.noSalary')}
              columns={[
                {
                  id: 'emp',
                  header: t('pay.gr.employee'),
                  cell: ({ row }) => `${row.original.name} (${row.original.empNo})`,
                },
                { id: 'pan', header: 'PAN', cell: ({ row }) => row.original.pan ?? '–' },
                {
                  id: 'gross',
                  header: t('pay.tds.gross'),
                  cell: ({ row }) => inr(row.original.gross),
                },
                {
                  id: 'tds',
                  header: t('pay.tds.deducted'),
                  cell: ({ row }) => inr(row.original.tds),
                },
                {
                  id: 'act',
                  header: '',
                  cell: ({ row }) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('pay.tds.form16For', { name: row.original.name })}
                      onClick={() => setPrinting(row.original)}
                    >
                      {t('pay.tds.form16')}
                    </Button>
                  ),
                },
              ]}
            />
          </>
        )}
      </QueryView>
      {printing && (
        <PdfPreviewDialog
          open
          onOpenChange={(o) => !o && setPrinting(null)}
          url={`/payroll/form16/${printing.employeeId}/pdf?fy=${fy}`}
          title={t('pay.tds.form16For', { name: printing.name })}
          number={`Form16-${printing.empNo}-${fy}`}
        />
      )}
    </Card>
  );
}

/** Salary TDS: the deductor, monthly challans, the quarterly 24Q and Form 16. */
export function TdsTab() {
  const { t } = useTranslation();
  const [fy, setFy] = useState(fyOf());
  const valid = /^\d{4}-\d{2}$/.test(fy);
  return (
    <div className="flex flex-col gap-4">
      <FormField label={t('pay.bn.fy')} className="max-w-xs">
        <Select value={fy} onChange={(e) => setFy(e.target.value)} options={fyOptions()} />
      </FormField>
      <DeductorCard />
      {valid && (
        <>
          <MonthsCard fy={fy} />
          <ReturnCard fy={fy} />
          <Form16Card fy={fy} />
        </>
      )}
    </div>
  );
}
