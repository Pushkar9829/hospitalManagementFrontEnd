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
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inrExact, paiseFrom } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { useFinAccountsQuery, useFinLedgerQuery, useFinLedgerWriteMutation } from '../api.js';
import { useAccountName } from '../accountName.js';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const STATUS_TONE = { UNMATCHED: 'warning', MATCHED: 'success', IGNORED: 'neutral' };

/** 31/03/2026, 31-03-2026 or 2026-03-31 → 2026-03-31. */
function isoDate(v) {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * A bank statement CSV with a header row: Date, Description (or Narration), Ref (or Cheque),
 * Withdrawal (or Debit), Deposit (or Credit), Balance. Returns { lines, errors }.
 */
function parseStatement(text) {
  const rows = text.split(/\r?\n/).filter((r) => r.trim());
  if (rows.length < 2) return { lines: [], errors: ['empty'] };
  const head = splitCsv(rows[0]).map((h) => h.toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const at = {
    date: col('date'),
    desc: col('description', 'narration', 'particular'),
    ref: col('ref', 'cheque', 'chq'),
    out: col('withdrawal', 'debit'),
    in: col('deposit', 'credit'),
    bal: col('balance'),
  };
  if (at.date < 0 || (at.out < 0 && at.in < 0)) return { lines: [], errors: ['header'] };
  const lines = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    const c = splitCsv(r);
    const date = isoDate(c[at.date] ?? '');
    const money = (k) =>
      at[k] >= 0 && c[at[k]] ? (paiseFrom(c[at[k]].replace(/,/g, '')) ?? 0) : 0;
    const amount = money('in') - money('out');
    if (!date || !amount) {
      errors.push(String(i + 2));
      return;
    }
    const bal = at.bal >= 0 && c[at.bal] ? paiseFrom(c[at.bal].replace(/,/g, '')) : undefined;
    lines.push({
      date,
      description: at.desc >= 0 ? (c[at.desc] ?? '') : '',
      ref: at.ref >= 0 ? (c[at.ref] ?? '') : '',
      amount,
      ...(bal != null ? { balance: bal } : {}),
    });
  });
  return { lines, errors };
}

function ImportCard({ onDone }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [write, state] = useFinLedgerWriteMutation();
  const parsed = text.trim() ? parseStatement(text) : null;
  return (
    <Card title={t('fin.tr.import')} description={t('fin.tr.importHint')}>
      <FormField label={t('fin.tr.csv')}>
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      </FormField>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label={t('fin.tr.file')}
        className="mt-2 text-sm"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setText(await f.text());
        }}
      />
      {parsed?.errors.includes('header') && <Banner tone="warning" title={t('fin.tr.badHeader')} />}
      {parsed && parsed.errors.length > 0 && !parsed.errors.includes('header') && (
        <Banner tone="warning" title={t('fin.tr.badRows', { rows: parsed.errors.join(', ') })} />
      )}
      {state.error && <ApiErrorNotice error={state.error} />}
      <Button
        className="mt-3"
        disabled={!parsed?.lines.length}
        loading={state.isLoading}
        onClick={async () => {
          const r = await write({
            path: 'bank/statement',
            body: { lines: parsed.lines },
          }).unwrap();
          setText('');
          toast({ tone: 'success', title: t('fin.tr.imported', r) });
          onDone?.();
        }}
      >
        {parsed?.lines.length
          ? t('fin.tr.importN', { count: parsed.lines.length })
          : t('fin.tr.importBtn')}
      </Button>
    </Card>
  );
}

