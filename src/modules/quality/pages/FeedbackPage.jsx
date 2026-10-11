import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addQualityStrings } from '@hms/i18n/quality';
import { Banner, Button, Card, FormField, Textarea } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useStrings } from '../../../lib/useStrings.js';
import { useFeedbackFormQuery, useSubmitFeedbackMutation } from '../api.js';

const ASPECTS = ['overall', 'doctor', 'nursing', 'cleanliness', 'billing', 'food'];

function Stars({ label, value, onChange }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="w-40 text-sm font-semibold">{label}</legend>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}`}
            onClick={() => onChange(n)}
            className={`h-11 w-11 rounded-control border text-xl ${value >= n ? 'border-warning bg-warning-bg' : 'border-line'}`}
          >
            ★
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Public feedback page (link in the SMS after a visit or discharge): star ratings, the 0-10
 * recommend question and a comment. Works without signing in; large touch targets for phones.
 */
export default function FeedbackPage() {
  useStrings(addQualityStrings);
  const { t } = useTranslation();
  const { token } = useParams();
  const form = useFeedbackFormQuery(token);
  const [submit, state] = useSubmitFeedbackMutation();
  const [r, setR] = useState({});
  const [nps, setNps] = useState(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(null);
  const [failure, setFailure] = useState(null);
  const f = form.data;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-ground px-4 py-6">
      {form.isError ? (
        <Banner tone="warning">{t('qlt.fb.invalid')}</Banner>
      ) : !f ? (
        <p className="text-muted">{t('qlt.fb.loading')}</p>
      ) : done || f.answered ? (
        <Card title={t('qlt.fb.thanks')}>
          <p>{t('qlt.fb.thanksBody', { hospital: f.hospital })}</p>
          {done?.review && (
            <a
              className="mt-3 inline-block font-semibold underline"
              href={done.review}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t('qlt.fb.review')}
            </a>
          )}
        </Card>
      ) : (
        <Card
          title={t('qlt.fb.title', { hospital: f.hospital })}
          description={f.patient ? t('qlt.fb.hello', { name: f.patient }) : undefined}
        >
          <div className="flex flex-col gap-4">
            {failure && <ApiErrorNotice error={failure} />}
            {ASPECTS.filter((a) => a !== 'food' || f.source === 'IPD').map((a) => (
              <Stars
                key={a}
                label={t(`qlt.fb.aspect.${a}`)}
                value={r[a] ?? 0}
                onChange={(v) => setR((x) => ({ ...x, [a]: v }))}
              />
            ))}
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('qlt.fb.nps')}</legend>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('qlt.fb.nps')}>
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={nps === n}
                    onClick={() => setNps(n)}
                    className={`h-11 w-11 rounded-control border font-semibold ${nps === n ? 'border-primary bg-info-bg' : 'border-line'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 flex justify-between text-xs text-muted">
                <span>{t('qlt.fb.unlikely')}</span>
                <span>{t('qlt.fb.likely')}</span>
              </p>
            </fieldset>
            <FormField label={t('qlt.fb.comment')}>
              <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
            </FormField>
            <Button
              size="lg"
              loading={state.isLoading}
              disabled={!r.overall || nps == null}
              onClick={async () => {
                setFailure(null);
                try {
                  setDone(
                    await submit({
                      token,
                      ...r,
                      nps,
                      comment: comment.trim() || undefined,
                    }).unwrap(),
                  );
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('qlt.fb.send')}
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}
