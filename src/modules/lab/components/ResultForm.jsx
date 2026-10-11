import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FormField, Input, Select, Textarea, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { useEnterResultsMutation, useLabTestQuery } from '../api.js';

/** The range this patient is judged against (sex-specific first), as text for the input hint. */
function rangeHint(analyte, patient) {
  const r =
    analyte.ranges.find((x) => x.sex === patient?.gender) ??
    analyte.ranges.find((x) => x.sex === 'ANY');
  if (!r) return null;
  if (r.text) return r.text;
  if (r.low != null && r.high != null) return `${r.low} - ${r.high}`;
  return null;
}

/**
 * Result entry for one test, one field per analyte (numbers, choices or text). Saving runs the
 * range, critical and delta checks on the server; a critical value opens a call task.
 */
export function ResultForm({ item, onSaved, submitLabel }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const test = useLabTestQuery(item.testId);
  const [values, setValues] = useState(() =>
    Object.fromEntries(item.results.map((r) => [r.code, r.value ?? ''])),
  );
  const [comment, setComment] = useState(item.comment ?? '');
  const [failure, setFailure] = useState(null);
  const [save, state] = useEnterResultsMutation();
  return (
    <QueryView query={test} rows={4}>
      {(def) => (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setFailure(null);
            try {
              const r = await save({
                id: item.id,
                results: def.analytes
                  .map((a) => ({ code: a.code, value: String(values[a.code] ?? '').trim() }))
                  .filter((x) => x.value),
                comment: comment.trim() || undefined,
              }).unwrap();
              const critical = r.results.filter((x) => x.critical);
              toast({
                tone: critical.length ? 'warning' : 'success',
                title: t(critical.length ? 'lab.res.savedCritical' : 'lab.res.saved'),
                description: critical.length
                  ? critical.map((x) => `${x.name} ${x.value}`).join(', ')
                  : undefined,
              });
              onSaved?.(r);
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          <ApiErrorNotice error={failure} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {def.analytes.map((a) => (
              <FormField
                key={a.code}
                label={a.unit ? `${a.name} (${a.unit})` : a.name}
                hint={rangeHint(a, item.patient) ?? undefined}
              >
                {a.kind === 'CHOICE' ? (
                  <Select
                    value={values[a.code] ?? ''}
                    placeholder={t('lab.res.choose')}
                    onChange={(e) => setValues((v) => ({ ...v, [a.code]: e.target.value }))}
                    options={a.choices.map((c) => ({ value: c, label: c }))}
                  />
                ) : (
                  <Input
                    inputMode={a.kind === 'NUMBER' ? 'decimal' : undefined}
                    value={values[a.code] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [a.code]: e.target.value }))}
                  />
                )}
              </FormField>
            ))}
          </div>
          <FormField label={t('lab.res.comment')} optional>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </FormField>
          <div>
            <Button
              type="submit"
              loading={state.isLoading}
              disabled={!Object.values(values).some((v) => String(v).trim())}
            >
              {submitLabel ?? t('lab.res.save')}
            </Button>
          </div>
        </form>
      )}
    </QueryView>
  );
}
