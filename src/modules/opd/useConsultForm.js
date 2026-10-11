import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { cleanResolver } from '../../lib/forms.js';
import { useFormDraft } from '../../lib/useDraft.js';
import { useSaveConsultationMutation } from './api.js';
import { consultBody, consultDefaults } from './consult.js';

const AUTOSAVE_MS = 1500;

/** Checked only when the doctor signs: auto-save keeps whatever is typed. */
const completeSchema = (t) =>
  z.looseObject({
    rx: z.array(
      z.looseObject({
        dose: z.string().trim().min(1, t('opd.consult.errors.dose')),
        days: z.coerce
          .number()
          .int()
          .min(1, t('opd.consult.errors.days'))
          .max(365, t('opd.consult.errors.days')),
      }),
    ),
  });

/**
 * The consultation form shared by the Consultation screen and the Clinic desk: the saved
 * consultation as defaults, a copy on this device (useFormDraft), and an auto-save
 * (PUT /opd/visits/{id}/consultation) a moment after the doctor stops typing.
 * `stop()` cancels a pending auto-save before signing; `clearDraft()` after it.
 */
export function useConsultForm({ visitId, consultation, canWrite }) {
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: consultDefaults(consultation),
    resolver: cleanResolver(completeSchema(t)),
    mode: 'onSubmit',
  });
  const { clear } = useFormDraft(`opd-consult:${visitId}`, form);
  const [save] = useSaveConsultationMutation();
  const [saveState, setSaveState] = useState('idle');
  const timer = useRef(null);

  useEffect(() => {
    if (!canWrite) return undefined;
    // Typing and template set-values both arrive here and are both saved.
    const sub = form.watch(() => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setSaveState('saving');
        try {
          await save({ id: visitId, ...consultBody(form.getValues()) }).unwrap();
          setSaveState('saved');
        } catch {
          setSaveState('failed');
        }
      }, AUTOSAVE_MS);
    });
    return () => {
      sub.unsubscribe();
      clearTimeout(timer.current);
    };
  }, [form, save, visitId, canWrite]);

  const stop = useCallback(() => clearTimeout(timer.current), []);
  const body = useCallback(() => consultBody(form.getValues()), [form]);
  /** Saves now (before the bill reads the orders), skipping the pending auto-save. */
  const saveNow = useCallback(async () => {
    clearTimeout(timer.current);
    if (!canWrite) return;
    setSaveState('saving');
    try {
      await save({ id: visitId, ...consultBody(form.getValues()) }).unwrap();
      setSaveState('saved');
    } catch {
      setSaveState('failed');
    }
  }, [canWrite, form, save, visitId]);
  return { form, saveState, stop, saveNow, body, clearDraft: clear };
}
