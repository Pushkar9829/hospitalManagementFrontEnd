import { useMemo, useState } from 'react';
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
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import {
  addDays,
  mondayOf,
  todayIST,
  useDecideSwapMutation,
  useEmployeesQuery,
  useRosterQuery,
  useSaveRosterMutation,
  useSwapsQuery,
} from '../api.js';

const weekday = (d, locale) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T12:00:00Z`),
  );

function Grid({ unit, from }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const q = useRosterQuery({ unit, from });
  const staff = useEmployeesQuery({}, { skip: !can('hr:roster:write') });
  const [edits, setEdits] = useState({});
  const [extra, setExtra] = useState([]);
  const [adding, setAdding] = useState('');
  const [failure, setFailure] = useState(null);
  const [save, saving] = useSaveRosterMutation();
  const d = q.data;
  const rows = useMemo(() => {
    if (!d) return [];
    const have = new Set(d.rows.map((r) => r.employee.id));
    return [
      ...d.rows,
      ...extra
        .filter((e) => !have.has(e.id))
        .map((e) => ({
          employee: { id: e.id, empNo: e.empNo, name: e.name, designation: e.designation },
          cells: d.days.map((date) => ({ date, shift: null, onLeave: false })),
        })),
    ];
  }, [d, extra]);
  if (!d) return <QueryView query={q} rows={6} />;
  const codes = [...d.shifts.map((s) => s.code), 'OFF'];
  const shiftOf = (empId, c) => edits[`${empId}|${c.date}`] ?? c.shift ?? '';
  const cover = (date, code) =>
    rows.filter((r) => {
      const c = r.cells.find((x) => x.date === date);
      return !c.onLeave && shiftOf(r.employee.id, c) === code;
    }).length;
  const changed = Object.entries(edits).map(([k, shift]) => {
    const [employeeId, date] = k.split('|');
    return { employeeId, date, shift };
  });
  const editable = can('hr:roster:write');
  return (
    <div className="flex flex-col gap-3">
      {failure && <ApiErrorNotice error={failure} />}
      {!rows.length && <EmptyState bordered={false} title={t('roster.empty')} />}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">{t('roster.caption', { unit })}</caption>
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">{t('hr.col.name')}</th>
                {d.days.map((day) => (
                  <th key={day} className="px-1 py-2 text-center font-semibold">
                    {weekday(day, localeOf(i18n))}
                    <span className="block text-xs font-normal">{day.slice(8)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.employee.id}>
                  <th scope="row" className="px-2 py-1 text-left font-normal">
                    {r.employee.name}
                    <span className="block text-xs text-muted">{r.employee.designation}</span>
                  </th>
                  {r.cells.map((c) => (
                    <td key={c.date} className="px-1 py-1 text-center">
                      {c.onLeave ? (
                        <span className="block rounded bg-info-bg px-1 py-1 text-xs font-semibold text-info">
                          {t('roster.leave')}
                        </span>
                      ) : editable ? (
                        <select
                          aria-label={t('roster.cell', { name: r.employee.name, date: c.date })}
                          className="w-full rounded-control border border-line bg-surface px-1 py-1 text-xs"
                          value={shiftOf(r.employee.id, c)}
                          onChange={(e) =>
                            setEdits((s) => ({
                              ...s,
                              [`${r.employee.id}|${c.date}`]: e.target.value,
                            }))
                          }
                        >
                          <option value="">–</option>
                          {codes.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-semibold">{c.shift ?? '–'}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-2 text-xs text-muted">
              {d.shifts.map((s) => (
                <tr key={s.code}>
                  <th scope="row" className="px-2 py-1 text-left font-normal">
                    {t('roster.coverRow', { code: s.code, name: s.name })}
                  </th>
                  {d.days.map((day) => {
                    const n = cover(day, s.code);
                    return (
                      <td
                        key={day}
                        className={`tabular px-1 py-1 text-center ${n < d.minPerShift ? 'font-semibold text-critical' : ''}`}
                      >
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        {d.shifts.map((s) => `${s.code} ${s.name} ${s.start}–${s.end}`).join(' · ')}
      </p>
      {editable && (
        <div className="flex flex-wrap items-end gap-3">
          <FormField label={t('roster.addStaff')} className="w-72">
            <Select
              value={adding}
              placeholder={t('roster.pickStaff')}
              onChange={(e) => setAdding(e.target.value)}
              options={(staff.data?.items ?? [])
                .filter((e) => !rows.some((r) => r.employee.id === e.id))
                .map((e) => ({ value: e.id, label: `${e.name} · ${e.designation ?? e.empNo}` }))}
            />
          </FormField>
          <Button
            variant="secondary"
            disabled={!adding}
            onClick={() => {
              const e = staff.data.items.find((x) => x.id === adding);
              setExtra((x) => [...x, e]);
              setAdding('');
            }}
          >
            {t('roster.add')}
          </Button>
          <Button
            className="ml-auto"
            disabled={!changed.length}
            loading={saving.isLoading}
            onClick={async () => {
              setFailure(null);
              try {
                await save({ unit, cells: changed }).unwrap();
                setEdits({});
                setExtra([]);
                toast({ tone: 'success', title: t('roster.saved', { count: changed.length }) });
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('roster.save', { count: changed.length })}
          </Button>
        </div>
      )}
    </div>
  );
}

function Swaps() {
  const { t } = useTranslation();
  const q = useSwapsQuery({ status: 'PENDING' });
  const [decide, state] = useDecideSwapMutation();
  const [failure, setFailure] = useState(null);
  return (
    <Card title={t('roster.swaps')}>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView query={q} rows={2} empty={t('roster.noSwaps')} isEmpty={(d) => !d.items.length}>
        {(d) => (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {d.items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-56 flex-1">
                  {t('roster.swapLine', {
                    from: s.from,
                    to: s.to,
                    date: fmtDate(s.date),
                    a: s.fromShift ?? '–',
                    b: s.toShift ?? '–',
                  })}
                  {s.reason && <span className="block text-muted">{s.reason}</span>}
                </span>
                {[true, false].map((approve) => (
                  <Button
                    key={String(approve)}
                    size="sm"
                    variant={approve ? 'primary' : 'secondary'}
                    disabled={state.isLoading}
                    onClick={async () => {
                      setFailure(null);
                      try {
                        await decide({ id: s.id, approve }).unwrap();
                      } catch (err) {
                        setFailure(err);
                      }
                    }}
                  >
                    {t(approve ? 'hr.leave.approve' : 'hr.leave.reject')}
                  </Button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </Card>
  );
}

/**
 * Shift roster (board Roster, route /hr/rosters): a unit's week, one shift per person per day,
 * cover per shift against the minimum, staff on approved leave marked, and swap approvals.
 */
export default function RosterPage() {
  useStrings(addDxkitStrings, addPeopleStrings);
  const { t } = useTranslation();
  const can = useCan();
  const [unit, setUnit] = useUrlState('unit', '');
  const [draft, setDraft] = useState(unit);
  const [from, setFrom] = useUrlState('from', mondayOf(todayIST()));
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('hr.crumb') }, { label: t('roster.title') }]}
        title={t('roster.title')}
        description={t('roster.description')}
      />
      <div className="flex flex-wrap items-end gap-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setUnit(draft.trim());
          }}
        >
          <FormField label={t('roster.unit')} className="w-60">
            <Input
              value={draft}
              placeholder={t('roster.unitHint')}
              onChange={(e) => setDraft(e.target.value)}
            />
          </FormField>
          <Button type="submit" variant="secondary" disabled={draft.trim().length < 2}>
            {t('roster.open')}
          </Button>
        </form>
        <div className="flex items-end gap-2">
          <Button variant="ghost" onClick={() => setFrom(addDays(from, -7))}>
            {t('roster.prev')}
          </Button>
          <FormField label={t('roster.week')} className="w-44">
            <Input
              type="date"
              value={from}
              onChange={(e) => e.target.value && setFrom(mondayOf(e.target.value))}
            />
          </FormField>
          <Button variant="ghost" onClick={() => setFrom(addDays(from, 7))}>
            {t('roster.next')}
          </Button>
        </div>
      </div>
      {unit.length >= 2 ? (
        <Grid key={`${unit}|${from}`} unit={unit} from={from} />
      ) : (
        <Banner tone="info">{t('roster.pickUnit')}</Banner>
      )}
      {can('hr:roster:write') && <Swaps />}
    </Page>
  );
}
