import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addPeopleStrings } from '@hms/i18n/people';
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
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inr, paiseFrom, rupeesText } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import {
  RUN_TONE,
  downloadText,
  monthsIST,
  useCalculateRunMutation,
  useCreateRunMutation,
  useLazyBankFileQuery,
  usePayRunQuery,
  usePayRunsQuery,
  usePaySettingsQuery,
  usePfEcrQuery,
  useRunPayslipsQuery,
  useSavePaySettingsMutation,
  useSetRunInputsMutation,
  useSubmitRunMutation,
} from '../../hr/api.js';
import { Payslip } from '../components/Payslip.jsx';
import { DeclarationsTab } from '../components/Declarations.jsx';

const EDITABLE = ['DRAFT', 'CALCULATED', 'RETURNED'];

/** Per-employee variable pay for the month: overtime hours, incentive, other deduction. */
function Inputs({ run, slips }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      run.inputs.map((i) => [
        i.employeeId,
        {
          overtimeHours: i.overtimeHours ?? '',
          incentive: rupeesText(i.incentive),
          otherDeduction: rupeesText(i.otherDeduction),
        },
      ]),
    ),
  );
  const [setInputs, state] = useSetRunInputsMutation();
  const [failure, setFailure] = useState(null);
  const set = (id, k, v) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
  return (
    <Card title={t('pay.inputs.title')} description={t('pay.inputs.hint')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">{t('pay.inputs.title')}</caption>
          <thead className="text-left text-muted">
            <tr>
              {['name', 'ot', 'incentive', 'other'].map((k) => (
                <th key={k} className="px-2 py-1 font-semibold">
                  {t(`pay.inputs.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slips.map((p) => (
              <tr key={p.employeeId}>
                <td className="px-2 py-1">{p.name}</td>
                {[
                  ['overtimeHours', 'numeric'],
                  ['incentive', 'decimal'],
                  ['otherDeduction', 'decimal'],
                ].map(([k, mode]) => (
                  <td key={k} className="px-2 py-1">
                    <Input
                      aria-label={`${p.name} ${t(`pay.inputs.${k}`)}`}
                      inputMode={mode}
                      className="w-28"
                      value={rows[p.employeeId]?.[k] ?? ''}
                      onChange={(e) => set(p.employeeId, k, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        className="mt-3"
        variant="secondary"
        loading={state.isLoading}
        onClick={async () => {
          setFailure(null);
          try {
            await setInputs({
              id: run.id,
              inputs: Object.entries(rows)
                .map(([employeeId, r]) => ({
                  employeeId,
                  overtimeHours: r.overtimeHours === '' ? undefined : Number(r.overtimeHours),
                  incentive: paiseFrom(r.incentive) ?? undefined,
                  otherDeduction: paiseFrom(r.otherDeduction) ?? undefined,
                }))
                .filter((r) => r.overtimeHours != null || r.incentive || r.otherDeduction),
            }).unwrap();
            toast({ tone: 'success', title: t('pay.inputs.saved') });
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {t('pay.inputs.save')}
      </Button>
    </Card>
  );
}

function Slips({ run }) {
  const { t } = useTranslation();
  const q = useRunPayslipsQuery(run.id);
  const [open, setOpen] = useState('');
  return (
    <QueryView
      query={q}
      rows={5}
      empty={<EmptyState bordered={false} title={t('pay.slips.none')} />}
      isEmpty={(d) => !d.items.length}
    >
      {(d) => (
        <div className="flex flex-col gap-3">
          {EDITABLE.includes(run.status) && <Inputs run={run} slips={d.items} />}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t('pay.slips.title')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['name', 'days', 'gross', 'deductions', 'net', 'change'].map((k) => (
                    <th
                      key={k}
                      className={`px-3 py-2 font-semibold ${k === 'name' ? '' : 'text-right'}`}
                    >
                      {t(`pay.slips.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-semibold underline-offset-2 hover:underline"
                        aria-expanded={open === p.id}
                        onClick={() => setOpen(open === p.id ? '' : p.id)}
                      >
                        {p.name}
                      </button>
                      <span className="block text-muted">
                        {[p.empNo, p.designation].filter(Boolean).join(' · ')}
                      </span>
                      {open === p.id && <Payslip slip={p} className="mt-2" />}
                    </td>
                    <td className="tabular px-3 py-2 text-right">
                      {p.payableDays}/{p.days}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{inr(p.gross)}</td>
                    <td className="tabular px-3 py-2 text-right">{inr(p.totalDeductions)}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold">{inr(p.net)}</td>
                    <td
                      className={`tabular px-3 py-2 text-right ${Math.abs(p.variancePct ?? 0) >= 10 ? 'font-semibold text-warning' : 'text-muted'}`}
                    >
                      {p.variancePct == null
                        ? '–'
                        : `${p.variancePct > 0 ? '+' : ''}${p.variancePct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </QueryView>
  );
}

function Ecr({ id }) {
  const { t } = useTranslation();
  const q = usePfEcrQuery(id);
  return (
    <Card title={t('pay.ecr.title')}>
      <QueryView query={q} rows={2} empty={t('pay.ecr.none')} isEmpty={(d) => !d.items.length}>
        {(d) => (
          <table className="w-full text-sm">
            <caption className="sr-only">{t('pay.ecr.title')}</caption>
            <thead className="text-left text-muted">
              <tr>
                {['uan', 'name', 'epfWage', 'employee', 'employer'].map((k) => (
                  <th key={k} className="px-2 py-1 font-semibold">
                    {t(`pay.ecr.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.items.map((r) => (
                <tr key={`${r.uan}${r.name}`}>
                  <td className="px-2 py-1 font-mono">{r.uan ?? '–'}</td>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="tabular px-2 py-1">{inr(r.epfWage * 100)}</td>
                  <td className="tabular px-2 py-1">{inr(r.employee * 100)}</td>
                  <td className="tabular px-2 py-1">{inr(r.employer * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
    </Card>
  );
}

function RunDetail({ id }) {
  const { t } = useTranslation();
  const can = useCan();
  const q = usePayRunQuery(id);
  const [calculate, calc] = useCalculateRunMutation();
  const [submit, sub] = useSubmitRunMutation();
  const [getBank, bank] = useLazyBankFileQuery();
  const [failure, setFailure] = useState(null);
  const [pending, setPending] = useState(null);
  const r = q.data;
  if (!r) return <QueryView query={q} rows={4} />;
  const tt = r.totals;
  const write = can('payroll:run:create');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t('pay.run.title', { month: r.month })}</h2>
        <StatusBadge tone={RUN_TONE[r.status]} label={t(`pay.status.${r.status}`)} />
        <div className="ml-auto flex flex-wrap gap-2">
          {write && EDITABLE.includes(r.status) && (
            <Button
              variant="secondary"
              loading={calc.isLoading}
              onClick={async () => {
                setFailure(null);
                try {
                  await calculate(r.id).unwrap();
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('pay.run.calculate')}
            </Button>
          )}
          {write && r.status === 'CALCULATED' && (
            <Button
              loading={sub.isLoading}
              onClick={async () => {
                setFailure(null);
                try {
                  const out = await submit(r.id).unwrap();
                  setPending(out.approvalId);
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('pay.run.submit')}
            </Button>
          )}
          {r.status === 'LOCKED' && (
            <Button
              variant="secondary"
              loading={bank.isFetching}
              onClick={async () => {
                setFailure(null);
                try {
                  const f = await getBank(r.id).unwrap();
                  downloadText(`salary-${r.month}.csv`, f.csv);
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('pay.run.bankFile')}
            </Button>
          )}
        </div>
      </div>
      {(pending || r.status === 'SUBMITTED') && (
        <PendingApprovalNotice
          approvalId={pending ?? r.approvalId}
          approver={t('pay.run.approver')}
        />
      )}
      {r.status === 'RETURNED' && r.returnedReason && (
        <Banner tone="critical">{t('pay.run.returned', { reason: r.returnedReason })}</Banner>
      )}
      {failure && <ApiErrorNotice error={failure} />}
      {tt && (
        <KpiRow
          items={[
            { label: t('pay.kpi.employees'), value: String(tt.employees) },
            { label: t('pay.kpi.gross'), value: inr(tt.gross) },
            { label: t('pay.kpi.deductions'), value: inr(tt.deductions) },
            { label: t('pay.kpi.net'), value: inr(tt.net) },
            {
              label: t('pay.kpi.employer'),
              value: inr((tt.pfEmployer ?? 0) + (tt.esiEmployer ?? 0)),
            },
          ]}
        />
      )}
      {r.status === 'DRAFT' && !tt && <Banner tone="info">{t('pay.run.draftHint')}</Banner>}
      <Slips run={r} />
      {r.status === 'LOCKED' && <Ecr id={r.id} />}
    </div>
  );
}

function RunsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const runs = usePayRunsQuery();
  const [id, setId] = useUrlState('run', '');
  const [month, setMonth] = useState(monthsIST().previous);
  const [create, state] = useCreateRunMutation();
  const [failure, setFailure] = useState(null);
  const current = id || runs.data?.items[0]?.id;
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-3">
        {can('payroll:run:create') && (
          <Card title={t('pay.new.title')}>
            {failure && <ApiErrorNotice error={failure} />}
            <div className="flex items-end gap-2">
              <FormField label={t('pay.new.month')} className="flex-1">
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </FormField>
              <Button
                loading={state.isLoading}
                onClick={async () => {
                  setFailure(null);
                  try {
                    const r = await create({ month }).unwrap();
                    setId(r.id);
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('pay.new.start')}
              </Button>
            </div>
          </Card>
        )}
        <QueryView
          query={runs}
          rows={4}
          empty={t('pay.runs.none')}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <ul className="flex flex-col gap-1" aria-label={t('pay.runs.title')}>
              {d.items.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-current={r.id === current}
                    onClick={() => setId(r.id)}
                    className={`flex w-full items-center justify-between rounded-control px-3 py-2 text-left text-sm ${r.id === current ? 'bg-info-bg font-semibold' : 'hover:bg-surface-2'}`}
                  >
                    <span>{r.month}</span>
                    <StatusBadge tone={RUN_TONE[r.status]} label={t(`pay.status.${r.status}`)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
      {current ? (
        <RunDetail key={current} id={current} />
      ) : (
        <EmptyState title={t('pay.runs.none')} description={t('pay.runs.hint')} />
      )}
    </div>
  );
}

function SettingsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const q = usePaySettingsQuery();
  const [save, state] = useSavePaySettingsMutation();
  const [f, setF] = useState(null);
  const [failure, setFailure] = useState(null);
  if (!q.data) return <QueryView query={q} rows={3} />;
  const s = q.data;
  const v = f ?? {
    pfEmployee: String(s.pf.employeeRate),
    pfEmployer: String(s.pf.employerRate),
    pfCeiling: rupeesText(s.pf.wageCeiling),
    esiEmployee: String(s.esi.employeeRate),
    esiEmployer: String(s.esi.employerRate),
    esiLimit: rupeesText(s.esi.wageLimit),
    ot: String(s.overtimeMultiplier),
    night: rupeesText(s.nightAllowance),
  };
  const field = (k) => (
    <FormField key={k} label={t(`pay.set.${k}`)}>
      <Input
        inputMode="decimal"
        value={v[k]}
        disabled={!can('payroll:settings:update')}
        onChange={(e) => setF({ ...v, [k]: e.target.value })}
      />
    </FormField>
  );
  return (
    <Card title={t('pay.set.title')} description={t('pay.set.hint')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          'pfEmployee',
          'pfEmployer',
          'pfCeiling',
          'esiEmployee',
          'esiEmployer',
          'esiLimit',
          'ot',
          'night',
        ].map(field)}
      </div>
      {can('payroll:settings:update') && (
        <Button
          className="mt-3"
          loading={state.isLoading}
          disabled={!f}
          onClick={async () => {
            setFailure(null);
            try {
              await save({
                pf: {
                  employeeRate: Number(v.pfEmployee),
                  employerRate: Number(v.pfEmployer),
                  wageCeiling: paiseFrom(v.pfCeiling),
                },
                esi: {
                  employeeRate: Number(v.esiEmployee),
                  employerRate: Number(v.esiEmployer),
                  wageLimit: paiseFrom(v.esiLimit),
                },
                overtimeMultiplier: Number(v.ot),
                nightAllowance: paiseFrom(v.night),
              }).unwrap();
              setF(null);
              toast({ tone: 'success', title: t('pay.set.saved') });
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t('pay.set.save')}
        </Button>
      )}
    </Card>
  );
}

/**
 * Payroll (board Payroll, route /payroll): a month's run from locked attendance and approved
 * salary structures, variable inputs, payslips with the change from last month, release through
 * HR then Finance, the bank transfer file and PF ECR; statutory settings.
 */
export default function PayrollPage() {
  useStrings(addDxkitStrings, addPeopleStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('hr.crumb') }, { label: t('pay.title') }]}
        title={t('pay.title')}
        description={t('pay.description')}
      />
      <UrlTabs
        param="tab"
        label={t('pay.tabsLabel')}
        reset={['run']}
        tabs={[
          { id: 'runs', label: t('pay.tabs.runs'), body: <RunsTab /> },
          { id: 'declarations', label: t('pay.decl.tab'), body: <DeclarationsTab /> },
          { id: 'settings', label: t('pay.tabs.settings'), body: <SettingsTab /> },
        ]}
      />
    </Page>
  );
}
