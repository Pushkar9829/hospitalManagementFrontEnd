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
  Select,
  Sheet,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import {
  LEAVE_TONE,
  monthsIST,
  useAttendanceQuery,
  useCreateEmployeeMutation,
  useCredentialAlertsQuery,
  useDecideLeaveMutation,
  useEmployeesQuery,
  useImportPunchesMutation,
  useLeaveRequestsQuery,
  useLockAttendanceMutation,
  useMarkAttendanceMutation,
} from '../api.js';
import { EmployeeSheet } from '../components/EmployeeSheet.jsx';
import { MonthGrid } from '../components/MonthGrid.jsx';
import { AppraisalTab, ExitsTab, RecruitmentTab, TrainingTab } from '../components/Talent.jsx';

const BLANK = {
  first: '',
  last: '',
  gender: 'F',
  designation: '',
  joinedOn: '',
  mobile: '',
  managerId: '',
  pan: '',
  uan: '',
  bankName: '',
  accountNo: '',
  ifsc: '',
  council: '',
  regNo: '',
  regExpires: '',
};

function AddEmployee({ open, onOpenChange, employees }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [f, setF] = useState(BLANK);
  const [failure, setFailure] = useState(null);
  const [create, state] = useCreateEmployeeMutation();
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const field = (k, props = {}) => (
    <FormField label={t(`hr.emp.${k}`)} className={props.className}>
      <Input value={f[k]} onChange={set(k)} {...props} />
    </FormField>
  );
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('hr.emp.addTitle')}
      description={t('hr.emp.addHint')}
      footer={
        <Button
          loading={state.isLoading}
          disabled={!f.first.trim() || !f.joinedOn}
          onClick={async () => {
            setFailure(null);
            try {
              const out = await create({
                name: { first: f.first.trim(), last: f.last.trim() || undefined },
                gender: f.gender,
                designation: f.designation.trim() || undefined,
                joinedOn: f.joinedOn,
                mobile: f.mobile.trim() || undefined,
                managerId: f.managerId || undefined,
                pan: f.pan.trim() || undefined,
                uan: f.uan.trim() || undefined,
                bank: f.accountNo.trim()
                  ? { name: f.bankName.trim(), accountNo: f.accountNo.trim(), ifsc: f.ifsc.trim() }
                  : undefined,
                registration: f.regNo.trim()
                  ? {
                      council: f.council.trim(),
                      number: f.regNo.trim(),
                      expiresOn: f.regExpires || undefined,
                    }
                  : undefined,
              }).unwrap();
              toast({ tone: 'success', title: t('hr.emp.added', { empNo: out.empNo }) });
              setF(BLANK);
              onOpenChange(false);
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t('hr.emp.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {failure && <ApiErrorNotice error={failure} />}
        <div className="grid gap-3 sm:grid-cols-2">
          {field('first')}
          {field('last')}
          <FormField label={t('hr.emp.gender')}>
            <Select
              value={f.gender}
              onChange={set('gender')}
              options={['F', 'M', 'O'].map((g) => ({ value: g, label: t(`hr.gender.${g}`) }))}
            />
          </FormField>
          {field('designation')}
          {field('joinedOn', { type: 'date' })}
          {field('mobile', { inputMode: 'numeric' })}
          <FormField label={t('hr.emp.manager')} className="sm:col-span-2">
            <Select
              value={f.managerId}
              placeholder={t('hr.emp.noManager')}
              onChange={set('managerId')}
              options={employees.map((e) => ({ value: e.id, label: `${e.name} · ${e.empNo}` }))}
            />
          </FormField>
          {field('pan', { className: 'font-mono' })}
          {field('uan', { inputMode: 'numeric' })}
          {field('bankName')}
          {field('accountNo', { inputMode: 'numeric' })}
          {field('ifsc')}
          <span />
          {field('council')}
          {field('regNo')}
          {field('regExpires', { type: 'date' })}
        </div>
      </div>
    </Sheet>
  );
}

function EmployeesTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [q, setQ] = useUrlState('search', '');
  const [status, setStatus] = useUrlState('st', 'ACTIVE,NOTICE');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useUrlState('emp', '');
  const list = useEmployeesQuery({ q: q || undefined, status });
  const all = useEmployeesQuery({});
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('hr.search')} className="w-64">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </FormField>
        <FormField label={t('hr.emp.status')} className="w-48">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'ACTIVE,NOTICE', label: t('hr.empStatus.current') },
              { value: 'EXITED', label: t('hr.empStatus.EXITED') },
            ]}
          />
        </FormField>
        {can('hr:employee:create') && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            {t('hr.emp.add')}
          </Button>
        )}
      </div>
      <QueryView
        query={list}
        rows={6}
        empty={<EmptyState bordered={false} title={t('hr.emp.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t('hr.tabs.employees')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['empNo', 'name', 'designation', 'joined', 'status'].map((k) => (
                    <th key={k} className="px-3 py-2 font-semibold">
                      {t(`hr.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-mono">{e.empNo}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-semibold text-ink underline-offset-2 hover:underline"
                        onClick={() => setOpenId(e.id)}
                      >
                        {e.name}
                      </button>
                      {e.department && <span className="block text-muted">{e.department}</span>}
                    </td>
                    <td className="px-3 py-2">{e.designation}</td>
                    <td className="px-3 py-2">{fmtDate(e.joinedOn)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        tone={e.status === 'ACTIVE' ? 'success' : 'warning'}
                        label={t(`hr.empStatus.${e.status}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      <AddEmployee open={adding} onOpenChange={setAdding} employees={all.data?.items ?? []} />
      {openId && <EmployeeSheet id={openId} onClose={() => setOpenId('')} />}
    </div>
  );
}

function LeaveTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useUrlState('st', 'PENDING');
  const q = useLeaveRequestsQuery({ status });
  const [decide, state] = useDecideLeaveMutation();
  const [failure, setFailure] = useState(null);
  const act = async (l, decision) => {
    setFailure(null);
    try {
      await decide({ id: l.id, decision }).unwrap();
      toast({
        tone: 'success',
        title: t(decision === 'APPROVE' ? 'hr.leave.approved' : 'hr.leave.rejected', {
          name: l.name,
        }),
      });
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('hr.leave.show')} className="w-48">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={['PENDING', 'APPROVED', 'REJECTED'].map((s) => ({
            value: s,
            label: t(`hr.leaveStatus.${s}`),
          }))}
        />
      </FormField>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('hr.leave.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
                <div className="min-w-56 flex-1">
                  <p className="font-semibold">
                    {l.name} <span className="font-mono text-muted">{l.empNo}</span>
                  </p>
                  <p className="text-muted">
                    {t('hr.leave.line', {
                      code: l.code,
                      from: fmtDate(l.from),
                      to: fmtDate(l.to),
                      count: l.days,
                    })}
                    {l.reason && ` · ${l.reason}`}
                  </p>
                </div>
                <StatusBadge tone={LEAVE_TONE[l.status]} label={t(`hr.leaveStatus.${l.status}`)} />
                {l.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <Button size="sm" loading={state.isLoading} onClick={() => act(l, 'APPROVE')}>
                      {t('hr.leave.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={state.isLoading}
                      onClick={() => act(l, 'REJECT')}
                    >
                      {t('hr.leave.reject')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function AttendanceTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const months = monthsIST();
  const [month, setMonth] = useUrlState('month', months.current);
  const grid = useAttendanceQuery({ month });
  const [csv, setCsv] = useState('');
  const [failure, setFailure] = useState(null);
  const [picked, setPicked] = useState(null);
  const [importPunches, imp] = useImportPunchesMutation();
  const [lock, locking] = useLockAttendanceMutation();
  const [mark, marking] = useMarkAttendanceMutation();
  const rows = csv
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [empNo, date, inAt, outAt] = l.split(',').map((x) => x.trim());
      return { empNo, date, in: inAt, out: outAt };
    })
    .filter((r) => r.empNo && /^\d{4}-\d{2}-\d{2}$/.test(r.date ?? ''));
  const canEdit = can('hr:attendance:update');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('hr.att.month')} className="w-44">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </FormField>
        {grid.data?.locked ? (
          <StatusBadge tone="success" label={t('hr.att.lockedBy', { by: grid.data.lockedBy })} />
        ) : (
          can('hr:attendance:lock') && (
            <Button
              variant="secondary"
              loading={locking.isLoading}
              disabled={month >= months.current}
              onClick={async () => {
                setFailure(null);
                try {
                  await lock({ month }).unwrap();
                  toast({ tone: 'success', title: t('hr.att.lockedToast', { month }) });
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('hr.att.lock')}
            </Button>
          )
        )}
      </div>
      {!grid.data?.locked && month < months.current && (
        <Banner tone="info">{t('hr.att.lockHint')}</Banner>
      )}
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView
        query={grid}
        rows={6}
        empty={<EmptyState bordered={false} title={t('hr.emp.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <MonthGrid data={d} onPick={canEdit ? (row, cell) => setPicked({ row, cell }) : null} />
        )}
      </QueryView>
      {picked && (
        <Card
          title={t('hr.att.correct', { name: picked.row.employee.name, date: picked.cell.date })}
        >
          <div className="flex flex-wrap gap-2">
            {['PRESENT', 'HALF_DAY', 'ABSENT', 'LOP', 'WEEK_OFF', 'HOLIDAY'].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === picked.cell.status ? 'primary' : 'secondary'}
                disabled={marking.isLoading}
                onClick={async () => {
                  setFailure(null);
                  try {
                    await mark({
                      employeeId: picked.row.employee.id,
                      date: picked.cell.date,
                      status: s,
                    }).unwrap();
                    setPicked(null);
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t(`hr.att.${s}`)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
              {t('hr.cancel')}
            </Button>
          </div>
        </Card>
      )}
      {canEdit && !grid.data?.locked && (
        <Card title={t('hr.att.importTitle')} description={t('hr.att.importHint')}>
          <div className="flex flex-col gap-2">
            <FormField label={t('hr.att.punches')}>
              <Textarea
                rows={5}
                className="font-mono"
                value={csv}
                placeholder="EMP000001,2026-10-01,09:02,17:10"
                onChange={(e) => setCsv(e.target.value)}
              />
            </FormField>
            <Button
              className="self-start"
              disabled={!rows.length}
              loading={imp.isLoading}
              onClick={async () => {
                setFailure(null);
                try {
                  const out = await importPunches({ rows }).unwrap();
                  toast({
                    tone: out.skipped.length ? 'warning' : 'success',
                    title: t('hr.att.imported', { saved: out.saved, skipped: out.skipped.length }),
                  });
                  setCsv('');
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('hr.att.import', { count: rows.length })}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function AlertsTab() {
  const { t, i18n } = useTranslation();
  const q = useCredentialAlertsQuery();
  return (
    <QueryView
      query={q}
      rows={3}
      empty={<EmptyState bordered={false} title={t('hr.alerts.none')} />}
      isEmpty={(d) => !d.items.length}
    >
      {(d) => (
        <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
          {d.items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-48 flex-1 font-semibold">{e.name}</span>
              <span className="text-muted">
                {[e.registration?.council, e.registration?.number].filter(Boolean).join(' · ')}
              </span>
              <span>{fmtDate(e.registration?.expiresOn, localeOf(i18n))}</span>
              <StatusBadge
                tone={e.daysLeft < 0 ? 'critical' : 'warning'}
                label={
                  e.daysLeft < 0
                    ? t('hr.alerts.expired')
                    : t('hr.alerts.daysLeft', { count: e.daysLeft })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}

/**
 * HR (board Hr, route /hr): employee master with salary and loans, leave approvals, the month's
 * attendance with biometric import, corrections and the payroll lock, and registration expiry.
 */
export default function HrPage() {
  useStrings(addDxkitStrings, addPeopleStrings);
  const { t } = useTranslation();
  const can = useCan();
  const pending = useLeaveRequestsQuery({ status: 'PENDING' });
  const alerts = useCredentialAlertsQuery(undefined, { skip: !can('hr:employee:read') });
  const emps = useEmployeesQuery({}, { skip: !can('hr:employee:read') });
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('hr.crumb') }, { label: t('hr.title') }]}
        title={t('hr.title')}
        description={t('hr.description')}
      />
      <KpiRow
        loading={emps.isLoading}
        items={[
          { label: t('hr.kpi.staff'), value: String(emps.data?.total ?? 0) },
          {
            label: t('hr.kpi.leave'),
            value: String(pending.data?.total ?? 0),
            tone: pending.data?.total ? 'warning' : undefined,
          },
          {
            label: t('hr.kpi.alerts'),
            value: String(alerts.data?.items.length ?? 0),
            tone: alerts.data?.items.length ? 'critical' : undefined,
          },
        ]}
      />
      <UrlTabs
        param="tab"
        label={t('hr.tabsLabel')}
        reset={['search', 'st', 'emp', 'month', 'opening', 'cycle']}
        tabs={[
          can('hr:employee:read') && {
            id: 'employees',
            label: t('hr.tabs.employees'),
            body: <EmployeesTab />,
          },
          can('hr:leave:approve') && {
            id: 'leave',
            label: t('hr.tabs.leave'),
            count: pending.data?.total || undefined,
            body: <LeaveTab />,
          },
          (can('hr:attendance:read') || can('hr:employee:read')) && {
            id: 'attendance',
            label: t('hr.tabs.attendance'),
            body: <AttendanceTab />,
          },
          can('hr:employee:read') && {
            id: 'alerts',
            label: t('hr.tabs.alerts'),
            count: alerts.data?.items.length || undefined,
            countTone: 'critical',
            body: <AlertsTab />,
          },
          can('hr:recruitment:read') && {
            id: 'recruitment',
            label: t('hr.tal.tabs.recruitment'),
            body: <RecruitmentTab />,
          },
          can('hr:training:read') && {
            id: 'training',
            label: t('hr.tal.tabs.training'),
            body: <TrainingTab />,
          },
          can('hr:appraisal:read') && {
            id: 'appraisal',
            label: t('hr.tal.tabs.appraisal'),
            body: <AppraisalTab />,
          },
          can('hr:employee:read') && {
            id: 'exits',
            label: t('hr.tal.tabs.exits'),
            body: <ExitsTab />,
          },
        ]}
      />
    </Page>
  );
}
