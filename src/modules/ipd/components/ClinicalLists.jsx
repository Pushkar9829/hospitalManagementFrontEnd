import { useTranslation } from 'react-i18next';
import { EmptyState, StatusBadge } from '@hms/ui';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDateTime, fmtTime, localeOf } from '../../dx-kit/format.js';
import { useNotesQuery, useVitalsQuery } from '../api.js';
import { RISK_TONE } from '../ipd.js';

/** The stay's notes, newest first (signed on save; addenda listed under each). */
export function NotesList({ admissionId, kind }) {
  const { t, i18n } = useTranslation();
  const notes = useNotesQuery({ id: admissionId, kind });
  return (
    <QueryView
      query={notes}
      empty={<EmptyState bordered={false} title={t('ipd.notes.none')} />}
      isEmpty={(d) => !d.items.length}
    >
      {(d) => (
        <ol className="flex flex-col gap-3">
          {d.items.map((n) => (
            <li key={n.id} className="rounded-control border border-line p-3">
              <p className="text-sm text-muted">
                {t(`ipd.notes.kind.${n.kind}`)} · {n.by} · {fmtDateTime(n.at, localeOf(i18n))}
              </p>
              {n.text && <p className="mt-1 whitespace-pre-line text-ink">{n.text}</p>}
              {n.data && (
                <dl className="mt-1 grid grid-cols-[10rem_1fr] gap-x-3 text-sm">
                  {Object.entries(n.data).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">
                        {t(`ipd.notes.field.${k}`, { defaultValue: k })}
                      </dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {n.addenda.map((a) => (
                <p key={a.at} className="mt-2 border-l-2 border-line-strong pl-2 text-sm">
                  {a.text} <span className="text-muted">· {a.by}</span>
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </QueryView>
  );
}

/** Observation chart with NEWS2 (newest first). */
export function VitalsTable({ admissionId }) {
  const { t, i18n } = useTranslation();
  const vitals = useVitalsQuery(admissionId);
  return (
    <QueryView
      query={vitals}
      empty={<EmptyState bordered={false} title={t('ipd.vitals.none')} />}
      isEmpty={(d) => !d.items.length}
    >
      {(d) => (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t('ipd.vitals.title')}</caption>
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                {['time', 'temp', 'hr', 'bp', 'rr', 'spo2', 'avpu', 'news2', 'by'].map((k) => (
                  <th key={k} className="px-3 py-2 font-semibold">
                    {t(`ipd.vitals.col.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.items.map((v) => (
                <tr key={v.id}>
                  <td className="tabular px-3 py-2">{fmtTime(v.at, localeOf(i18n))}</td>
                  <td className="tabular px-3 py-2">{v.tempC ?? '-'}</td>
                  <td className="tabular px-3 py-2">{v.hr ?? '-'}</td>
                  <td className="tabular px-3 py-2">{v.sbp ? `${v.sbp}/${v.dbp ?? '-'}` : '-'}</td>
                  <td className="tabular px-3 py-2">{v.rr ?? '-'}</td>
                  <td className="tabular px-3 py-2">
                    {v.spo2 != null ? `${v.spo2}%${v.onOxygen ? ' O₂' : ''}` : '-'}
                  </td>
                  <td className="px-3 py-2">{v.consciousness}</td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      tone={RISK_TONE[v.risk]}
                      label={`${v.news2} · ${t(`ipd.news2.risk.${v.risk}`)}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-muted">{v.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </QueryView>
  );
}
