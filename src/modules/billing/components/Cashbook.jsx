import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import {
  Banner,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  StatusBadge,
  cn,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { inr, paiseFrom } from '../../../lib/money.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, fmtTime, localeOf } from '../../dx-kit/format.js';
import {
  useBankDepositsQuery,
  useCreateBankDepositMutation,
  useDayStateQuery,
  useLockDayMutation,
  useRecordSettlementMutation,
  useSetBankDepositStatusMutation,
  useSettlementsQuery,
} from '../api.js';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const rupees = (text) => (paiseFrom(text) ?? 0) / 100;
const STATE_TONE = {
  PENDING: 'neutral',
  MATCHED: 'success',
  MATCHED_MDR: 'success',
  SHORT: 'critical',
  OVER: 'warning',
};
const SLIP_TONE = { DEPOSITED: 'info', CREDITED: 'success', CHEQUE_RETURNED: 'critical' };

/** Day-end: shifts still open or to verify, and the lock once every one is verified. */
export function DayEnd() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const day = useDayStateQuery(istToday(), { pollingInterval: 60_000 });
  const [lock, locking] = useLockDayMutation();
  const [failure, setFailure] = useState(null);
  return (
    <Card title={t('billing.shift.day.title')} description={t('billing.shift.day.hint')}>
      <QueryView query={day} rows={1}>
        {(d) => (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge
              tone={d.shifts.open ? 'warning' : 'neutral'}
              label={t('billing.shift.day.open', { count: d.shifts.open })}
            />
            <StatusBadge
              tone={d.shifts.toVerify ? 'warning' : 'neutral'}
              label={t('billing.shift.day.toVerify', { count: d.shifts.toVerify })}
            />
            <StatusBadge
              tone="success"
              label={t('billing.shift.day.verified', { count: d.shifts.verified })}
            />
            {d.locked ? (
              <span className="text-sm font-semibold text-ink">
                {t('billing.shift.day.locked', {
                  time: fmtTime(d.lockedAt, localeOf(i18n)),
                  by: d.lockedBy,
                })}
              </span>
            ) : (
              <Button
                className="ml-auto"
                loading={locking.isLoading}
                disabled={d.shifts.open > 0 || d.shifts.toVerify > 0}
                onClick={async () => {
                  setFailure(null);
                  try {
                    await lock(d.date).unwrap();
                    toast({ tone: 'success', title: t('billing.shift.day.lockedToast') });
                  } catch (e) {
                    setFailure(e);
                  }
                }}
              >
                {t('billing.shift.day.lock')}
              </Button>
            )}
            <ApiErrorNotice error={failure} className="w-full" />
          </div>
        )}
      </QueryView>
    </Card>
  );
}

