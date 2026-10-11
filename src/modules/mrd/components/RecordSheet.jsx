import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, FormField, Input, Sheet, StatusBadge, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import {
  RECORD_TONE,
  useCodeRecordMutation,
  useMrdIcd10Query,
  useMoveFileMutation,
  useMrdRecordQuery,
  useRecheckRecordMutation,
  useResolveItemMutation,
} from '../api.js';

function Checklist({ r }) {
  const { t } = useTranslation();
  const can = useCan();
  const [recheck, rechecking] = useRecheckRecordMutation();
  const [resolve, resolving] = useResolveItemMutation();
  const [note, setNote] = useState({});
  const [failure, setFailure] = useState(null);
  const run = async (fn) => {
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <Card
      title={t('mrd.rec.checklist')}
      actions={
        r.status !== 'CLOSED' && (
          <Button
            size="sm"
            variant="secondary"
            loading={rechecking.isLoading}
            onClick={() => run(() => recheck(r.id).unwrap())}
          >
            {t('mrd.rec.recheck')}
          </Button>
        )
      }
    >
      {failure && <ApiErrorNotice error={failure} />}
      <ul className="flex flex-col divide-y divide-line text-sm">
        {r.checklist.map((c) => (
          <li key={c.code} className="flex flex-wrap items-center gap-3 py-2">
            <StatusBadge
              tone={c.ok ? 'success' : 'warning'}
              label={c.ok ? t('mrd.rec.present') : t('mrd.rec.missing')}
            />
            <span className="min-w-48 flex-1">
              {c.label}
              {c.resolvedBy && (
                <span className="block text-xs text-muted">
                  {t('mrd.rec.resolvedBy', { by: c.resolvedBy, date: fmtDate(c.resolvedAt) })}
                  {c.note && ` · ${c.note}`}
                </span>
              )}
            </span>
            {!c.ok && can('mrd:record:update') && (
              <span className="flex items-end gap-2">
                <Input
                  aria-label={t('mrd.rec.fileNote', { item: c.label })}
                  placeholder={t('mrd.rec.fileNoteHint')}
                  className="w-48"
                  value={note[c.code] ?? ''}
                  onChange={(e) => setNote({ ...note, [c.code]: e.target.value })}
                />
                <Button
                  size="sm"
                  disabled={(note[c.code] ?? '').trim().length < 3 || resolving.isLoading}
                  onClick={() =>
                    run(() =>
                      resolve({ id: r.id, code: c.code, note: note[c.code].trim() }).unwrap(),
                    )
                  }
                >
                  {t('mrd.rec.markFiled')}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Coding({ r }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const search = useMrdIcd10Query(q, { skip: q.trim().length < 2 });
  const [dx, setDx] = useState(() =>
    r.diagnoses.map((d) => ({ code: d.code, name: d.name, primary: Boolean(d.primary) })),
  );
  const [proc, setProc] = useState({ code: '', name: '' });
  const [procs, setProcs] = useState(r.procedures);
  const [save, saving] = useCodeRecordMutation();
  const [failure, setFailure] = useState(null);
  return (
    <Card title={t('mrd.code.title')} description={t('mrd.code.hint')}>
      <div className="flex flex-col gap-3">
        {failure && <ApiErrorNotice error={failure} />}
        <FormField label={t('mrd.code.search')}>
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </FormField>
        {q.trim().length >= 2 && (
          <ul className="flex flex-wrap gap-2">
            {(search.data?.items ?? []).map((d) => (
              <li key={d.code}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDx((xs) =>
                      xs.some((x) => x.code === d.code)
                        ? xs
                        : [...xs, { ...d, primary: xs.length === 0 }],
                    )
                  }
                >
                  <span className="font-mono">{d.code}</span> {d.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ul className="flex flex-col gap-1 text-sm">
          {dx.map((d) => (
            <li key={d.code} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`primary-${r.id}`}
                  checked={d.primary}
                  onChange={() =>
                    setDx((xs) => xs.map((x) => ({ ...x, primary: x.code === d.code })))
                  }
                />
                {t('mrd.code.primary')}
              </label>
              <span className="font-mono">{d.code}</span>
              <span className="flex-1">{d.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDx((xs) => xs.filter((x) => x.code !== d.code))}
              >
                {t('mrd.remove')}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label={t('mrd.code.procCode')} className="w-28">
            <Input value={proc.code} onChange={(e) => setProc({ ...proc, code: e.target.value })} />
          </FormField>
          <FormField label={t('mrd.code.procName')} className="min-w-48 flex-1">
            <Input value={proc.name} onChange={(e) => setProc({ ...proc, name: e.target.value })} />
          </FormField>
          <Button
            variant="secondary"
            disabled={proc.name.trim().length < 2}
            onClick={() => {
              setProcs((ps) => [...ps, { code: proc.code.trim(), name: proc.name.trim() }]);
              setProc({ code: '', name: '' });
            }}
          >
            {t('mrd.code.addProc')}
          </Button>
        </div>
        {procs.length > 0 && (
          <p className="text-sm">{procs.map((p) => `${p.code} ${p.name}`.trim()).join(' · ')}</p>
        )}
        <Button
          className="self-start"
          loading={saving.isLoading}
          disabled={!dx.length || r.status === 'DEFICIENT'}
          onClick={async () => {
            setFailure(null);
            try {
              await save({ id: r.id, diagnoses: dx, procedures: procs }).unwrap();
              toast({ tone: 'success', title: t('mrd.code.closed', { ipNo: r.ipNo }) });
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t('mrd.code.close')}
        </Button>
      </div>
    </Card>
  );
}

function FileCard({ r }) {
  const { t } = useTranslation();
  const [move, state] = useMoveFileMutation();
  const [f, setF] = useState({ fileNo: '', rack: '', to: '' });
  const [failure, setFailure] = useState(null);
  const act = async (action) => {
    setFailure(null);
    try {
      await move({
        id: r.id,
        action,
        fileNo: f.fileNo.trim() || undefined,
        rack: f.rack.trim() || undefined,
        to: f.to.trim() || undefined,
      }).unwrap();
      setF({ fileNo: '', rack: '', to: '' });
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <Card title={t('mrd.file.title')}>
      {failure && <ApiErrorNotice error={failure} />}
      {r.file ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <span className="font-mono">{r.file.fileNo}</span> ·{' '}
            {r.file.status === 'IN'
              ? t('mrd.file.inRack', { rack: r.file.rack ?? '–' })
              : t('mrd.file.outWith', { to: r.file.issuedTo, due: fmtDate(r.file.dueOn) })}
            {r.file.overdue && (
              <StatusBadge className="ml-2" tone="critical" label={t('mrd.file.overdue')} />
            )}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            {r.file.status === 'IN' ? (
              <>
                <FormField label={t('mrd.file.to')} className="w-56">
                  <Input value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
                </FormField>
                <Button disabled={!f.to.trim() || state.isLoading} onClick={() => act('ISSUE')}>
                  {t('mrd.file.issue')}
                </Button>
              </>
            ) : (
              <Button disabled={state.isLoading} onClick={() => act('RETURN')}>
                {t('mrd.file.return')}
              </Button>
            )}
          </div>
          <ul className="text-xs text-muted">
            {r.file.history.map((h, i) => (
              <li key={i}>
                {fmtDate(h.at)} · {t(`mrd.file.action.${h.action}`)} {h.to ?? ''} · {h.by}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <FormField label={t('mrd.file.no')} className="w-36">
            <Input value={f.fileNo} onChange={(e) => setF({ ...f, fileNo: e.target.value })} />
          </FormField>
          <FormField label={t('mrd.file.rack')} className="w-28">
            <Input value={f.rack} onChange={(e) => setF({ ...f, rack: e.target.value })} />
          </FormField>
          <Button disabled={!f.fileNo.trim() || state.isLoading} onClick={() => act('REGISTER')}>
            {t('mrd.file.register')}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** One discharged stay's record: checklist, coding and the physical file. */
export function RecordSheet({ id, onClose }) {
  const { t } = useTranslation();
  const can = useCan();
  const q = useMrdRecordQuery(id);
  const r = q.data;
  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={r ? `${r.patient.name} · ${r.ipNo}` : t('mrd.rec.loading')}
      description={
        r
          ? [
              r.patient.uhid,
              r.consultant,
              t('mrd.rec.stay', { from: fmtDate(r.admittedAt), to: fmtDate(r.dischargedAt) }),
              t(`mrd.outcome.${r.outcome}`),
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
    >
      <QueryView query={q} rows={5}>
        {(rec) => (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={RECORD_TONE[rec.status]} label={t(`mrd.status.${rec.status}`)} />
              {rec.mlc && <StatusBadge tone="critical" label={t('mrd.rec.mlc')} />}
              {rec.retainUntil && (
                <span className="text-sm text-muted">
                  {t('mrd.rec.retain', { date: fmtDate(rec.retainUntil) })}
                </span>
              )}
            </div>
            <Checklist r={rec} />
            {rec.status === 'CLOSED' ? (
              <Card title={t('mrd.code.final')}>
                <ul className="text-sm">
                  {rec.diagnoses.map((d) => (
                    <li key={d.code}>
                      <span className="font-mono">{d.code}</span> {d.name}
                      {d.primary && ` · ${t('mrd.code.primary')}`}
                    </li>
                  ))}
                  {rec.procedures.map((p) => (
                    <li key={`${p.code}${p.name}`}>
                      {p.code} {p.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  {t('mrd.code.by', { by: rec.codedBy, date: fmtDate(rec.codedAt) })}
                </p>
              </Card>
            ) : (
              can('mrd:coding:update') && <Coding r={rec} />
            )}
            {can('mrd:file:update') && <FileCard r={rec} />}
          </div>
        )}
      </QueryView>
    </Sheet>
  );
}
