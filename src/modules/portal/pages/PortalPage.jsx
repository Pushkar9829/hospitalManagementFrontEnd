import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addPortalStrings } from '@hms/i18n/portal';
import { Banner, Button, Card, FormField, Input, Select, StatusBadge } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { fmtDate } from '../../dx-kit/format.js';
import {
  usePortalAppointmentsQuery,
  usePortalBillsQuery,
  usePortalBookMutation,
  usePortalCancelMutation,
  usePortalLogoutMutation,
  usePortalMeQuery,
  usePortalReportsQuery,
  usePortalRequestOtpMutation,
  usePortalSlotsQuery,
  usePortalStayQuery,
  usePortalVerifyOtpMutation,
} from '../api.js';

const tomorrowIST = () =>
  new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);

function SignIn() {
  const { t } = useTranslation();
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [request, requesting] = usePortalRequestOtpMutation();
  const [verify, verifying] = usePortalVerifyOtpMutation();
  const [failure, setFailure] = useState(null);
  const ok = /^[6-9]\d{9}$/.test(mobile.trim());
  return (
    <Card title={t('portal.signIn.title')} description={t('portal.signIn.hint')}>
      <div className="flex flex-col gap-3">
        {failure && <ApiErrorNotice error={failure} />}
        <FormField label={t('portal.signIn.mobile')}>
          <Input
            inputMode="numeric"
            autoComplete="tel-national"
            value={mobile}
            disabled={sent}
            onChange={(e) => setMobile(e.target.value)}
          />
        </FormField>
        {sent && (
          <FormField label={t('portal.signIn.code')} hint={t('portal.signIn.codeHint')}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>
        )}
        {sent ? (
          <Button
            size="lg"
            loading={verifying.isLoading}
            disabled={!/^\d{6}$/.test(code)}
            onClick={async () => {
              setFailure(null);
              try {
                await verify({ mobile: mobile.trim(), code }).unwrap();
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('portal.signIn.verify')}
          </Button>
        ) : (
          <Button
            size="lg"
            loading={requesting.isLoading}
            disabled={!ok}
            onClick={async () => {
              setFailure(null);
              try {
                await request(mobile.trim()).unwrap();
                setSent(true);
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('portal.signIn.send')}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Home({ me }) {
  const { t } = useTranslation();
  const tiles = [
    [
      'reports',
      t('portal.home.reports'),
      me.newReports ? t('portal.home.newReports', { count: me.newReports }) : null,
    ],
    [
      'bills',
      t('portal.home.bills'),
      me.due ? t('portal.home.due', { amount: inr(me.due) }) : null,
    ],
    ['book', t('portal.home.book'), null],
    ...(me.stay ? [['stay', t('portal.home.stay'), me.stay.patient]] : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      {me.nextAppointment && (
        <Card title={t('portal.home.next')}>
          <p className="text-sm">
            {t('portal.home.nextLine', {
              date: fmtDate(me.nextAppointment.date),
              time: me.nextAppointment.time,
              doctor: me.nextAppointment.doctor,
              patient: me.nextAppointment.patient,
            })}
          </p>
        </Card>
      )}
      {me.due > 0 && (
        <Banner tone="warning">
          {t('portal.home.dueBanner', { amount: inr(me.due), count: me.dueBills })}
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(([to, label, sub]) => (
          <Link
            key={to}
            to={`/my/${to}`}
            className="flex min-h-24 flex-col justify-between rounded-control border border-line bg-surface p-4 font-semibold"
          >
            {label}
            {sub && <span className="text-sm font-normal text-muted">{sub}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Reports({ me }) {
  const { t } = useTranslation();
  const [patientId, setPatientId] = useState(me.patients[0]?.id ?? '');
  const q = usePortalReportsQuery(patientId, { skip: !patientId });
  return (
    <div className="flex flex-col gap-3">
      {me.patients.length > 1 && (
        <FormField label={t('portal.whose')}>
          <Select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            options={me.patients.map((p) => ({ value: p.id, label: p.name }))}
          />
        </FormField>
      )}
      {q.data && !q.data.lab.length && !q.data.imaging.length && (
        <p className="text-muted">{t('portal.reports.none')}</p>
      )}
      {q.data?.lab.map((o) => (
        <Card
          key={o.orderNo}
          title={t('portal.reports.lab', { date: fmtDate(o.releasedAt) })}
          description={o.doctor ?? undefined}
        >
          <ul className="flex flex-col gap-2 text-sm">
            {o.tests.map((tst) => (
              <li key={tst.code}>
                <p className="font-semibold">{tst.name}</p>
                {tst.results.map((r) => (
                  <p key={r.name} className="flex justify-between gap-3">
                    <span>{r.name}</span>
                    <span className={r.flag ? 'font-semibold text-warning' : ''}>
                      {r.value} {r.unit}
                      {r.range && (
                        <span className="ml-2 text-xs font-normal text-muted">({r.range})</span>
                      )}
                    </span>
                  </p>
                ))}
              </li>
            ))}
            {o.inPerson.length > 0 && (
              <li className="text-muted">
                {t('portal.reports.inPerson', { tests: o.inPerson.join(', ') })}
              </li>
            )}
          </ul>
        </Card>
      ))}
      {q.data?.imaging.map((s) => (
        <Card key={s.accessionNo} title={s.name} description={fmtDate(s.signedAt)}>
          {s.impression && <p className="text-sm font-semibold">{s.impression}</p>}
          {s.findings && <p className="mt-1 text-sm whitespace-pre-line">{s.findings}</p>}
        </Card>
      ))}
    </div>
  );
}

function Bills() {
  const { t } = useTranslation();
  const q = usePortalBillsQuery();
  const d = q.data;
  if (!d) return null;
  return (
    <div className="flex flex-col gap-3">
      <Card title={t('portal.bills.toPay')} description={inr(d.due)}>
        {d.open.length ? (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {d.open.map((b) => (
              <li key={b.id} className="flex justify-between gap-3 py-2">
                <span>
                  {b.patient} · {b.billNo}
                  <span className="block text-xs text-muted">{fmtDate(b.date)}</span>
                </span>
                <span className="tabular font-semibold">{inr(b.balance)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('portal.bills.nothing')}</p>
        )}
        {!d.onlinePayment && d.due > 0 && (
          <p className="mt-2 text-sm text-muted">{t('portal.bills.payAtCounter')}</p>
        )}
      </Card>
      <Card title={t('portal.bills.receipts')}>
        {d.receipts.length ? (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {d.receipts.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2">
                <span>
                  {r.receiptNo} · {r.mode}
                  <span className="block text-xs text-muted">
                    {r.patient} · {fmtDate(r.at)}
                  </span>
                </span>
                <span className="tabular">{inr(r.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('portal.bills.noReceipts')}</p>
        )}
      </Card>
      {d.deposits.length > 0 && (
        <Card title={t('portal.bills.deposits')}>
          <ul className="text-sm">
            {d.deposits.map((x) => (
              <li key={x.id} className="flex justify-between py-1">
                <span>{fmtDate(x.at)}</span>
                <span className="tabular">
                  {t('portal.bills.depositLine', { amount: inr(x.amount), left: inr(x.left) })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stay() {
  const { t } = useTranslation();
  const q = usePortalStayQuery();
  const s = q.data?.stay;
  if (q.data && !s) return <p className="text-muted">{t('portal.stay.none')}</p>;
  if (!s) return null;
  return (
    <div className="flex flex-col gap-3">
      <Card title={t('portal.stay.admitted', { name: s.patient })} description={s.ipNo}>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted">{t('portal.stay.bed')}</dt>
            <dd className="font-semibold">
              {s.ward} · {s.bed}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('portal.stay.consultant')}</dt>
            <dd className="font-semibold">{s.consultant}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('portal.stay.since')}</dt>
            <dd className="font-semibold">{fmtDate(s.admittedAt)}</dd>
          </div>
        </dl>
      </Card>
      <Card title={t('portal.stay.bill')}>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          {[
            ['charges', s.bill.total],
            ['deposit', s.bill.deposit],
            ['balance', s.bill.balance],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted">{t(`portal.stay.${k}`)}</dt>
              <dd className="tabular font-semibold">{inr(v)}</dd>
            </div>
          ))}
        </dl>
        {s.bill.byCategory.length > 0 && (
          <ul className="mt-3 text-sm">
            {s.bill.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between py-0.5">
                <span>{t(`portal.cat.${c.category}`, { defaultValue: c.category })}</span>
                <span className="tabular">{inr(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {s.discharge && (
        <Card title={t('portal.stay.discharge')}>
          <ul className="flex flex-col gap-1 text-sm">
            {s.discharge.map((d) => (
              <li key={d.step} className="flex items-center gap-2">
                <StatusBadge
                  tone={d.done ? 'success' : 'neutral'}
                  label={d.done ? t('portal.stay.done') : t('portal.stay.waiting')}
                />
                {t(`portal.stay.steps.${d.step}`)}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Book({ me }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(tomorrowIST());
  const [patientId, setPatientId] = useState(me.patients[0]?.id ?? '');
  const slots = usePortalSlotsQuery({ date });
  const appts = usePortalAppointmentsQuery();
  const [book, booking] = usePortalBookMutation();
  const [cancel] = usePortalCancelMutation();
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      {failure && <ApiErrorNotice error={failure} />}
      {done && (
        <Banner tone="success">
          {t('portal.book.booked', {
            date: fmtDate(done.date),
            time: done.time,
            doctor: done.doctor,
          })}
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('portal.book.date')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        {me.patients.length > 1 && (
          <FormField label={t('portal.whose')}>
            <Select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              options={me.patients.map((p) => ({ value: p.id, label: p.name }))}
            />
          </FormField>
        )}
      </div>
      {slots.data?.doctors.length === 0 && <p className="text-muted">{t('portal.book.noSlots')}</p>}
      {slots.data?.doctors.map((d) => (
        <Card
          key={d.id}
          title={d.name}
          description={[d.department, d.fee != null ? inr(d.fee) : null]
            .filter(Boolean)
            .join(' · ')}
        >
          <div className="flex flex-wrap gap-2">
            {d.times.map((time) => (
              <Button
                key={time}
                size="sm"
                variant="secondary"
                disabled={booking.isLoading}
                onClick={async () => {
                  setFailure(null);
                  try {
                    await book({ patientId, doctorId: d.id, date, time }).unwrap();
                    setDone({ date, time, doctor: d.name });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {time}
              </Button>
            ))}
          </div>
        </Card>
      ))}
      {appts.data?.items.length > 0 && (
        <Card title={t('portal.book.upcoming')}>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {appts.data.items.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {fmtDate(a.date)} {a.time} · {a.doctor}
                  <span className="block text-xs text-muted">{a.patient}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => cancel(a.id)}>
                  {t('portal.book.cancel')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * Patient portal (catalogue screens Portal, PortalPay, PortalStay, PortalBooking): phone-first,
 * signed in with a code on the registered mobile; the family's reports, bills and receipts, the
 * current stay and booking.
 */
export default function PortalPage() {
  useStrings(addPortalStrings);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { '*': view = '' } = useParams();
  const me = usePortalMeQuery();
  const [logout] = usePortalLogoutMutation();
  const signedIn = Boolean(me.data);
  const titles = {
    reports: t('portal.home.reports'),
    bills: t('portal.home.bills'),
    stay: t('portal.home.stay'),
    book: t('portal.home.book'),
  };
  return (
    <div className="min-h-screen bg-ground">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        {view && signedIn ? (
          <Link to="/my" className="text-sm font-semibold underline-offset-2 hover:underline">
            ‹ {t('portal.home.title')}
          </Link>
        ) : (
          <span className="font-semibold">{me.data?.hospital ?? t('portal.title')}</span>
        )}
        {signedIn && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={async () => {
              await logout();
              navigate('/my');
            }}
          >
            {t('portal.signOut')}
          </Button>
        )}
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        {me.isLoading ? (
          <p className="text-muted">{t('portal.loading')}</p>
        ) : !signedIn ? (
          <SignIn />
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {view
                ? titles[view]
                : t('portal.home.hello', { name: me.data.patients[0]?.name ?? '' })}
            </h1>
            {!view && <Home me={me.data} />}
            {view === 'reports' && <Reports me={me.data} />}
            {view === 'bills' && <Bills />}
            {view === 'stay' && <Stay />}
            {view === 'book' && <Book me={me.data} />}
          </>
        )}
      </main>
    </div>
  );
}
