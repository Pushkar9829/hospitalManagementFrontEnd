import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  EmptyState,
  FormField,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import {
  RAD_TONE,
  useCreateRadOrderMutation,
  usePatientStudiesQuery,
  useRadMasterQuery,
  useRadStepMutation,
} from '../api.js';

function OrderForm({ admissionId }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const master = useRadMasterQuery();
  const [picked, setPicked] = useState([]);
  const [priority, setPriority] = useState('ROUTINE');
  const [notes, setNotes] = useState('');
  const [failure, setFailure] = useState(null);
  const [order, state] = useCreateRadOrderMutation();
  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-control border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setFailure(null);
        try {
          const r = await order({
            admissionId,
            studies: picked,
            priority,
            clinicalNotes: notes.trim() || undefined,
          }).unwrap();
          toast({ tone: 'success', title: t('rad.panel.ordered', { count: r.items.length }) });
          setPicked([]);
          setNotes('');
        } catch (err) {
          setFailure(err);
        }
      }}
    >
      <h3 className="font-semibold text-ink">{t('rad.panel.order')}</h3>
      <QueryView query={master} rows={2}>
        {(d) => (
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.items
              .filter((x) => x.isActive)
              .map((x) => (
                <Checkbox
                  key={x.serviceId}
                  checked={picked.includes(x.serviceId)}
                  onChange={(e) =>
                    setPicked((p) =>
                      e.target.checked ? [...p, x.serviceId] : p.filter((v) => v !== x.serviceId),
                    )
                  }
                  label={`${x.name}${x.contrast ? ` · ${t('rad.contrastBadge')}` : ''}`}
                />
              ))}
          </div>
        )}
      </QueryView>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
        <FormField label={t('rad.panel.priority')}>
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={['ROUTINE', 'URGENT', 'STAT'].map((p) => ({
              value: p,
              label: t(`rad.priority.${p}`),
            }))}
          />
        </FormField>
        <FormField label={t('rad.panel.notes')} optional>
          <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </div>
      <ApiErrorNotice error={failure} />
      <div>
        <Button type="submit" loading={state.isLoading} disabled={!picked.length}>
          {t('rad.panel.send', { count: picked.length })}
        </Button>
      </div>
    </form>
  );
}

/** A patient's imaging for the doctor: progress for all, the report once signed, with ack. */
export function PatientImagingPanel({ patientId, admissionId, canOrder, canAcknowledge }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const list = usePatientStudiesQuery(patientId);
  const [step] = useRadStepMutation();
  return (
    <div className="flex flex-col gap-4">
      {canOrder && admissionId && <OrderForm admissionId={admissionId} />}
      <QueryView
        query={list}
        empty={<EmptyState bordered={false} title={t('rad.panel.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col gap-3">
            {d.items.map((s) => (
              <li key={s.id} className="rounded-control border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-ink">{s.name}</strong>
                  <StatusBadge tone={RAD_TONE[s.status]} label={t(`rad.status.${s.status}`)} />
                  {s.critical && s.status === 'SIGNED' && (
                    <StatusBadge tone="critical" label={t('rad.criticalBadge')} />
                  )}
                  <span className="text-sm text-muted">
                    {s.accessionNo} ·{' '}
                    {fmtDateTime(s.signedAt ?? s.scheduledAt ?? s.orderedAt, locale)}
                  </span>
                  {s.status === 'SIGNED' && (
                    <span className="ml-auto flex items-center gap-2">
                      {s.viewerUrl && (
                        <a
                          className="text-sm font-semibold text-primary underline"
                          href={s.viewerUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t('rad.viewImages')}
                        </a>
                      )}
                      {s.acknowledgedAt ? (
                        <span className="text-sm text-muted">
                          {t('rad.panel.acked', { by: s.acknowledgedBy })}
                        </span>
                      ) : (
                        canAcknowledge && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => step({ id: s.id, step: 'acknowledge' })}
                          >
                            {t('rad.panel.ack')}
                          </Button>
                        )
                      )}
                    </span>
                  )}
                </div>
                {s.report && (
                  <div className="mt-2 text-sm">
                    <p className="whitespace-pre-line">{s.report.findings}</p>
                    <p className="mt-1 font-semibold">{s.report.impression}</p>
                    {s.addenda.map((a) => (
                      <p key={a.at} className="mt-1 border-l-2 border-line-strong pl-2">
                        {a.text}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
