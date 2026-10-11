import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle } from 'lucide-react';
import { addBillingStrings } from '@hms/i18n/billing';
import {
  Banner,
  Button,
  Card,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  cn,
  useToast,
} from '@hms/ui';
import { useAdminStrings } from '../../../lib/useAdminStrings.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { useUsersQuery } from '../../users/api.js';
import { BillConfigSection } from '../../billing/pages/BillConfigPage.jsx';
import { BranchesTab } from '../components/BranchesTab.jsx';
import { DepartmentsTab } from '../components/DepartmentsTab.jsx';
import { EntitiesTab } from '../components/EntitiesTab.jsx';
import { HospitalTab } from '../components/HospitalTab.jsx';
import { MasterTab } from '../components/MasterTab.jsx';
import {
  useBranchesQuery,
  useDepartmentsQuery,
  useEntitiesQuery,
  useMastersQuery,
  useSaveMasterMutation,
} from '../api.js';

const STEPS = [
  'profile',
  'branches',
  'departments',
  'wards',
  'masters',
  'staff',
  'print',
  'integrations',
  'golive',
];
const REQUIRED = ['profile', 'branches', 'departments', 'masters', 'staff'];
const count = (d) => (Array.isArray(d) ? d.length : (d?.total ?? d?.items?.length ?? 0));

/** Bed codes for rooms `from`..`to` with letters (A, B) or one bed a room. */
function bedCodes(ward, from, to, letters) {
  const a = Number(from);
  const b = Number(to);
  if (!ward || !Number.isInteger(a) || !Number.isInteger(b) || b < a) return [];
  const suffixes = letters
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  const out = [];
  for (let room = a; room <= b && out.length <= 200; room += 1)
    for (const s of suffixes.length ? suffixes : [''])
      out.push({ room: String(room), code: `${ward}-${room}${s}` });
  return out;
}

