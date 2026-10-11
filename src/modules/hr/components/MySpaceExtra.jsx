import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  FormField,
  Input,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr } from '../../../lib/money.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, fmtMonth, localeOf } from '../../dx-kit/format.js';
import {
  LEAVE_TONE,
  monthsIST,
  todayIST,
  useMyAttendanceQuery,
  useMyEmployeeQuery,
  useMyLeaveQuery,
  useMyPayslipsQuery,
  useMyProfileChangesQuery,
  useMyTaxDeclarationQuery,
  useRequestProfileChangeMutation,
  useSaveTaxDeclarationMutation,
} from '../api.js';

const DECL_TONE = { SUBMITTED: 'info', VERIFIED: 'success', REJECTED: 'critical' };

function Tile({ label, value, sub }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 shadow-card">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-xl font-semibold text-ink">{value}</span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </div>
  );
}

/** My Space overview: leave left, today's attendance, the last payslip, upcoming leave. */
export function OverviewTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const leave = useMyLeaveQuery();
  const pay = useMyPayslipsQuery();
  const month = monthsIST().current;
  const att = useMyAttendanceQuery(month);
  const today = todayIST();
  const balances = leave.data?.balances?.items ?? [];
  const left = balances.reduce((s, b) => s + (b.available ?? 0), 0);
  const requests = leave.data?.requests ?? [];
  const pending = requests.filter((r) => r.status === 'PENDING').length;
  const upcoming = requests
    .filter((r) => ['PENDING', 'APPROVED'].includes(r.status) && r.to >= today)
    .sort((a, b) => a.from.localeCompare(b.from));
  const todayRow = att.data?.items?.[0]?.cells?.find((c) => c.date === today);
  const last = pay.data?.items?.[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label={t('me.ov.leaveLeft')}
          value={left}
          sub={pending ? t('me.ov.pending', { count: pending }) : ''}
        />
        <Tile
          label={t('me.ov.today')}
          value={
            todayRow?.status
              ? t(`hr.att.${todayRow.status}`, { defaultValue: todayRow.status })
              : t('me.ov.notMarked')
          }
          sub={fmtDate(today, locale)}
        />
        <Tile
          label={t('me.ov.lastPay')}
          value={last ? inr(last.net) : t('me.ov.noPay')}
          sub={last ? fmtMonth(`${last.month}-01`, locale) : ''}
        />
      </div>
      <Card title={t('me.ov.upcoming')}>
        {upcoming.length ? (
          <ul className="divide-y divide-line">
            {upcoming.slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="text-ink">
                  {fmtDate(r.from, locale)}
                  {r.to !== r.from ? ` – ${fmtDate(r.to, locale)}` : ''}
                </span>
                <span className="text-muted">{r.code}</span>
                <StatusBadge
                  tone={LEAVE_TONE[r.status] ?? 'neutral'}
                  label={t(`hr.leaveStatus.${r.status}`)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t('me.ov.noUpcoming')}</p>
        )}
      </Card>
    </div>
  );
}

/** The year's income-tax declaration; payroll checks it. */
export function TaxTab() {
  const { t } = useTranslation();
  const q = useMyTaxDeclarationQuery();
  return (
    <QueryView query={q} rows={3}>
      {(d) => (
        <TaxForm
          key={d.declaration?.version ?? 'new'}
          fy={d.fy}
          declaration={d.declaration}
          t={t}
        />
      )}
    </QueryView>
  );
}