/** Card and UPI receipts by device for a day, matched against what the bank settled. */
export function SettlementTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('billing:shift:verify');
  const [date, setDate] = useState(istToday());
  const q = useSettlementsQuery(date);
  const [save] = useRecordSettlementMutation();
  const [row, setRow] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        {t('billing.shift.stl.hint', { limit: q.data?.mdrLimitPercent ?? 3 })}
      </p>
      <FormField label={t('billing.shift.stl.date')} className="max-w-xs">
        <Input
          type="date"
          value={date}
          max={istToday()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </FormField>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('billing.shift.stl.tab')}
              data={d.items.map((x) => ({ ...x, id: `${x.mode}|${x.counter}` }))}
              empty={t('billing.shift.stl.none')}
              columns={[
                {
                  id: 'counter',
                  header: t('billing.shift.stl.counter'),
                  cell: ({ row: r }) => r.original.counter,
                },
                {
                  id: 'device',
                  header: t('billing.shift.stl.device'),
                  cell: ({ row: r }) => r.original.modeName,
                },
                {
                  id: 'receipts',
                  header: t('billing.shift.stl.receipts'),
                  cell: ({ row: r }) => (
                    <span className="tabular">{`${inr(r.original.receipts)} (${r.original.count})`}</span>
                  ),
                },
                {
                  id: 'settled',
                  header: t('billing.shift.stl.settled'),
                  cell: ({ row: r }) =>
                    r.original.settled == null ? (
                      '–'
                    ) : (
                      <span className="tabular">{inr(r.original.settled)}</span>
                    ),
                },
                {
                  id: 'ref',
                  header: t('billing.shift.stl.reference'),
                  cell: ({ row: r }) => (
                    <span className="font-mono">{r.original.reference ?? ''}</span>
                  ),
                },
                {
                  id: 'diff',
                  header: t('billing.shift.stl.difference'),
                  cell: ({ row: r }) =>
                    r.original.difference == null ? (
                      ''
                    ) : (
                      <span
                        className={cn(
                          'tabular',
                          r.original.state === 'SHORT' && 'font-semibold text-critical',
                        )}
                      >
                        {inr(r.original.difference)}
                      </span>
                    ),
                },
                {
                  id: 'state',
                  header: t('common.status'),
                  cell: ({ row: r }) => (
                    <StatusBadge
                      tone={STATE_TONE[r.original.state]}
                      label={t(`billing.shift.stl.state.${r.original.state}`)}
                    />
                  ),
                },
                edit && {
                  id: 'act',
                  header: '',
                  cell: ({ row: r }) => (
                    <Button size="sm" variant="secondary" onClick={() => setRow(r.original)}>
                      {t('billing.shift.stl.match')}
                    </Button>
                  ),
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
      <FormDialog
        open={Boolean(row)}
        onOpenChange={(o) => !o && setRow(null)}
        title={
          row
            ? t('billing.shift.stl.matchTitle', { device: row.modeName, counter: row.counter })
            : ''
        }
        schema={z.object({
          settled: z.string().trim().min(1),
          reference: z.string().trim().min(3).max(60),
          note: z.string().max(200).optional(),
        })}
        defaultValues={{
          settled:
            row?.settled != null ? String(row.settled / 100) : String((row?.receipts ?? 0) / 100),
          reference: row?.reference ?? '',
          note: row?.note ?? '',
        }}
        fields={[
          { name: 'settled', label: t('billing.shift.stl.settledField'), required: true },
          {
            name: 'reference',
            label: t('billing.shift.stl.reference'),
            required: true,
            mono: true,
          },
          { name: 'note', label: t('billing.shift.stl.note'), optional: true },
        ]}
        submitLabel={t('billing.shift.stl.match')}
        onSubmit={(f) =>
          save({
            date,
            mode: row.mode,
            counter: row.counter,
            settled: rupees(f.settled),
            reference: f.reference,
            note: f.note || undefined,
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('billing.shift.stl.saved') })}
      />
    </div>
  );
}

const blankCheque = () => ({ number: '', bank: '', amount: '' });

/** Deposit slips for cash and cheques, and their credit by the bank. */
export function DepositsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const edit = can('billing:shift:verify');
  const list = useBankDepositsQuery();
  const [create, creating] = useCreateBankDepositMutation();
  const [setStatus] = useSetBankDepositStatusMutation();
  const [form, setForm] = useState({ date: istToday(), bank: '', cash: '' });
  const [cheques, setCheques] = useState([]);
  const [failure, setFailure] = useState(null);
  const valid =
    form.bank.trim().length >= 2 &&
    (Number(form.cash) > 0 || cheques.length > 0) &&
    cheques.every(
      (c) => c.number.trim().length >= 3 && c.bank.trim().length >= 2 && Number(c.amount) > 0,
    );
  return (
    <div className="flex flex-col gap-4">
      {edit && (
        <Card title={t('billing.shift.dep.new')}>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label={t('billing.shift.dep.date')}>
                <Input
                  type="date"
                  value={form.date}
                  max={istToday()}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </FormField>
              <FormField label={t('billing.shift.dep.bank')}>
                <Input
                  value={form.bank}
                  onChange={(e) => setForm({ ...form, bank: e.target.value })}
                />
              </FormField>
              <FormField label={t('billing.shift.dep.cash')}>
                <Input
                  inputMode="decimal"
                  value={form.cash}
                  onChange={(e) => setForm({ ...form, cash: e.target.value })}
                />
              </FormField>
            </div>
            {cheques.map((c, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-3">
                <FormField label={t('billing.shift.dep.chequeNo')}>
                  <Input
                    value={c.number}
                    onChange={(e) =>
                      setCheques(
                        cheques.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)),
                      )
                    }
                  />
                </FormField>
                <FormField label={t('billing.shift.dep.chequeBank')}>
                  <Input
                    value={c.bank}
                    onChange={(e) =>
                      setCheques(
                        cheques.map((x, j) => (j === i ? { ...x, bank: e.target.value } : x)),
                      )
                    }
                  />
                </FormField>
                <FormField label={t('billing.shift.dep.chequeAmount')}>
                  <Input
                    inputMode="decimal"
                    value={c.amount}
                    onChange={(e) =>
                      setCheques(
                        cheques.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                      )
                    }
                  />
                </FormField>
              </div>
            ))}
            <ApiErrorNotice error={failure} />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={<Plus size={16} aria-hidden="true" />}
                onClick={() => setCheques([...cheques, blankCheque()])}
              >
                {t('billing.shift.dep.addCheque')}
              </Button>
              <Button
                loading={creating.isLoading}
                disabled={!valid}
                onClick={async () => {
                  setFailure(null);
                  try {
                    const slip = await create({
                      date: form.date,
                      bank: form.bank.trim(),
                      cash: form.cash ? rupees(form.cash) : undefined,
                      cheques: cheques.map((c) => ({
                        number: c.number.trim(),
                        bank: c.bank.trim(),
                        amount: rupees(c.amount),
                      })),
                    }).unwrap();
                    setForm({ date: istToday(), bank: form.bank, cash: '' });
                    setCheques([]);
                    toast({
                      tone: 'success',
                      title: t('billing.shift.dep.saved', { no: slip.slipNo }),
                    });
                  } catch (e) {
                    setFailure(e);
                  }
                }}
              >
                {t('billing.shift.dep.save')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      <QueryView query={list} rows={3}>
        {(d) => (
          <Card padding={false}>
            {d.items.some((x) => x.status === 'CHEQUE_RETURNED') && (
              <Banner tone="critical" className="m-4">
                {t('billing.shift.dep.status.CHEQUE_RETURNED')}
              </Banner>
            )}
            <DataTable
              caption={t('billing.shift.dep.tab')}
              data={d.items}
              empty={t('billing.shift.dep.none')}
              columns={[
                {
                  id: 'slip',
                  header: t('billing.shift.dep.slip'),
                  cell: ({ row }) => <span className="font-mono">{row.original.slipNo}</span>,
                },
                {
                  id: 'date',
                  header: t('billing.shift.dep.date'),
                  cell: ({ row }) => fmtDate(row.original.date, locale),
                },
                {
                  id: 'cash',
                  header: t('billing.shift.dep.cash'),
                  cell: ({ row }) => <span className="tabular">{inr(row.original.cash)}</span>,
                },
                {
                  id: 'cheques',
                  header: t('billing.shift.dep.cheques'),
                  cell: ({ row }) =>
                    row.original.cheques.length
                      ? `${inr(row.original.chequeTotal)} (${row.original.cheques.length})`
                      : '–',
                },
                {
                  id: 'bank',
                  header: t('billing.shift.dep.bank'),
                  cell: ({ row }) => row.original.bank,
                },
                {
                  id: 'status',
                  header: t('common.status'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={SLIP_TONE[row.original.status]}
                      label={t(`billing.shift.dep.status.${row.original.status}`)}
                    />
                  ),
                },
                edit && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) =>
                    row.original.status === 'DEPOSITED' ? (
                      <span className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await setStatus({
                              id: row.original.id,
                              version: row.original.version,
                              status: 'CREDITED',
                            }).unwrap();
                            toast({
                              tone: 'success',
                              title: t('billing.shift.dep.updated', { no: row.original.slipNo }),
                            });
                          }}
                        >
                          {t('billing.shift.dep.credited')}
                        </Button>
                        {row.original.cheques.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await setStatus({
                                id: row.original.id,
                                version: row.original.version,
                                status: 'CHEQUE_RETURNED',
                              }).unwrap();
                              toast({
                                tone: 'warning',
                                title: t('billing.shift.dep.updated', { no: row.original.slipNo }),
                              });
                            }}
                          >
                            {t('billing.shift.dep.returned')}
                          </Button>
                        )}
                      </span>
                    ) : null,
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}
