import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addOpdStrings } from '@hms/i18n/opd';
import { cn } from '@hms/ui';
import { selectSession } from '../../../app/session.js';
import { useRealtime } from '../../../app/realtime.js';
import { useStrings } from '../../../lib/useStrings.js';
import { fmtTime, localeOf } from '../../dx-kit/format.js';
import { useQueueDisplayQuery } from '../api.js';

const POLL_MS = 10_000;
const STALE_MS = 60_000;
const FLASH_MS = 12_000;

/** The wall clock, refreshed every 20 seconds. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Rooms whose "now" token changed since the last poll, kept for FLASH_MS so the card stands out
 * and the change is read out once (aria-live).
 */
function useCalled(rooms) {
  const last = useRef(null);
  const [called, setCalled] = useState([]);
  useEffect(() => {
    if (!rooms) return undefined;
    const prev = last.current;
    last.current = Object.fromEntries(rooms.map((r) => [r.doctor.id, r.now]));
    if (!prev) return undefined;
    const fresh = rooms.filter((r) => r.now && prev[r.doctor.id] !== r.now);
    if (!fresh.length) return undefined;
    setCalled(fresh.map((r) => ({ id: r.doctor.id, token: r.now, room: r.doctor.room })));
    const id = setTimeout(() => setCalled([]), FLASH_MS);
    return () => clearTimeout(id);
  }, [rooms]);
  return called;
}

function RoomCard({ room, flash }) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-card border-2 bg-surface p-5 transition-colors',
        flash ? 'border-accent shadow-card' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold text-ink">{room.doctor.name}</p>
          <p className="truncate text-lg text-muted">{room.doctor.department}</p>
        </div>
        <p className="shrink-0 rounded-control bg-primary px-3 py-1 text-xl font-semibold text-on-primary">
          {t('opd.tv.room', { room: room.doctor.room })}
        </p>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-base font-semibold tracking-wide text-muted uppercase">
            {t('opd.tv.now')}
          </p>
          <p className="font-mono text-6xl leading-none font-bold text-ink">
            {room.now ?? <span className="text-4xl text-muted">{t('opd.tv.none')}</span>}
          </p>
        </div>
        <p className="text-right text-xl text-muted">
          {t('opd.tv.next')}{' '}
          <span className="font-mono font-semibold text-ink">{room.next ?? '-'}</span>
        </p>
      </div>
      {flash && (
        <p className="text-lg font-semibold text-accent">
          {t('opd.tv.pleaseGo', { token: room.now, room: room.doctor.room })}
        </p>
      )}
    </li>
  );
}

/**
 * Queue TV (board QueueTV, route /display/queue): the waiting-area screen. Full screen, no menu;
 * works for a signed-in desk user or with the TV's display key (?key=…, sent as X-Display-Key).
 * Polls GET /opd/queue/display every 10 seconds (the Socket.IO "queue:update" push replaces the
 * poll when the web app gets its realtime client). A failed poll keeps the last queue on screen
 * with a "reconnecting" line, so the TV never goes blank.
 */
export default function QueueTvPage() {
  useStrings(addOpdStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [params] = useSearchParams();
  const key = params.get('key') ?? '';
  const session = useSelector(selectSession).data;
  const ready = Boolean(key || session);
  // Signed-in TVs get pushes; a key-only TV keeps polling.
  useRealtime(Boolean(session));
  const now = useNow();
  const display = useQueueDisplayQuery(
    { key },
    { skip: !ready, pollingInterval: POLL_MS, skipPollingIfUnfocused: false },
  );
  const data = display.data;
  const called = useCalled(data?.rooms);
  const stale =
    display.isError ||
    (data && now - new Date(display.fulfilledTimeStamp ?? data.updatedAt) > STALE_MS);
  const hospital = data?.hospital ?? session?.tenant?.name ?? '';

  if (!ready)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ground p-8">
        <div className="max-w-xl text-center">
          <h1 className="text-3xl font-semibold text-ink">{t('opd.tv.notSetUp')}</h1>
          <p className="mt-3 text-lg text-muted">{t('opd.tv.notSetUpHint')}</p>
        </div>
      </main>
    );

  return (
    <main className="flex min-h-dvh flex-col bg-ground">
      <header className="flex items-center justify-between gap-4 bg-primary px-8 py-4 text-on-primary">
        <h1 className="text-3xl font-semibold">
          {[hospital, data?.title].filter(Boolean).join(' · ') || t('opd.tv.title')}
        </h1>
        <p className="font-mono text-4xl font-semibold" aria-label={t('opd.tv.time')}>
          {fmtTime(now, locale)}
        </p>
      </header>

      {stale && (
        <p role="status" className="bg-warning-bg px-8 py-2 text-lg text-warning">
          {data
            ? t('opd.tv.stale', { time: fmtTime(data.updatedAt, locale) })
            : t('opd.tv.connecting')}
        </p>
      )}

      <div aria-live="polite" className="sr-only">
        {called.map((c) => t('opd.tv.pleaseGo', { token: c.token, room: c.room })).join('. ')}
      </div>

      <section className="flex-1 p-8">
        {data ? (
          <ul
            aria-label={t('opd.tv.rooms')}
            className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3"
          >
            {data.rooms.map((r) => (
              <RoomCard
                key={r.doctor.id}
                room={r}
                flash={called.some((c) => c.id === r.doctor.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-2xl text-muted">{t('opd.tv.connecting')}</p>
        )}
      </section>

      <footer className="border-t border-line bg-surface px-8 py-4 text-xl text-ink">
        {[
          ...(data?.counters ?? []).map((c) =>
            t('opd.tv.counter', {
              name: t(`opd.tv.counters.${c.name}`, { defaultValue: c.name }),
              token: c.current,
            }),
          ),
          t('opd.tv.keepSlip'),
        ].join(' · ')}
      </footer>
    </main>
  );
}
