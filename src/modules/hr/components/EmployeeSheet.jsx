import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, FormField, Input, Select, Sheet, StatusBadge, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inr, paiseFrom } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import {
  monthsIST,
  todayIST,
  useCreateLoanMutation,
  useEmployeeBalancesQuery,
  useEmployeeQuery,
  useExitEmployeeMutation,
  useLoansQuery,
  useProposeStructureMutation,
  useStructuresQuery,
} from '../api.js';

const HEADS = ['basic', 'da', 'hra', 'conveyance', 'special'];

function Balances({ id }) {
  const { t } = useTranslation();
  const q = useEmployeeBalancesQuery(id);
  return (
    <Card title={t('hr.bal.title')}>
      <QueryView query={q} rows={2}>
        {(d) => (
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {d.items
              .filter((b) => b.code !== 'LOP')
              .map((b) => (
                <li key={b.code} className="rounded-control border border-line px-3 py-2">
                  <p className="text-muted">{b.name}</p>
                  <p className="tabular text-lg font-semibold">{b.available}</p>
                  <p className="text-xs text-muted">{t('hr.bal.used', { used: b.used })}</p>
                </li>
              ))}
          </ul>
        )}
      </QueryView>
    </Card>
  );
}

function Salary({ id }) {
  const { t } = useTranslation();
  const can = useCan();
  const q = useStructuresQuery(id);
  const [propose, state] = useProposeStructureMutation();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    effectiveFrom: monthsIST().current,
    basic: '',
    da: '',
    hra: '',
    conveyance: '',
    special: '',
    tdsRegime: 'NEW',
    reason: '',
  });
  const [failure, setFailure] = useState(null);
  const [pending, setPending] = useState(null);
  const canPropose = can('payroll:structure:create') || can('hr:employee:update');
  return (
    <Card
      title={t('hr.sal.title')}
      actions={
        canPropose && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
            {t('hr.sal.revise')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {pending && <PendingApprovalNotice approvalId={pending} approver={t('hr.sal.approver')} />}
        {failure && <ApiErrorNotice error={failure} />}
        {open && (
          <div className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-3">
            <FormField label={t('hr.sal.from')}>
              <Input
                type="month"
                value={f.effectiveFrom}
                onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })}
              />
            </FormField>
            {HEADS.map((h) => (
              <FormField key={h} label={t(`hr.sal.${h}`)}>
                <Input
                  inputMode="decimal"
                  value={f[h]}
                  onChange={(e) => setF({ ...f, [h]: e.target.value })}
                />
              </FormField>
            ))}
            <FormField label={t('hr.sal.regime')}>
              <Select
                value={f.tdsRegime}
                onChange={(e) => setF({ ...f, tdsRegime: e.target.value })}
                options={['NEW', 'OLD'].map((r) => ({ value: r, label: t(`hr.sal.regimes.${r}`) }))}
              />
            </FormField>
            <FormField label={t('hr.sal.reason')} className="sm:col-span-2">
              <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            </FormField>
            <Button
              className="self-end"
              loading={state.isLoading}
              disabled={!paiseFrom(f.basic)}
              onClick={async () => {
                setFailure(null);
                try {
                  const out = await propose({
                    id,
                    effectiveFrom: f.effectiveFrom,
                    ...Object.fromEntries(HEADS.map((h) => [h, paiseFrom(f[h]) ?? 0])),
                    tdsRegime: f.tdsRegime,
                    reason: f.reason.trim() || undefined,
                  }).unwrap();
                  setPending(out.approvalId);
                  setOpen(false);
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('hr.sal.submit')}
            </Button>
          </div>
        )}
        <QueryView query={q} rows={2} empty={t('hr.sal.none')} isEmpty={(d) => !d.items.length}>
          {(d) => (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {d.items.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-mono">{s.effectiveFrom}</span>
                  <span className="tabular font-semibold">
                    {t('hr.sal.monthly', { amount: inr(s.monthlyGross) })}
                  </span>
                  <span className="text-muted">
                    {HEADS.filter((h) => s[h])
                      .map((h) => `${t(`hr.sal.${h}`)} ${inr(s[h])}`)
                      .join(' · ')}
                  </span>
                  <StatusBadge
                    className="ml-auto"
                    tone={
                      s.status === 'ACTIVE'
                        ? 'success'
                        : s.status === 'REJECTED'
                          ? 'critical'
                          : 'warning'
                    }
                    label={t(`hr.sal.status.${s.status}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
    </Card>
  );
}

function Loans({ id }) {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const q = useLoansQuery(id);
  const [create, state] = useCreateLoanMutation();
  const [f, setF] = useState({
    kind: 'LOAN',
    amount: '',
    emi: '',
    startMonth: monthsIST().current,
  });
  const [failure, setFailure] = useState(null);
  return (
    <Card title={t('hr.loan.title')}>
      <div className="flex flex-col gap-3">
        {failure && <ApiErrorNotice error={failure} />}
        <QueryView query={q} rows={1} empty={t('hr.loan.none')} isEmpty={(d) => !d.items.length}>
          {(d) => (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {d.items.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-3 py-2">
                  <span>{t(`hr.loan.kind.${l.kind}`)}</span>
                  <span className="tabular">{inr(l.amount)}</span>
                  <span className="text-muted">
                    {t('hr.loan.line', { emi: inr(l.emi), from: l.startMonth })}
                  </span>
                  <span className="tabular ml-auto font-semibold">
                    {t('hr.loan.balance', { amount: inr(l.balance) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
        {can('payroll:loan:create') && (
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('hr.loan.kindLabel')} className="w-36">
              <Select
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value })}
                options={['LOAN', 'ADVANCE'].map((k) => ({
                  value: k,
                  label: t(`hr.loan.kind.${k}`),
                }))}
              />
            </FormField>
            <FormField label={t('hr.loan.amount')} className="w-32">
              <Input
                inputMode="decimal"
                value={f.amount}
                onChange={(e) => setF({ ...f, amount: e.target.value })}
              />
            </FormField>
            <FormField label={t('hr.loan.emi')} className="w-32">
              <Input
                inputMode="decimal"
                value={f.emi}
                onChange={(e) => setF({ ...f, emi: e.target.value })}
              />
            </FormField>
            <FormField label={t('hr.loan.start')} className="w-40">
              <Input
                type="month"
                value={f.startMonth}
                onChange={(e) => setF({ ...f, startMonth: e.target.value })}
              />
            </FormField>
            <Button
              loading={state.isLoading}
              disabled={!paiseFrom(f.amount) || !paiseFrom(f.emi)}
              onClick={async () => {
                setFailure(null);
                try {
                  await create({
                    id,
                    kind: f.kind,
                    amount: paiseFrom(f.amount),
                    emi: paiseFrom(f.emi),
                    startMonth: f.startMonth,
                  }).unwrap();
                  toast({ tone: 'success', title: t('hr.loan.added') });
                  setF({ ...f, amount: '', emi: '' });
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('hr.loan.add')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Exit({ e }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ exitOn: todayIST(), reason: '' });
  const [exit, state] = useExitEmployeeMutation();
  const [failure, setFailure] = useState(null);
  return (
    <Card title={t('hr.exit.title')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('hr.exit.on')} className="w-44">
          <Input
            type="date"
            value={f.exitOn}
            onChange={(ev) => setF({ ...f, exitOn: ev.target.value })}
          />
        </FormField>
        <FormField label={t('hr.exit.reason')} className="min-w-56 flex-1">
          <Input value={f.reason} onChange={(ev) => setF({ ...f, reason: ev.target.value })} />
        </FormField>
        <Button
          variant="danger"
          loading={state.isLoading}
          disabled={f.reason.trim().length < 3}
          onClick={async () => {
            setFailure(null);
            try {
              await exit({ id: e.id, ...f, reason: f.reason.trim() }).unwrap();
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t('hr.exit.record')}
        </Button>
      </div>
    </Card>
  );
}

/** One employee: profile, leave balances, salary structure and loans, and exit. */
export function EmployeeSheet({ id, onClose }) {
  const { t } = useTranslation();
  const can = useCan();
  const q = useEmployeeQuery(id);
  const e = q.data;
  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={e ? `${e.name} · ${e.empNo}` : t('hr.emp.loading')}
      description={e ? [e.designation, e.department].filter(Boolean).join(' · ') : undefined}
    >
      <QueryView query={q} rows={4}>
        {(emp) => (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {[
                ['joined', fmtDate(emp.joinedOn)],
                ['type', t(`hr.empType.${emp.type}`)],
                ['status', t(`hr.empStatus.${emp.status}`)],
                ['mobile', emp.mobile],
                ['pan', emp.pan],
                ['uan', emp.uan],
                ['bank', emp.bank && `${emp.bank.name} · ${emp.bank.accountNo}`],
                [
                  'registration',
                  emp.registration &&
                    `${emp.registration.council} ${emp.registration.number} · ${fmtDate(emp.registration.expiresOn)}`,
                ],
                ['exitOn', emp.exitOn && fmtDate(emp.exitOn)],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted">{t(`hr.field.${k}`)}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
            </dl>
            <Balances id={id} />
            {(can('payroll:structure:read') || can('hr:employee:read')) && <Salary id={id} />}
            {(can('payroll:loan:read') || can('payroll:run:read')) && <Loans id={id} />}
            {can('hr:employee:update') && emp.status !== 'EXITED' && <Exit e={emp} />}
          </div>
        )}
      </QueryView>
    </Sheet>
  );
}
