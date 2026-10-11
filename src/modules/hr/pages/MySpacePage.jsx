import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addPeopleStrings } from '@hms/i18n/people';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { addFacilityStrings } from '@hms/i18n/facility';
import { addQualityStrings } from '@hms/i18n/quality';
import { useSelector } from 'react-redux';
import {
  Button,
  Card,
  Checkbox,
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
import { inr } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import { Payslip } from '../../payroll/components/Payslip.jsx';
import { MyAppraisalTab } from '../components/Talent.jsx';
import { OverviewTab, ProfileTab, TaxTab } from '../components/MySpaceExtra.jsx';
import {
  LEAVE_TONE,
  monthsIST,
  todayIST,
  useApplyLeaveMutation,
  useCancelLeaveMutation,
  useDecideLeaveMutation,
  useLeaveRequestsQuery,
  useMyAttendanceQuery,
  useMyEmployeeQuery,
  useMyLeaveQuery,
  useMyPayslipsQuery,
} from '../api.js';
import { MonthGrid } from '../components/MonthGrid.jsx';
import { TicketForm, TicketList } from '../../facility/components/Tickets.jsx';
import { IncidentForm } from '../../quality/components/IncidentForm.jsx';
import { DocumentsList } from '../../quality/pages/QualityPage.jsx';
import { activeModules } from '../../../app/access.js';
import { selectSession } from '../../../app/session.js';

function LeaveTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const q = useMyLeaveQuery();
  const [apply, applying] = useApplyLeaveMutation();
  const [cancel, cancelling] = useCancelLeaveMutation();
  const [f, setF] = useState({
    code: 'CL',
    from: todayIST(),
    to: todayIST(),
    halfDay: false,
    reason: '',
  });
  const [failure, setFailure] = useState(null);
  return (
    <QueryView query={q} rows={4}>
      {(d) => (
        <div className="flex flex-col gap-4">
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {d.balances.items
              .filter((b) => b.code !== 'LOP')
              .map((b) => (
                <li key={b.code} className="rounded-control border border-line px-3 py-2">
                  <p className="text-muted">{b.name}</p>
                  <p className="tabular text-xl font-semibold">{b.available}</p>
                  <p className="text-xs text-muted">{t('hr.bal.used', { used: b.used })}</p>
                </li>
              ))}
          </ul>
          <Card title={t('me.leave.apply')}>
            {failure && <ApiErrorNotice error={failure} />}
            <div className="flex flex-wrap items-end gap-3">
              <FormField label={t('me.leave.type')} className="w-44">
                <Select
                  value={f.code}
                  onChange={(e) => setF({ ...f, code: e.target.value })}
                  options={d.balances.items.map((b) => ({ value: b.code, label: b.name }))}
                />
              </FormField>
              <FormField label={t('me.leave.from')} className="w-40">
                <Input
                  type="date"
                  value={f.from}
                  onChange={(e) =>
                    setF({
                      ...f,
                      from: e.target.value,
                      to: f.to < e.target.value ? e.target.value : f.to,
                    })
                  }
                />
              </FormField>
              <FormField label={t('me.leave.to')} className="w-40">
                <Input
                  type="date"
                  value={f.to}
                  min={f.from}
                  onChange={(e) => setF({ ...f, to: e.target.value })}
                />
              </FormField>
              <Checkbox
                checked={f.halfDay}
                disabled={f.from !== f.to}
                onChange={(e) => setF({ ...f, halfDay: e.target.checked })}
                label={t('me.leave.half')}
              />
              <FormField label={t('me.leave.reason')} className="min-w-56 flex-1">
                <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
              </FormField>
              <Button
                loading={applying.isLoading}
                onClick={async () => {
                  setFailure(null);
                  try {
                    await apply({
                      ...f,
                      halfDay: f.from === f.to && f.halfDay,
                      reason: f.reason.trim() || undefined,
                    }).unwrap();
                    toast({ tone: 'success', title: t('me.leave.sent') });
                    setF({ ...f, reason: '' });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('me.leave.send')}
              </Button>
            </div>
          </Card>
          {d.requests.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
              {d.requests.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-56 flex-1">
                    {t('hr.leave.line', {
                      code: l.code,
                      from: fmtDate(l.from),
                      to: fmtDate(l.to),
                      count: l.days,
                    })}
                    {l.decisionNote && <span className="block text-muted">{l.decisionNote}</span>}
                  </span>
                  <StatusBadge
                    tone={LEAVE_TONE[l.status]}
                    label={t(`hr.leaveStatus.${l.status}`)}
                  />
                  {l.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancelling.isLoading}
                      onClick={() => cancel(l.id)}
                    >
                      {t('me.leave.withdraw')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState bordered={false} title={t('me.leave.none')} />
          )}
        </div>
      )}
    </QueryView>
  );
}

function AttendanceTab() {
  const { t } = useTranslation();
  const [month, setMonth] = useUrlState('month', monthsIST().current);
  const q = useMyAttendanceQuery(month);
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('hr.att.month')} className="w-44">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={2}>
        {(d) => <MonthGrid data={d} />}
      </QueryView>
    </div>
  );
}

function PayslipsTab() {
  const { t } = useTranslation();
  const q = useMyPayslipsQuery();
  const [open, setOpen] = useState('');
  return (
    <QueryView
      query={q}
      rows={3}
      empty={<EmptyState bordered={false} title={t('me.pay.none')} />}
      isEmpty={(d) => !d.items.length}
    >
      {(d) => (
        <ul className="flex flex-col gap-2">
          {d.items.map((p) => (
            <li key={p.id} className="rounded-control border border-line">
              <button
                type="button"
                aria-expanded={open === p.id}
                onClick={() => setOpen(open === p.id ? '' : p.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              >
                <span className="font-semibold">{p.month}</span>
                <span className="tabular">{t('me.pay.net', { amount: inr(p.net) })}</span>
              </button>
              {open === p.id && <Payslip slip={p} className="m-3 mt-0" />}
            </li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}

function TeamTab() {
  const { t } = useTranslation();
  const q = useLeaveRequestsQuery({ status: 'PENDING' });
  return (
    <QueryView
      query={q}
      rows={2}
      empty={<EmptyState bordered={false} title={t('hr.leave.none')} />}
      isEmpty={(d) => !d.items.length}
    >
      {(d) => <TeamList items={d.items} />}
    </QueryView>
  );
}

function TeamList({ items }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
      {items.map((l) => (
        <TeamRow key={l.id} l={l} t={t} />
      ))}
    </ul>
  );
}

function TeamRow({ l, t }) {
  const [decide, state] = useDecideLeaveMutation();
  const [failure, setFailure] = useState(null);
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <span className="min-w-56 flex-1">
        <span className="font-semibold">{l.name}</span> ·{' '}
        {t('hr.leave.line', {
          code: l.code,
          from: fmtDate(l.from),
          to: fmtDate(l.to),
          count: l.days,
        })}
        {l.reason && <span className="block text-muted">{l.reason}</span>}
        {failure && <ApiErrorNotice error={failure} />}
      </span>
      {['APPROVE', 'REJECT'].map((decision) => (
        <Button
          key={decision}
          size="sm"
          variant={decision === 'APPROVE' ? 'primary' : 'secondary'}
          disabled={state.isLoading}
          onClick={async () => {
            setFailure(null);
            try {
              await decide({ id: l.id, decision }).unwrap();
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t(decision === 'APPROVE' ? 'hr.leave.approve' : 'hr.leave.reject')}
        </Button>
      ))}
    </li>
  );
}

/**
 * My Space (board MySpace, route /me): every employee's own record, leave balances and requests,
 * attendance and payslips; a reporting manager also approves the team's leave here.
 */
export default function MySpacePage() {
  useStrings(addDxkitStrings, addPeopleStrings, addFacilityStrings, addQualityStrings);
  const { t } = useTranslation();
  const can = useCan();
  const session = useSelector((st) => selectSession(st).data);
  const facility = activeModules(session).includes('FAC');
  const quality = activeModules(session).includes('QLT');
  const me = useMyEmployeeQuery();
  const team = useLeaveRequestsQuery(
    { status: 'PENDING' },
    { skip: !can('myspace:team:approve') || !me.data },
  );
  if (me.error?.status === 404)
    return (
      <Page>
        <PageHeader title={t('me.title')} />
        <EmptyState title={t('me.notLinked')} description={t('me.notLinkedHint')} />
      </Page>
    );
  const e = me.data;
  return (
    <Page>
      <PageHeader
        title={e ? t('me.hello', { name: e.first }) : t('me.title')}
        description={
          e
            ? [e.empNo, e.designation, e.department, t('me.since', { date: fmtDate(e.joinedOn) })]
                .filter(Boolean)
                .join(' · ')
            : t('me.description')
        }
      />
      <UrlTabs
        param="tab"
        label={t('me.tabsLabel')}
        reset={['month']}
        tabs={[
          { id: 'overview', label: t('me.ov.tab'), body: <OverviewTab /> },
          { id: 'leave', label: t('me.tabs.leave'), body: <LeaveTab /> },
          { id: 'attendance', label: t('me.tabs.attendance'), body: <AttendanceTab /> },
          { id: 'payslips', label: t('me.tabs.payslips'), body: <PayslipsTab /> },
          { id: 'tax', label: t('me.tax.tab'), body: <TaxTab /> },
          quality && { id: 'incident', label: t('me.tabs.incident'), body: <IncidentForm /> },
          quality && { id: 'policies', label: t('me.tabs.policies'), body: <DocumentsList /> },
          facility && {
            id: 'problems',
            label: t('me.tabs.problems'),
            body: (
              <div className="flex flex-col gap-4">
                <TicketForm />
                <TicketList />
              </div>
            ),
          },
          { id: 'appraisal', label: t('me.apr.tab'), body: <MyAppraisalTab /> },
          { id: 'profile', label: t('me.prof.tab'), body: <ProfileTab /> },
          team.data?.items.length > 0 && {
            id: 'team',
            label: t('me.tabs.team'),
            count: team.data.items.length,
            body: <TeamTab />,
          },
        ]}
      />
    </Page>
  );
}
