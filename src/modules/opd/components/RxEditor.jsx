import { useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  Banner,
  EmptyState,
  FormField,
  IconButton,
  Input,
  Select,
  Textarea,
  useToast,
} from '@hms/ui';
import { useFormularyQuery, useOpdTemplatesQuery } from '../api.js';
import { PRINT_LANGUAGES, mergeLines, rxFromDrug } from '../consult.js';
import { FREQUENCIES, ROUTES } from '../opd.js';
import { LookupSearch } from './LookupSearch.jsx';

/** Allergy, interaction and duplicate warnings from the last save (never colour alone). */
function RxChecks({ checks, count }) {
  const { t } = useTranslation();
  if (!checks || !count) return null;
  const problems = [
    ...checks.allergy.map((a) => t('opd.consult.rx.allergy', a)),
    ...checks.interactions.map((i) => i.message),
    ...checks.duplicates.map((g) => t('opd.consult.rx.duplicate', { generic: g })),
  ];
  if (!problems.length)
    return (
      <Banner tone="success" title={t('opd.consult.rx.checksOk')}>
        {t('opd.consult.rx.checkedAtSave')}
      </Banner>
    );
  return (
    <Banner tone={checks.allergy.length ? 'critical' : 'warning'} role="alert">
      <ul className="list-disc pl-4">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </Banner>
  );
}

/**
 * Prescription tab: formulary search, the medicine lines, Rx templates, advice, follow-up and
 * the print language. Allergy and interaction checks come back with every auto-save.
 */
export function RxEditor({ form, checks, department }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { register, control, getValues, setValue, formState } = form;
  const rx = useFieldArray({ control, name: 'rx', keyName: 'key' });
  const templates = useOpdTemplatesQuery({ kind: 'RX' });
  const errs = formState.errors.rx ?? [];

  const applyTemplate = (id) => {
    const tpl = templates.data?.items.find((x) => x.id === id);
    if (!tpl) return;
    setValue('rx', mergeLines(getValues('rx'), tpl.rx ?? [], 'drugId'), { shouldDirty: true });
    if (tpl.advice && !getValues('advice')) setValue('advice', tpl.advice, { shouldDirty: true });
    toast({ tone: 'success', title: t('opd.consult.rx.applied', { name: tpl.name }) });
  };

  const tplOptions = [...(templates.data?.items ?? [])]
    .sort((a, b) => Number(b.department === department) - Number(a.department === department))
    .map((x) => ({ value: x.id, label: `${x.name} · ${x.department}` }));

  return (
    <div className="flex flex-col gap-4">
      <RxChecks checks={checks} count={rx.fields.length} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_18rem]">
        <LookupSearch
          label={t('opd.consult.rx.add')}
          hint={t('opd.consult.rx.addHint')}
          useQuery={useFormularyQuery}
          itemKey={(d) => d.id}
          render={(d) => (
            <>
              <strong className="flex-1 font-semibold">{d.brand}</strong>
              <span className="text-sm text-muted">
                {d.generic} · {d.form}
              </span>
            </>
          )}
          onPick={(d) => {
            if (!getValues('rx').some((r) => r.drugId === d.id)) rx.append(rxFromDrug(d));
          }}
        />
        <FormField label={t('opd.consult.rx.template')}>
          <Select
            value=""
            placeholder={t('opd.consult.rx.templateNone')}
            options={tplOptions}
            onChange={(e) => applyTemplate(e.target.value)}
          />
        </FormField>
      </div>

      {rx.fields.length === 0 ? (
        <EmptyState title={t('opd.consult.rx.empty')} description={t('opd.consult.rx.emptyHint')} />
      ) : (
        <div className="overflow-x-auto rounded-control border border-line">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.rx.medicine')}</th>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.rx.dose')}</th>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.rx.frequency')}</th>
                <th className="w-20 px-3 py-2 font-semibold">{t('opd.consult.rx.days')}</th>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.rx.route')}</th>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.rx.instructions')}</th>
                <th className="px-3 py-2">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rx.fields.map((r, i) => (
                <tr key={r.key} className="align-top">
                  <td className="px-3 py-2">
                    <strong className="block font-semibold text-ink">{r.brand}</strong>
                    <span className="text-muted">{r.generic}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`${t('opd.consult.rx.dose')}, ${r.brand}`}
                      invalid={Boolean(errs[i]?.dose)}
                      {...register(`rx.${i}.dose`)}
                    />
                    {errs[i]?.dose && (
                      <p className="mt-1 text-sm text-critical">{errs[i].dose.message}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`${t('opd.consult.rx.frequency')}, ${r.brand}`}
                      options={FREQUENCIES.map((f) => ({
                        value: f,
                        label: t(`opd.consult.freq.${f}`),
                      }))}
                      {...register(`rx.${i}.frequency`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      inputMode="numeric"
                      aria-label={`${t('opd.consult.rx.days')}, ${r.brand}`}
                      invalid={Boolean(errs[i]?.days)}
                      {...register(`rx.${i}.days`)}
                    />
                    {errs[i]?.days && (
                      <p className="mt-1 text-sm text-critical">{errs[i].days.message}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`${t('opd.consult.rx.route')}, ${r.brand}`}
                      options={ROUTES.map((x) => ({ value: x, label: x }))}
                      {...register(`rx.${i}.route`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`${t('opd.consult.rx.instructions')}, ${r.brand}`}
                      {...register(`rx.${i}.instructions`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <IconButton
                      size="sm"
                      label={t('opd.consult.rx.remove', { name: r.brand })}
                      icon={<X size={16} aria-hidden="true" />}
                      onClick={() => rx.remove(i)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormField label={t('opd.consult.rx.advice')} optional>
        <Textarea {...register('advice')} rows={2} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormField
          label={t('opd.consult.rx.followUp')}
          hint={t('opd.consult.rx.followUpHint')}
          optional
        >
          <Input type="date" {...register('followUp.date')} />
        </FormField>
        <FormField label={t('opd.consult.rx.followUpNote')} optional>
          <Input {...register('followUp.note')} />
        </FormField>
        <FormField label={t('opd.consult.rx.language')}>
          <Select
            options={PRINT_LANGUAGES.map((l) => ({ value: l, label: t(`opd.consult.lang.${l}`) }))}
            {...register('printLanguage')}
          />
        </FormField>
      </div>
    </div>
  );
}