/** Bulk bed creation for a ward: rooms from-to, beds per room (rule from the board). */
function BedGenerator({ wards }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [save] = useSaveMasterMutation();
  const [ward, setWard] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [letters, setLetters] = useState('A, B');
  const [busy, setBusy] = useState(false);
  const beds = bedCodes(ward, from, to, letters);
  const tooMany = beds.length > 200;
  const create = async () => {
    setBusy(true);
    let created = 0;
    let skipped = 0;
    for (const bed of beds) {
      try {
        await save({
          type: 'beds',
          code: bed.code,
          name: bed.code,
          wardCode: ward,
          room: bed.room,
        }).unwrap();
        created += 1;
      } catch (e) {
        if (e?.status === 409) skipped += 1;
        else {
          toast({ tone: 'critical', title: e?.data?.error?.message ?? String(e?.status) });
          break;
        }
      }
    }
    setBusy(false);
    toast({
      tone: 'success',
      title: t('wizard.beds.created', { count: created }),
      description: skipped ? t('wizard.beds.skipped', { count: skipped }) : undefined,
    });
  };
  if (!wards.length) return <p className="text-muted">{t('wizard.beds.noWards')}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label={t('wizard.beds.ward')}>
          <Select
            value={ward}
            onChange={(e) => setWard(e.target.value)}
            placeholder={t('wizard.beds.pickWard')}
          >
            {wards.map((w) => (
              <option key={w.code} value={w.code}>
                {w.code} · {w.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('wizard.beds.roomFrom')}>
          <Input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t('wizard.beds.roomTo')}>
          <Input inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <FormField label={t('wizard.beds.letters')} hint={t('wizard.beds.lettersHint')} optional>
          <Input value={letters} onChange={(e) => setLetters(e.target.value)} />
        </FormField>
      </div>
      {beds.length > 0 && (
        <p className={cn('text-sm', tooMany ? 'text-critical' : 'text-muted')}>
          {tooMany
            ? t('wizard.beds.tooMany')
            : t('wizard.beds.preview', {
                count: beds.length,
                list: beds
                  .slice(0, 6)
                  .map((b) => b.code)
                  .join(', ')
                  .concat(beds.length > 6 ? ' …' : ''),
              })}
        </p>
      )}
      <div>
        <Button onClick={create} loading={busy} disabled={!beds.length || tooMany}>
          {t('wizard.beds.create')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Setup wizard (design board "Setup wizard"): the steps a new hospital goes through once, each
 * with the same editors as Hospital settings and Masters, and a status worked out from what is
 * already set up, so the wizard can be left and resumed. The step is kept in the URL.
 */
export default function SetupWizardPage() {
  useAdminStrings();
  useStrings(addBillingStrings);
  const { t } = useTranslation();
  const [step, setStep] = useUrlState('step', 'profile');
  const current = STEPS.includes(step) ? step : 'profile';
  const entities = useEntitiesQuery();
  const branches = useBranchesQuery();
  const departments = useDepartmentsQuery({ limit: 1 });
  const wards = useMastersQuery({ type: 'wards', limit: 100 });
  const beds = useMastersQuery({ type: 'beds', limit: 1 });
  const services = useMastersQuery({ type: 'services', limit: 1 });
  const users = useUsersQuery({ limit: 1 });

  const state = useMemo(() => {
    const ent = Array.isArray(entities.data) ? entities.data : (entities.data?.items ?? []);
    const nBranches = count(branches.data);
    const nDepartments = count(departments.data);
    const nWards = count(wards.data);
    const nBeds = count(beds.data);
    const nServices = count(services.data);
    const nUsers = count(users.data);
    return {
      profile: {
        done: ent.some((e) => e.gstin),
        text: ent.some((e) => e.gstin) ? t('wizard.status.profile') : '',
      },
      branches: { done: nBranches > 0, text: t('wizard.status.branches', { count: nBranches }) },
      departments: {
        done: nDepartments > 0,
        text: t('wizard.status.departments', { count: nDepartments }),
      },
      wards: { done: nBeds > 0, text: t('wizard.status.wards', { wards: nWards, beds: nBeds }) },
      masters: { done: nServices > 0, text: t('wizard.status.masters', { count: nServices }) },
      staff: { done: nUsers > 1, text: t('wizard.status.staff', { count: nUsers }) },
      print: { done: true, text: '' },
      integrations: { done: false, text: '' },
      golive: { done: false, text: '' },
    };
  }, [
    entities.data,
    branches.data,
    departments.data,
    wards.data,
    beds.data,
    services.data,
    users.data,
    t,
  ]);
  const ready = REQUIRED.every((s) => state[s].done);
  const doneCount = STEPS.filter((s) => s !== 'golive' && state[s].done).length + (ready ? 1 : 0);
  const idx = STEPS.indexOf(current);

  const body = {
    profile: (
      <div className="flex flex-col gap-4">
        <HospitalTab />
        <EntitiesTab />
      </div>
    ),
    branches: <BranchesTab />,
    departments: <DepartmentsTab />,
    wards: (
      <div className="flex flex-col gap-4">
        <MasterTab type="wards" />
        <Card title={t('wizard.beds.title')}>
          <BedGenerator wards={wards.data?.items ?? []} />
        </Card>
        <MasterTab type="beds" />
      </div>
    ),
    masters: (
      <div className="flex flex-col gap-4">
        <MasterTab type="services" />
        <MasterTab type="price-lists" />
        <MasterTab type="tax-codes" />
      </div>
    ),
    staff: (
      <Card>
        <Link to="/settings/users" className="font-semibold text-primary hover:underline">
          {t('wizard.openUsers')}
        </Link>
      </Card>
    ),
    print: (
      <div className="flex flex-col gap-4">
        <BillConfigSection section="print" />
        <Card>
          <Link
            to="/settings/opd?tab=messages"
            className="font-semibold text-primary hover:underline"
          >
            {t('wizard.openMessages')}
          </Link>
        </Card>
      </div>
    ),
    integrations: (
      <Card>
        <ul className="divide-y divide-line">
          {['gateway', 'sms', 'whatsapp', 'abdm'].map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-ink">{t(`wizard.integrationList.${k}`)}</span>
              <StatusBadge tone="neutral" label={t('wizard.notConnected')} />
            </li>
          ))}
        </ul>
      </Card>
    ),
    golive: (
      <Card>
        <div className="flex flex-col gap-3">
          <Banner tone={ready ? 'success' : 'warning'}>
            {ready ? t('wizard.golive.ready') : t('wizard.golive.notReady')}
          </Banner>
          <ul className="divide-y divide-line">
            {REQUIRED.map((s) => (
              <li key={s} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <button
                  type="button"
                  className="cursor-pointer text-left font-semibold text-ink hover:underline"
                  onClick={() => setStep(s)}
                >
                  {t(`wizard.steps.${s}`)}
                </button>
                <StatusBadge
                  tone={state[s].done ? 'success' : 'warning'}
                  label={state[s].done ? t('wizard.done') : t('wizard.todo')}
                />
              </li>
            ))}
          </ul>
        </div>
      </Card>
    ),
  };

  return (
    <Page>
      <PageHeader
        title={t('wizard.title')}
        description={t('wizard.description')}
        actions={
          <span className="text-sm text-muted">
            {t('wizard.progress', { done: doneCount, total: STEPS.length })}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav aria-label={t('wizard.stepsLabel')}>
          <ol className="flex flex-col gap-1">
            {STEPS.map((s, i) => {
              const done = s === 'golive' ? ready : state[s].done;
              return (
                <li key={s}>
                  <button
                    type="button"
                    aria-current={s === current ? 'step' : undefined}
                    onClick={() => setStep(s)}
                    className={cn(
                      'flex w-full cursor-pointer items-start gap-2 rounded-control px-3 py-2 text-left',
                      s === current ? 'bg-info-bg' : 'hover:bg-neutral-bg',
                    )}
                  >
                    {done ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-success"
                      />
                    ) : (
                      <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                    )}
                    <span className="flex flex-col">
                      <span className="font-semibold text-ink">
                        {i + 1}. {t(`wizard.steps.${s}`)}
                      </span>
                      <span className="text-sm text-muted">
                        {done
                          ? state[s].text || t('wizard.done')
                          : REQUIRED.includes(s) || s === 'golive'
                            ? t('wizard.todo')
                            : t('wizard.optional')}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <section aria-labelledby="wizard-step" className="flex min-w-0 flex-col gap-4">
          <div>
            <h2 id="wizard-step" className="text-lg font-semibold text-ink">
              {idx + 1}. {t(`wizard.steps.${current}`)}
            </h2>
            <p className="text-muted">{t(`wizard.hints.${current}`)}</p>
          </div>
          {body[current]}
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="secondary"
              disabled={idx === 0}
              onClick={() => setStep(STEPS[idx - 1])}
            >
              {t('wizard.back')}
            </Button>
            {idx < STEPS.length - 1 && (
              <Button onClick={() => setStep(STEPS[idx + 1])}>{t('wizard.next')}</Button>
            )}
          </div>
        </section>
      </div>
    </Page>
  );
}
