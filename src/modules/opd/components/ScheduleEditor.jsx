import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Banner, Button, Card, Checkbox, FormField, IconButton, Input, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inr, parseRupees, rupeesText } from '../../../lib/money.js';
import { useSaveScheduleMutation } from '../api.js';
import { approvalIdOf, checkWeek, newSession } from '../opdSettings.js';
import { WEEKDAYS } from '../schedule.js';
import { BlockLeaveDialog } from './BlockLeaveDialog.jsx';

const FEES = ['NEW', 'FOLLOW_UP', 'TELE'];

/** One session row: times, room, slot lengths, the cap, overbooking, online and tele. */
function SessionRow({ day, s, onChange, onRemove, errors }) {
  const { t } = useTranslation();
  const label = (k) => `${t(`opd.cfg.sched.${k}`)}, ${t(`opd.days.long.${day}`)} ${s.start}`;
  const num = (k) => (e) =>
    onChange({ ...s, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  return (
    <tr className="align-top">
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <Input
            type="time"
            aria-label={label('start')}
            value={s.start}
            invalid={Boolean(errors?.time)}
            onChange={(e) => onChange({ ...s, start: e.target.value })}
          />
          <span aria-hidden="true">–</span>
          <Input
            type="time"
            aria-label={label('end')}
            value={s.end}
            invalid={Boolean(errors?.time)}
            onChange={(e) => onChange({ ...s, end: e.target.value })}
          />
        </div>
        {errors?.time && <p className="mt-1 text-sm text-critical">{t(errors.time)}</p>}
      </td>
      <td className="w-20 px-2 py-2">
        <Input
          aria-label={label('room')}
          value={s.room}
          onChange={(e) => onChange({ ...s, room: e.target.value })}
        />
      </td>
      <td className="w-36 px-2 py-2">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={5}
            aria-label={label('slotNew')}
            value={s.slotNew}
            onChange={num('slotNew')}
          />
          <span aria-hidden="true">/</span>
          <Input
            type="number"
            min={5}
            aria-label={label('slotFollowUp')}
            value={s.slotFollowUp}
            onChange={num('slotFollowUp')}
          />
        </div>
        {errors?.slot && <p className="mt-1 text-sm text-critical">{t(errors.slot)}</p>}
      </td>
      <td className="w-20 px-2 py-2">
        <Input
          type="number"
          min={1}
          aria-label={label('max')}
          value={s.max}
          onChange={num('max')}
        />
      </td>
      <td className="w-20 px-2 py-2">
        <Input
          type="number"
          min={0}
          max={5}
          aria-label={label('overbook')}
          value={s.overbook}
          onChange={num('overbook')}
        />
      </td>
      <td className="px-2 py-2">
        <Checkbox
          label={t('opd.cfg.sched.online')}
          checked={s.online}
          onChange={(e) => onChange({ ...s, online: e.target.checked })}
        />
      </td>
      <td className="px-2 py-2">
        <Checkbox
          label={t('opd.cfg.sched.tele')}
          checked={s.tele}
          onChange={(e) => onChange({ ...s, tele: e.target.checked })}
        />
      </td>
      <td className="px-2 py-2">
        <IconButton
          size="sm"
          label={t('opd.cfg.sched.removeSession', {
            day: t(`opd.days.long.${day}`),
            start: s.start,
          })}
          icon={<X size={16} aria-hidden="true" />}
          onClick={onRemove}
        />
      </td>
    </tr>
  );
}

/**
 * A doctor's weekly schedule and fees (PUT /opd/schedules/{doctorId}). Times and fees are
 * edited locally and saved together; a fee change comes back 202 and waits for Super Admin.
 */
export function ScheduleEditor({ schedule, canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [save, saveState] = useSaveScheduleMutation();
  const [week, setWeek] = useState(() =>
    WEEKDAYS.map((d) => schedule.week.find((w) => w.day === d) ?? { day: d, sessions: [] }),
  );
  const [fees, setFees] = useState(() =>
    Object.fromEntries(FEES.map((k) => [k, rupeesText(schedule.fees[k])])),
  );
  const [followUp, setFollowUp] = useState(() => ({ ...schedule.followUp }));
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  // The fee change just sent (202), or one already waiting when the schedule loaded.
  const [sent, setSent] = useState(null);
  const [blocking, setBlocking] = useState(false);
  const pending = sent ?? schedule.pendingFeeChange;

  const setDay = (day, sessions) =>
    setWeek((w) => w.map((x) => (x.day === day ? { ...x, sessions } : x)));

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    const weekErrors = checkWeek(week);
    const feeErrors = Object.fromEntries(
      FEES.map((k) => [
        k,
        Number.isNaN(parseRupees(fees[k])) || parseRupees(fees[k]) == null
          ? 'opd.cfg.errors.fee'
          : null,
      ]).filter(([, v]) => v),
    );
    setErrors({ week: weekErrors, fees: feeErrors });
    if (Object.keys(weekErrors).length || Object.keys(feeErrors).length) return;
    try {
      const feesPaise = Object.fromEntries(FEES.map((k) => [k, parseRupees(fees[k])]));
      const r = await save({
        doctorId: schedule.doctorId,
        week,
        fees: feesPaise,
        followUp: { days: Number(followUp.days) || 0, visits: Number(followUp.visits) || 0 },
      }).unwrap();
      const id = approvalIdOf(r);
      if (id) setSent({ approvalId: id, fees: feesPaise });
      toast({
        tone: 'success',
        title: t(id ? 'opd.cfg.sched.savedPending' : 'opd.cfg.sched.saved', {
          name: schedule.doctor.name,
        }),
      });
    } catch (err) {
      setFailure(err);
    }
  };

  return (
    <Card
      title={t('opd.cfg.sched.weekTitle', { name: schedule.doctor.name })}
      description={t('opd.cfg.sched.weekHint')}
      actions={
        canEdit && (
          <Button variant="secondary" onClick={() => setBlocking(true)}>
            {t('opd.cfg.sched.block')}
          </Button>
        )
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {pending && (
          <PendingApprovalNotice approvalId={pending.approvalId}>
            {t('opd.cfg.sched.feePending', {
              fees:
                FEES.filter(
                  (k) => pending?.fees?.[k] != null && pending.fees[k] !== schedule.fees[k],
                )
                  .map((k) => `${t(`opd.cfg.sched.fees.${k}`)} ${inr(pending.fees[k])}`)
                  .join(', ') || t('opd.cfg.sched.feesChanged'),
            })}
          </PendingApprovalNotice>
        )}
        <ApiErrorNotice error={failure} />
        <fieldset disabled={!canEdit} className="contents">
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-[60rem] text-sm">
              <caption className="sr-only">
                {t('opd.cfg.sched.weekTitle', { name: schedule.doctor.name })}
              </caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-2 py-2 font-semibold">{t('opd.cfg.sched.session')}</th>
                  <th className="px-2 py-2 font-semibold">{t('opd.cfg.sched.room')}</th>
                  <th className="px-2 py-2 font-semibold">{t('opd.cfg.sched.slot')}</th>
                  <th className="px-2 py-2 font-semibold">{t('opd.cfg.sched.max')}</th>
                  <th className="px-2 py-2 font-semibold">{t('opd.cfg.sched.overbook')}</th>
                  <th className="px-2 py-2 font-semibold">{t('opd.cfg.sched.online')}</th>
                  <th className="px-2 py-2 font-semibold">{t('opd.cfg.sched.tele')}</th>
                  <th className="px-2 py-2">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              {week.map((w) => (
                <tbody key={w.day} className="border-t border-line">
                  <tr className="bg-surface">
                    <th scope="rowgroup" colSpan={8} className="px-2 pt-3 pb-1 text-left">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">
                          {t(`opd.days.long.${w.day}`)}
                          {!w.sessions.length && (
                            <span className="ml-2 font-normal text-muted">
                              {t('opd.days.none')}
                            </span>
                          )}
                        </span>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setDay(w.day, [...w.sessions, newSession(w.sessions, schedule)])
                            }
                          >
                            <Plus size={14} aria-hidden="true" />
                            {t('opd.cfg.sched.addSession', { day: t(`opd.days.long.${w.day}`) })}
                          </Button>
                        )}
                      </span>
                    </th>
                  </tr>
                  {w.sessions.map((s, i) => (
                    <SessionRow
                      key={i}
                      day={w.day}
                      s={s}
                      errors={errors.week?.[`${w.day}.${i}`]}
                      onChange={(next) =>
                        setDay(
                          w.day,
                          w.sessions.map((x, j) => (j === i ? next : x)),
                        )
                      }
                      onRemove={() =>
                        setDay(
                          w.day,
                          w.sessions.filter((_, j) => j !== i),
                        )
                      }
                    />
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          <section aria-labelledby="fees-heading" className="flex flex-col gap-3">
            <h3 id="fees-heading" className="text-base font-semibold text-ink">
              {t('opd.cfg.sched.feesTitle')}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {FEES.map((k) => (
                <FormField
                  key={k}
                  label={t(`opd.cfg.sched.fees.${k}`)}
                  error={errors.fees?.[k] ? t(errors.fees[k]) : undefined}
                >
                  <Input
                    inputMode="decimal"
                    value={fees[k]}
                    onChange={(e) => setFees((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </FormField>
              ))}
              <FormField label={t('opd.cfg.sched.freeDays')}>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={followUp.days}
                  onChange={(e) => setFollowUp((f) => ({ ...f, days: e.target.value }))}
                />
              </FormField>
              <FormField label={t('opd.cfg.sched.freeVisits')}>
                <Input
                  type="number"
                  min={0}
                  max={3}
                  value={followUp.visits}
                  onChange={(e) => setFollowUp((f) => ({ ...f, visits: e.target.value }))}
                />
              </FormField>
            </div>
            <Banner tone="info">{t('opd.cfg.sched.feeHint')}</Banner>
          </section>
        </fieldset>
        {canEdit && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" loading={saveState.isLoading}>
              {t('opd.cfg.sched.save')}
            </Button>
          </div>
        )}
      </form>
      <BlockLeaveDialog open={blocking} onOpenChange={setBlocking} doctorId={schedule.doctorId} />
    </Card>
  );
}
