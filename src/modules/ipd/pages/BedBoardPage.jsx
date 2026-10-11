import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  cn,
  useToast,
} from '@hms/ui';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtTime, localeOf } from '../../dx-kit/format.js';
import {
  useAdmissionsQuery,
  useBedBoardQuery,
  useBlockBedMutation,
  useCleaningDoneMutation,
  useCleaningTasksQuery,
  useUnblockBedMutation,
} from '../api.js';
import { BED_TILE, BED_TONE, CATEGORIES, isTodayIST } from '../ipd.js';

const STATES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'BLOCKED'];

/** The selected bed: who is in it and what can be done. */
function BedPanel({ bed, ward }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [blocking, setBlocking] = useState(false);
  const [block] = useBlockBedMutation();
  const [unblock] = useUnblockBedMutation();
  const [clean] = useCleaningDoneMutation();
  const tasks = useCleaningTasksQuery({ status: 'OPEN' }, { skip: bed.status !== 'CLEANING' });
  const task = tasks.data?.items.find((x) => x.bedId === bed.id);
  const s = bed.stay;
  return (
    <Card
      title={t('ipd.beds.bedTitle', { code: bed.code })}
      description={`${ward.name} · ${t(`ipd.category.${ward.category}`)}`}
    >
      <div className="flex flex-col gap-3">
        <StatusBadge tone={BED_TONE[bed.status]} label={t(`ipd.bedStatus.${bed.status}`)} />
        {s ? (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted">{t('ipd.beds.patient')}</dt>
            <dd className="font-semibold text-ink">
              {s.patient.name} · {s.patient.age} ·{' '}
              <span className="font-mono">{s.patient.uhid}</span>
            </dd>
            <dt className="text-muted">{t('ipd.beds.ipNo')}</dt>
            <dd className="font-mono">{s.ipNo}</dd>
            <dt className="text-muted">{t('ipd.beds.consultant')}</dt>
            <dd>{s.consultant}</dd>
            <dt className="text-muted">{t('ipd.beds.day')}</dt>
            <dd>{t('ipd.beds.dayN', { n: s.day })}</dd>
            <dt className="text-muted">{t('ipd.beds.payer')}</dt>
            <dd>{t(`ipd.payer.${s.payer}`)}</dd>
            {s.dischargeExpected && (
              <>
                <dt className="text-muted">{t('ipd.beds.discharge')}</dt>
                <dd>{fmtTime(s.dischargeExpected, localeOf(i18n))}</dd>
              </>
            )}
          </dl>
        ) : bed.status === 'RESERVED' ? (
          <p className="text-sm text-muted">
            {t('ipd.beds.reservedUntil', { time: fmtTime(bed.reservedUntil, localeOf(i18n)) })}
          </p>
        ) : bed.status === 'BLOCKED' ? (
          <p className="text-sm text-muted">{bed.blockedReason}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {s && (
            <Link
              className="text-sm font-semibold text-primary underline"
              to={`/nursing/${ward.id}`}
            >
              {t('ipd.beds.openNursing')}
            </Link>
          )}
          {s && can('ipd:bed:allocate') && (
            <Link
              className="text-sm font-semibold text-primary underline"
              to={`/ipd/bed-requests?transfer=${s.admissionId}`}
            >
              {t('ipd.beds.transfer')}
            </Link>
          )}
          {bed.status === 'AVAILABLE' && can('ipd:bed:block') && (
            <Button size="sm" variant="secondary" onClick={() => setBlocking(true)}>
              {t('ipd.beds.block')}
            </Button>
          )}
          {bed.status === 'BLOCKED' && can('ipd:bed:block') && (
            <Button size="sm" variant="secondary" onClick={() => unblock({ id: bed.id })}>
              {t('ipd.beds.unblock')}
            </Button>
          )}
          {bed.status === 'CLEANING' && task && can('ipd:bed:clean') && (
            <Button
              size="sm"
              onClick={async () => {
                await clean({ id: task.id }).unwrap();
                toast({ tone: 'success', title: t('ipd.beds.cleaned', { code: bed.code }) });
              }}
            >
              {t('ipd.beds.cleaningDone', { min: task.minutes })}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={blocking}
        onOpenChange={setBlocking}
        title={t('ipd.beds.blockTitle', { code: bed.code })}
        description={t('ipd.beds.blockHint')}
        confirmLabel={t('ipd.beds.block')}
        reasonLabel={t('ipd.beds.reason')}
        destructive={false}
        onConfirm={async (reason) => {
          await block({ id: bed.id, reason }).unwrap();
          toast({ tone: 'success', title: t('ipd.beds.blocked', { code: bed.code }) });
        }}
      />
    </Card>
  );
}

/**
 * Bed board (board Beds, route /ipd/beds): every ward's beds with their state and patient, live
 * over the socket. Picking a bed shows who is in it and the actions the role may take.
 */
export default function BedBoardPage() {
  useStrings(addDxkitStrings, addIpdStrings);
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useUrlState('category', '');
  const [selected, setSelected] = useUrlState('bed', '');
  const board = useBedBoardQuery({ category: category || undefined }, { pollingInterval: 60_000 });
  const stays = useAdmissionsQuery({ status: 'DISCHARGE_PLANNED,DISCHARGE_STARTED', limit: 50 });
  const due = (stays.data?.items ?? []).filter((a) => isTodayIST(a.expectedDischargeAt));
  const wards = board.data?.wards ?? [];
  const sel = wards.flatMap((w) => w.beds.map((b) => ({ b, w }))).find((x) => x.b.id === selected);

  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.beds.title') }]}
        title={t('ipd.beds.title')}
        description={t('ipd.beds.description')}
      />
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('ipd.beds.category')} className="w-56">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t('ipd.beds.allCategories')}
            options={CATEGORIES.map((c) => ({ value: c, label: t(`ipd.category.${c}`) }))}
          />
        </FormField>
        <span className="ml-auto text-sm text-muted" aria-live="polite">
          {board.fulfilledTimeStamp
            ? t('ipd.beds.updated', { time: fmtTime(board.fulfilledTimeStamp, localeOf(i18n)) })
            : ''}
        </span>
      </div>
      <QueryView
        query={board}
        rows={6}
        empty={<EmptyState title={t('ipd.beds.noWards')} description={t('ipd.beds.noWardsHint')} />}
        isEmpty={(d) => !d.wards.length}
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            <KpiRow
              className="xl:grid-cols-6"
              items={[
                ...STATES.map((s) => ({ label: t(`ipd.bedStatus.${s}`), value: d.totals[s] })),
                {
                  label: t('ipd.beds.occupancy'),
                  value: `${d.occupancy}%`,
                  sub: t('ipd.beds.ofBeds', { n: d.beds }),
                },
              ]}
            />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_22rem]">
              <div className="flex flex-col gap-4">
                {d.wards.map((w) => (
                  <Card
                    key={w.id}
                    title={w.name}
                    description={[
                      t(`ipd.category.${w.category}`),
                      w.floor && t('ipd.beds.floor', { floor: w.floor }),
                      w.gender !== 'ANY' && t(`ipd.gender.${w.gender}`),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    actions={
                      <span className="text-sm text-muted">
                        {t('ipd.beds.occupiedOf', { n: w.counts.OCCUPIED, total: w.beds.length })}
                      </span>
                    }
                  >
                    <ul
                      aria-label={w.name}
                      className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
                    >
                      {w.beds.map((b) => (
                        <li key={b.id}>
                          <button
                            type="button"
                            aria-current={selected === b.id ? 'true' : undefined}
                            onClick={() => setSelected(b.id)}
                            className={cn(
                              'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-control border-l-4 px-2.5 py-2 text-left text-sm',
                              BED_TILE[b.status],
                              selected === b.id && 'ring-2 ring-primary',
                            )}
                          >
                            <span className="font-mono font-semibold text-ink">{b.code}</span>
                            <span className="text-xs text-ink">
                              {t(`ipd.bedStatus.${b.status}`)}
                            </span>
                            <span className="truncate text-xs text-muted">
                              {b.stay?.patient.name ?? ' '}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
              <div className="flex flex-col gap-4">
                {sel ? (
                  <BedPanel key={sel.b.id} bed={sel.b} ward={sel.w} />
                ) : (
                  <EmptyState title={t('ipd.beds.pick')} />
                )}
                <Card title={t('ipd.beds.dueToday')}>
                  {due.length ? (
                    <ul className="flex flex-col gap-1 text-sm">
                      {due.map((a) => (
                        <li key={a.id}>
                          <span className="font-mono">{a.bed.code}</span> ·{' '}
                          {fmtTime(a.expectedDischargeAt, localeOf(i18n))} · {a.consultant?.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">{t('ipd.beds.noneDue')}</p>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </QueryView>
    </Page>
  );
}