function Reconciliation() {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(istToday());
  const q = useFinLedgerQuery({ path: 'bank/reconciliation', params: { asOf } });
  return (
    <Card title={t('fin.tr.brs')} description={t('fin.tr.brsHint')}>
      <FormField label={t('fin.tr.asOf')} className="max-w-xs">
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={4}>
        {(d) => (
          <div className="mt-3 flex flex-col gap-2">
            <table className="w-full max-w-xl text-sm" aria-label={t('fin.tr.brs')}>
              <tbody>
                {[
                  ['bookBalance', d.bookBalance],
                  ['addCheques', d.chequesNotPresented.reduce((s, x) => s + x.amount, 0)],
                  ['lessDeposits', -d.depositsNotCredited.reduce((s, x) => s + x.amount, 0)],
                  ['bankOnly', d.bankOnly.reduce((s, x) => s + x.amount, 0)],
                  ['computed', d.computedBankBalance],
                ].map(([k, v]) => (
                  <tr key={k} className={k === 'computed' ? 'font-semibold' : ''}>
                    <th scope="row" className="py-1 text-left font-normal">
                      {t(`fin.tr.r.${k}`)}
                    </th>
                    <td className="tabular py-1 text-right">{inrExact(v)}</td>
                  </tr>
                ))}
                {d.statementBalance != null && (
                  <tr>
                    <th scope="row" className="py-1 text-left font-normal">
                      {t('fin.tr.r.statement', { date: d.statementBalanceOn })}
                    </th>
                    <td className="tabular py-1 text-right">{inrExact(d.statementBalance)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {d.difference === 0 && <Banner tone="success" title={t('fin.tr.agrees')} />}
            {d.difference != null && d.difference !== 0 && (
              <Banner
                tone="critical"
                title={t('fin.tr.differs', { amount: inrExact(d.difference) })}
              />
            )}
            {d.chequesNotPresented.length > 0 && (
              <p className="text-sm text-muted">
                {t('fin.tr.chequesList')}{' '}
                {d.chequesNotPresented
                  .map((x) => `${x.voucherNo} (${inrExact(x.amount)})`)
                  .join(', ')}
              </p>
            )}
          </div>
        )}
      </QueryView>
    </Card>
  );
}

/** Bank reconciliation: import the statement, match, book the bank's own entries, reconcile. */
export function BankRecTab() {
  const acctName = useAccountName();
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('finance:bank:create');
  const [status, setStatus] = useState('UNMATCHED');
  const q = useFinLedgerQuery({ path: 'bank/statement', params: { status: status || undefined } });
  const accounts = useFinAccountsQuery();
  const [write, state] = useFinLedgerWriteMutation();
  const [booking, setBooking] = useState(null);
  const [ignoring, setIgnoring] = useState(null);
  const act = async (line, path, body, done) => {
    await write({
      path: `bank/statement/${line.id}/${path}`,
      body: { version: line.version, ...body },
    }).unwrap();
    toast({ tone: 'success', title: t(done) });
  };
  return (
    <div className="flex flex-col gap-4">
      {edit && <ImportCard />}
      <Card title={t('fin.tr.lines')}>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <FormField label={t('common.status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('fin.tr.all')}</option>
              {['UNMATCHED', 'MATCHED', 'IGNORED'].map((s) => (
                <option key={s} value={s}>
                  {t(`fin.tr.status.${s}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {edit && (
            <Button
              variant="secondary"
              onClick={async () => {
                const r = await write({ path: 'bank/auto-match', body: {} }).unwrap();
                toast({ tone: 'success', title: t('fin.tr.autoDone', r) });
              }}
            >
              {t('fin.tr.auto')}
            </Button>
          )}
        </div>
        {state.error && <ApiErrorNotice error={state.error} />}
        <QueryView query={q} rows={5}>
          {(d) => (
            <DataTable
              caption={t('fin.tr.lines')}
              data={d.items}
              empty={t('fin.tr.none')}
              columns={[
                { id: 'date', header: t('fin.tr.date'), cell: ({ row }) => row.original.date },
                {
                  id: 'desc',
                  header: t('fin.tr.description'),
                  cell: ({ row }) => (
                    <span>
                      {row.original.description}{' '}
                      <span className="font-mono text-sm text-muted">{row.original.ref}</span>
                    </span>
                  ),
                },
                {
                  id: 'amount',
                  header: t('fin.tr.amount'),
                  cell: ({ row }) => (
                    <span className="tabular">{inrExact(row.original.amount)}</span>
                  ),
                },
                {
                  id: 'status',
                  header: t('common.status'),
                  cell: ({ row }) => (
                    <span className="flex flex-col gap-1">
                      <StatusBadge
                        tone={STATUS_TONE[row.original.status]}
                        label={t(`fin.tr.status.${row.original.status}`)}
                      />
                      {row.original.voucherNo && (
                        <span className="font-mono text-xs">{row.original.voucherNo}</span>
                      )}
                      {row.original.note && <span className="text-xs">{row.original.note}</span>}
                    </span>
                  ),
                },
                edit && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) => {
                    const l = row.original;
                    if (l.status !== 'UNMATCHED')
                      return (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(l, 'unmatch', {}, 'fin.tr.unmatched')}
                        >
                          {t('fin.tr.unmatch')}
                        </Button>
                      );
                    return (
                      <span className="flex flex-wrap gap-2">
                        {l.candidates?.length > 0 && (
                          <Select
                            aria-label={t('fin.tr.matchTo', { date: l.date })}
                            value=""
                            onChange={(e) =>
                              e.target.value &&
                              act(l, 'match', { journalId: e.target.value }, 'fin.tr.matched')
                            }
                          >
                            <option value="">{t('fin.tr.matchPick')}</option>
                            {l.candidates.map((b) => (
                              <option key={b.journalId} value={b.journalId}>
                                {`${b.date} · ${b.voucherNo} · ${inrExact(b.amount)} · ${b.narration}`}
                              </option>
                            ))}
                          </Select>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setBooking(l)}>
                          {t('fin.tr.book')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIgnoring(l)}>
                          {t('fin.tr.ignore')}
                        </Button>
                      </span>
                    );
                  },
                },
              ].filter(Boolean)}
            />
          )}
        </QueryView>
      </Card>
      <Reconciliation />
      <FormDialog
        open={Boolean(booking)}
        onOpenChange={(o) => !o && setBooking(null)}
        title={booking ? t('fin.tr.bookTitle', { amount: inrExact(booking.amount) }) : ''}
        schema={z.object({
          accountId: z.string().min(1, t('fin.tr.pickAccount')),
          narration: z.string().trim().min(3).max(200),
        })}
        defaultValues={{ accountId: '', narration: booking?.description ?? '' }}
        fields={[
          {
            name: 'accountId',
            label: t('fin.tr.account'),
            type: 'select',
            required: true,
            options: (accounts.data?.items ?? [])
              .filter((a) => a.isActive && a.key !== 'BANK')
              .map((a) => ({ value: a.id, label: `${a.code} ${acctName(a.code, a.name)}` })),
          },
          { name: 'narration', label: t('fin.tr.narration'), required: true },
        ]}
        submitLabel={t('fin.tr.book')}
        onSubmit={(v) =>
          write({
            path: `bank/statement/${booking.id}/book`,
            body: { version: booking.version, ...v },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.tr.booked') })}
      />
      <FormDialog
        open={Boolean(ignoring)}
        onOpenChange={(o) => !o && setIgnoring(null)}
        title={t('fin.tr.ignoreTitle')}
        schema={z.object({ note: z.string().trim().min(3).max(200) })}
        defaultValues={{ note: '' }}
        fields={[{ name: 'note', label: t('fin.tr.reason'), type: 'textarea', required: true }]}
        submitLabel={t('fin.tr.ignore')}
        onSubmit={(v) =>
          write({
            path: `bank/statement/${ignoring.id}/ignore`,
            body: { version: ignoring.version, ...v },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.tr.ignored') })}
      />
    </div>
  );
}

// ---------------------------------------------------------------- fixed assets

const lastMonth = () => {
  const d = new Date(Date.now() + 330 * 60_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const fyNow = () => {
  const [y, m] = istToday().split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

function DepreciationCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [month, setMonth] = useState(lastMonth());
  const preview = useFinLedgerQuery({ path: 'assets/depreciation/preview', params: { month } });
  const runs = useFinLedgerQuery({ path: 'assets/depreciation' });
  const [write, state] = useFinLedgerWriteMutation();
  return (
    <Card title={t('fin.fa.dep')} description={t('fin.fa.depHint')}>
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('fin.fa.month')}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </FormField>
        {preview.data && (
          <p className="text-sm">
            {preview.data.done
              ? t('fin.fa.done')
              : t('fin.fa.willCharge', {
                  amount: inrExact(preview.data.total),
                  count: preview.data.lines.length,
                })}
          </p>
        )}
        {can('finance:asset:create') && (
          <Button
            disabled={!preview.data || preview.data.done}
            loading={state.isLoading}
            onClick={async () => {
              const r = await write({ path: 'assets/depreciation', body: { month } }).unwrap();
              toast({ tone: 'success', title: t('fin.fa.charged', { amount: inrExact(r.total) }) });
            }}
          >
            {t('fin.fa.run')}
          </Button>
        )}
      </div>
      {state.error && <ApiErrorNotice error={state.error} />}
      <QueryView query={runs} rows={2}>
        {(d) =>
          d.items.length ? (
            <ul className="mt-3 text-sm">
              {d.items.map((r) => (
                <li key={r.id}>
                  {t('fin.fa.runLine', {
                    month: r.month,
                    amount: inrExact(r.total),
                    count: r.assets,
                  })}
                </li>
              ))}
            </ul>
          ) : null
        }
      </QueryView>
    </Card>
  );
}

function ScheduleCard() {
  const { t } = useTranslation();
  const [fy, setFy] = useState(fyNow());
  const valid = /^\d{4}-\d{2}$/.test(fy);
  const q = useFinLedgerQuery({ path: 'assets/schedule', params: { fy } }, { skip: !valid });
  const cols = [
    'openingGross',
    'additions',
    'disposals',
    'closingGross',
    'forYear',
    'closingDep',
    'netBlock',
  ];
  return (
    <Card title={t('fin.fa.schedule')}>
      <FormField label={t('fin.fa.fy')} className="max-w-xs">
        <Input value={fy} onChange={(e) => setFy(e.target.value.trim())} />
      </FormField>
      {valid && (
        <QueryView query={q} rows={3}>
          {(d) => (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <caption className="sr-only">{t('fin.fa.schedule')}</caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="p-2">{t('fin.fa.block')}</th>
                    {cols.map((k) => (
                      <th key={k} className="p-2 text-right">
                        {t(`fin.fa.s.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...d.items, { block: 'TOTAL', name: t('fin.fa.total'), ...d.totals }].map(
                    (r) => (
                      <tr key={r.block} className={r.block === 'TOTAL' ? 'font-semibold' : ''}>
                        <td className="p-2">{r.name}</td>
                        {cols.map((k) => (
                          <td key={k} className="tabular p-2 text-right">
                            {inrExact(r[k])}
                          </td>
                        ))}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </QueryView>
      )}
    </Card>
  );
}

/** Fixed asset register, monthly depreciation, disposal and the schedule for the year. */
export function AssetsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const q = useFinLedgerQuery({ path: 'assets' });
  const equipment = useFinLedgerQuery({ path: 'assets/equipment' });
  const [write] = useFinLedgerWriteMutation();
  const [adding, setAdding] = useState(false);
  const [disposing, setDisposing] = useState(null);
  const [pending, setPending] = useState(null);
  const blocks = q.data?.blocks ?? [];
  return (
    <div className="flex flex-col gap-4">
      <QueryView query={q} rows={5}>
        {(d) => (
          <>
            <KpiRow
              items={[
                { label: t('fin.fa.cost'), value: inrExact(d.totals.cost) },
                { label: t('fin.fa.accumulated'), value: inrExact(d.totals.accumulated) },
                { label: t('fin.fa.bookValue'), value: inrExact(d.totals.bookValue) },
              ]}
            />
            {can('finance:asset:create') && (
              <div>
                <Button onClick={() => setAdding(true)}>{t('fin.fa.add')}</Button>
              </div>
            )}
            {pending && <PendingApprovalNotice approvalId={pending} />}
            <DataTable
              caption={t('fin.fa.register')}
              data={d.items}
              empty={t('fin.fa.none')}
              columns={[
                {
                  id: 'asset',
                  header: t('fin.fa.asset'),
                  cell: ({ row }) => (
                    <span>
                      {row.original.name}{' '}
                      <span className="font-mono text-sm text-muted">{row.original.code}</span>
                    </span>
                  ),
                },
                {
                  id: 'block',
                  header: t('fin.fa.block'),
                  cell: ({ row }) => row.original.blockName,
                },
                {
                  id: 'method',
                  header: t('fin.fa.method'),
                  cell: ({ row }) =>
                    row.original.method === 'SLM'
                      ? t('fin.fa.slm', { years: row.original.usefulLifeYears })
                      : t('fin.fa.wdv', { rate: row.original.wdvRate }),
                },
                {
                  id: 'cost',
                  header: t('fin.fa.cost'),
                  cell: ({ row }) => inrExact(row.original.cost),
                },
                {
                  id: 'acc',
                  header: t('fin.fa.accumulated'),
                  cell: ({ row }) => inrExact(row.original.accumulated),
                },
                {
                  id: 'bv',
                  header: t('fin.fa.bookValue'),
                  cell: ({ row }) => inrExact(row.original.bookValue),
                },
                {
                  id: 'status',
                  header: t('common.status'),
                  cell: ({ row }) =>
                    row.original.status === 'ACTIVE' ? (
                      <StatusBadge tone="success" label={t('fin.fa.active')} />
                    ) : (
                      <StatusBadge
                        tone="neutral"
                        label={t('fin.fa.disposed', { date: row.original.disposal?.on })}
                      />
                    ),
                },
                can('finance:asset:update') && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) =>
                    row.original.status === 'ACTIVE' ? (
                      <Button size="sm" variant="ghost" onClick={() => setDisposing(row.original)}>
                        {t('fin.fa.dispose')}
                      </Button>
                    ) : null,
                },
              ].filter(Boolean)}
            />
          </>
        )}
      </QueryView>
      <DepreciationCard />
      <ScheduleCard />
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('fin.fa.add')}
        schema={z.object({
          equipmentId: z.string().optional(),
          code: z.string().trim().min(2).max(20),
          name: z.string().trim().min(2).max(120),
          block: z.string().min(1),
          putToUseOn: z.string().min(10),
          cost: z.string().refine((v) => (paiseFrom(v) ?? 0) >= 100, t('fin.fa.costRule')),
          method: z.enum(['SLM', 'WDV']),
          fundedFrom: z.enum(['BANK', 'EXISTING']),
        })}
        defaultValues={{
          equipmentId: '',
          code: '',
          name: '',
          block: 'MEDICAL_EQUIPMENT',
          putToUseOn: istToday(),
          cost: '',
          method: 'SLM',
          fundedFrom: 'BANK',
        }}
        fields={[
          {
            name: 'equipmentId',
            label: t('fin.fa.fromEquipment'),
            type: 'select',
            options: [
              { value: '', label: t('fin.fa.noEquipment') },
              ...(equipment.data?.items ?? []).map((e) => ({
                value: e.id,
                label: `${e.code} ${e.name}`,
              })),
            ],
          },
          { name: 'code', label: t('fin.fa.code'), required: true },
          { name: 'name', label: t('fin.fa.asset'), required: true },
          {
            name: 'block',
            label: t('fin.fa.block'),
            type: 'select',
            required: true,
            options: blocks.map((b) => ({
              value: b.code,
              label: t('fin.fa.blockOption', { name: b.name, life: b.life, wdv: b.wdv }),
            })),
          },
          { name: 'putToUseOn', label: t('fin.fa.putToUse'), type: 'date', required: true },
          { name: 'cost', label: t('fin.fa.costRs'), required: true },
          {
            name: 'method',
            label: t('fin.fa.method'),
            type: 'select',
            options: [
              { value: 'SLM', label: t('fin.fa.slmName') },
              { value: 'WDV', label: t('fin.fa.wdvName') },
            ],
          },
          {
            name: 'fundedFrom',
            label: t('fin.fa.funded'),
            type: 'select',
            options: [
              { value: 'BANK', label: t('fin.fa.fundBank') },
              { value: 'EXISTING', label: t('fin.fa.fundExisting') },
            ],
          },
        ]}
        submitLabel={t('fin.fa.add')}
        onSubmit={(v) =>
          write({
            path: 'assets',
            body: {
              ...v,
              equipmentId: v.equipmentId || undefined,
              cost: paiseFrom(v.cost),
            },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('fin.fa.added') })}
      />
      <FormDialog
        open={Boolean(disposing)}
        onOpenChange={(o) => !o && setDisposing(null)}
        title={disposing ? t('fin.fa.disposeTitle', { name: disposing.name }) : ''}
        destructive
        schema={z.object({
          on: z.string().min(10),
          proceeds: z.string().refine((v) => paiseFrom(v || '0') != null, t('fin.fa.costRule')),
          reason: z.string().trim().min(3).max(200),
        })}
        defaultValues={{ on: istToday(), proceeds: '0', reason: '' }}
        fields={[
          { name: 'on', label: t('fin.fa.disposedOn'), type: 'date', required: true },
          { name: 'proceeds', label: t('fin.fa.proceeds'), required: true },
          { name: 'reason', label: t('fin.tr.reason'), type: 'textarea', required: true },
        ]}
        submitLabel={t('fin.fa.dispose')}
        onSubmit={async (v) => {
          const r = await write({
            path: `assets/${disposing.id}/dispose`,
            body: { version: disposing.version, ...v, proceeds: paiseFrom(v.proceeds || '0') },
          }).unwrap();
          if (r.approvalId) setPending(r.approvalId);
          return r;
        }}
        onDone={() => toast({ tone: 'success', title: t('fin.fa.disposeSent') })}
      />
    </div>
  );
}
