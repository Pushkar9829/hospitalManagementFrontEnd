import { useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Checkbox, FormField, IconButton, Textarea } from '@hms/ui';
import { useIcd10Query } from '../api.js';
import { LookupSearch } from './LookupSearch.jsx';

/**
 * Notes tab: complaints, history, examination and the ICD-10 diagnoses (rule R13: a visit
 * closes with a diagnosis, or the reason there is none). A new diagnosis starts provisional.
 */
export function ConsultNotes({ form }) {
  const { t } = useTranslation();
  const { register, control, formState } = form;
  const dx = useFieldArray({ control, name: 'diagnoses', keyName: 'key' });
  const dxError = formState.errors.diagnoses?.message;

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t('opd.consult.notes.complaints')}>
        <Textarea {...register('complaints')} rows={2} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label={t('opd.consult.notes.history')}>
          <Textarea {...register('history')} rows={4} />
        </FormField>
        <FormField label={t('opd.consult.notes.examination')}>
          <Textarea {...register('examination')} rows={4} />
        </FormField>
      </div>
      <section aria-labelledby="dx-heading" className="flex flex-col gap-3">
        <h3 id="dx-heading" className="text-base font-semibold text-ink">
          {t('opd.consult.notes.diagnosis')}
        </h3>
        {dx.fields.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {dx.fields.map((d, i) => (
              <li key={d.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="w-16 font-mono text-sm font-semibold">{d.code}</span>
                <span className="min-w-0 flex-1">{d.name}</span>
                <Checkbox
                  label={t('opd.consult.notes.provisional')}
                  {...register(`diagnoses.${i}.provisional`)}
                />
                <IconButton
                  size="sm"
                  label={t('opd.consult.notes.remove', { name: d.name })}
                  icon={<X size={16} aria-hidden="true" />}
                  onClick={() => dx.remove(i)}
                />
              </li>
            ))}
          </ul>
        )}
        <LookupSearch
          label={t('opd.consult.notes.diagnosisAdd')}
          hint={t('opd.consult.notes.diagnosisHint')}
          useQuery={useIcd10Query}
          itemKey={(it) => it.code}
          render={(it) => (
            <>
              <span className="w-16 font-mono text-sm font-semibold">{it.code}</span>
              <span className="flex-1">{it.name}</span>
            </>
          )}
          onPick={(it) => {
            if (!dx.fields.some((d) => d.code === it.code))
              dx.append({ code: it.code, name: it.name, provisional: true });
          }}
        />
        {dxError && (
          <p role="alert" className="text-sm text-critical">
            {dxError}
          </p>
        )}
        {dx.fields.length === 0 && (
          <FormField
            label={t('opd.consult.notes.noDiagnosis')}
            hint={t('opd.consult.notes.noDiagnosisHint')}
            optional
          >
            <Textarea {...register('noDiagnosisReason')} rows={2} />
          </FormField>
        )}
      </section>
    </div>
  );
}