function TaxForm({ fy, declaration: d, t }) {
  const { toast } = useToast();
  const [save, saving] = useSaveTaxDeclarationMutation();
  const [failure, setFailure] = useState(null);
  const [form, setForm] = useState({
    regime: d?.regime ?? 'NEW',
    rentMonthly: String(d?.rentMonthly ?? ''),
    deductions80C: String(d?.deductions80C ?? ''),
    deductions80D: String(d?.deductions80D ?? ''),
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  return (
    <Card
      title={t('me.tax.title', { fy })}
      description={t('me.tax.hint')}
      actions={
        d && <StatusBadge tone={DECL_TONE[d.status]} label={t(`me.tax.status.${d.status}`)} />
      }
    >
      <div className="flex max-w-xl flex-col gap-3">
        {d?.reviewNote && (
          <Banner tone={d.status === 'REJECTED' ? 'critical' : 'info'}>
            {t('me.tax.note', { note: d.reviewNote })}
          </Banner>
        )}
        <FormField label={t('me.tax.regime')}>
          <Select value={form.regime} onChange={set('regime')}>
            {['NEW', 'OLD'].map((r) => (
              <option key={r} value={r}>
                {t(`me.tax.regimes.${r}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {form.regime === 'OLD' && (
          <>
            <FormField label={t('me.tax.rent')}>
              <Input inputMode="numeric" value={form.rentMonthly} onChange={set('rentMonthly')} />
            </FormField>
            <FormField label={t('me.tax.d80C')}>
              <Input
                inputMode="numeric"
                value={form.deductions80C}
                onChange={set('deductions80C')}
              />
            </FormField>
            <FormField label={t('me.tax.d80D')}>
              <Input
                inputMode="numeric"
                value={form.deductions80D}
                onChange={set('deductions80D')}
              />
            </FormField>
          </>
        )}
        <ApiErrorNotice error={failure} />
        <div>
          <Button
            loading={saving.isLoading}
            onClick={async () => {
              setFailure(null);
              try {
                await save({
                  regime: form.regime,
                  rentMonthly: form.regime === 'OLD' ? num(form.rentMonthly) : 0,
                  deductions80C: form.regime === 'OLD' ? num(form.deductions80C) : 0,
                  deductions80D: form.regime === 'OLD' ? num(form.deductions80D) : 0,
                }).unwrap();
                toast({ tone: 'success', title: t('me.tax.saved') });
              } catch (e) {
                setFailure(e);
              }
            }}
          >
            {t('me.tax.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** My profile: contact, emergency contact and bank changes go to HR for approval. */
export function ProfileTab() {
  const { t } = useTranslation();
  const me = useMyEmployeeQuery();
  return (
    <QueryView query={me} rows={4}>
      {(e) => <ProfileForm key={e.mobile ?? ''} e={e} t={t} />}
    </QueryView>
  );
}

function ProfileForm({ e, t }) {
  const { i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const changes = useMyProfileChangesQuery();
  const [send, sending] = useRequestProfileChangeMutation();
  const [failure, setFailure] = useState(null);
  const [form, setForm] = useState({
    mobile: e.mobile ?? '',
    email: e.email ?? '',
    address: e.address ?? '',
    ecName: e.emergencyContact?.name ?? '',
    ecRelation: e.emergencyContact?.relation ?? '',
    ecMobile: e.emergencyContact?.mobile ?? '',
    bankName: '',
    accountNo: '',
    ifsc: '',
  });
  const set = (k) => (ev) => setForm({ ...form, [k]: ev.target.value });
  const pending = changes.data?.items?.find((c) => c.status === 'PENDING');
  const body = {
    ...(form.mobile && form.mobile !== (e.mobile ?? '') ? { mobile: form.mobile.trim() } : {}),
    ...(form.email && form.email !== (e.email ?? '') ? { email: form.email.trim() } : {}),
    ...(form.address && form.address !== (e.address ?? '') ? { address: form.address.trim() } : {}),
    ...(form.ecName &&
    (form.ecName !== (e.emergencyContact?.name ?? '') ||
      form.ecRelation !== (e.emergencyContact?.relation ?? '') ||
      form.ecMobile !== (e.emergencyContact?.mobile ?? ''))
      ? {
          emergencyContact: {
            name: form.ecName.trim(),
            relation: form.ecRelation.trim(),
            mobile: form.ecMobile.trim(),
          },
        }
      : {}),
    ...(form.accountNo
      ? {
          bank: {
            name: form.bankName.trim(),
            accountNo: form.accountNo.trim(),
            ifsc: form.ifsc.trim(),
          },
        }
      : {}),
  };
  const changed = Object.keys(body).length > 0;
  return (
    <Card title={t('me.prof.title')} description={t('me.prof.hint')}>
      <div className="flex max-w-2xl flex-col gap-3">
        {pending && (
          <Banner tone="info">{t('me.prof.pending', { date: fmtDate(pending.at, locale) })}</Banner>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('me.prof.mobile')}>
            <Input inputMode="numeric" value={form.mobile} onChange={set('mobile')} />
          </FormField>
          <FormField label={t('me.prof.email')}>
            <Input type="email" value={form.email} onChange={set('email')} />
          </FormField>
        </div>
        <FormField label={t('me.prof.address')}>
          <Textarea rows={2} value={form.address} onChange={set('address')} />
        </FormField>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-semibold text-ink">{t('me.prof.emergency')}</legend>
          <FormField label={t('me.prof.emergencyName')}>
            <Input value={form.ecName} onChange={set('ecName')} />
          </FormField>
          <FormField label={t('me.prof.relation')}>
            <Input value={form.ecRelation} onChange={set('ecRelation')} />
          </FormField>
          <FormField label={t('me.prof.emergencyMobile')}>
            <Input inputMode="numeric" value={form.ecMobile} onChange={set('ecMobile')} />
          </FormField>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-semibold text-ink">
            {t('me.prof.bank')}
            {e.bank ? ` · ${e.bank.accountNo} · ${e.bank.name}` : ''}
          </legend>
          <FormField label={t('me.prof.bankName')}>
            <Input value={form.bankName} onChange={set('bankName')} />
          </FormField>
          <FormField label={t('me.prof.accountNo')}>
            <Input inputMode="numeric" value={form.accountNo} onChange={set('accountNo')} />
          </FormField>
          <FormField label={t('me.prof.ifsc')}>
            <Input value={form.ifsc} onChange={set('ifsc')} />
          </FormField>
        </fieldset>
        {e.registration && (
          <p className="text-sm text-muted">
            {t('me.prof.registration')}: {e.registration.council} {e.registration.number}
          </p>
        )}
        <ApiErrorNotice error={failure} />
        <div>
          <Button
            loading={sending.isLoading}
            disabled={!changed || Boolean(pending)}
            onClick={async () => {
              setFailure(null);
              try {
                const r = await send(body).unwrap();
                toast({
                  tone: 'success',
                  title: r.status === 'APPLIED' ? t('me.prof.applied') : t('me.prof.sent'),
                });
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('me.prof.submit')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
