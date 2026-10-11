import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, FormField, Input, Select, Textarea, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { INCIDENT_TYPES, SEVERITIES, useReportIncidentMutation } from '../api.js';

const localNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16);
const BLANK = {
  type: 'FALL',
  severity: 'NO_HARM',
  occurredAt: localNow(),
  location: '',
  description: '',
  immediateAction: '',
  anonymous: false,
};

/** Any staff member reports an incident, by name or anonymously (spec "Incident reporting"). */
export function IncidentForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [f, setF] = useState(BLANK);
  const [report, state] = useReportIncidentMutation();
  const [failure, setFailure] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('qlt.inc.report')} description={t('qlt.inc.reportHint')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t('qlt.inc.type')}>
          <Select
            value={f.type}
            onChange={set('type')}
            options={INCIDENT_TYPES.map((x) => ({ value: x, label: t(`qlt.inc.types.${x}`) }))}
          />
        </FormField>
        <FormField label={t('qlt.inc.severity')}>
          <Select
            value={f.severity}
            onChange={set('severity')}
            options={SEVERITIES.map((x) => ({ value: x, label: t(`qlt.inc.sev.${x}`) }))}
          />
        </FormField>
        <FormField label={t('qlt.inc.when')}>
          <Input type="datetime-local" value={f.occurredAt} onChange={set('occurredAt')} />
        </FormField>
        <FormField label={t('qlt.inc.where')} className="sm:col-span-3">
          <Input value={f.location} onChange={set('location')} />
        </FormField>
        <FormField label={t('qlt.inc.what')} className="sm:col-span-3">
          <Textarea rows={3} value={f.description} onChange={set('description')} />
        </FormField>
        <FormField label={t('qlt.inc.done')} className="sm:col-span-3">
          <Input value={f.immediateAction} onChange={set('immediateAction')} />
        </FormField>
        <Checkbox
          checked={f.anonymous}
          onChange={(e) => setF({ ...f, anonymous: e.target.checked })}
          label={t('qlt.inc.anonymous')}
        />
      </div>
      <Button
        className="mt-3"
        loading={state.isLoading}
        disabled={f.location.trim().length < 2 || f.description.trim().length < 10}
        onClick={async () => {
          setFailure(null);
          try {
            const out = await report({
              anonymous: f.anonymous,
              type: f.type,
              severity: f.severity,
              occurredAt: `${f.occurredAt}:00+05:30`,
              location: f.location.trim(),
              description: f.description.trim(),
              immediateAction: f.immediateAction.trim() || undefined,
            }).unwrap();
            toast({ tone: 'success', title: t('qlt.inc.reported', { no: out.incidentNo }) });
            setF({ ...BLANK, occurredAt: localNow() });
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {t('qlt.inc.submit')}
      </Button>
    </Card>
  );
}
