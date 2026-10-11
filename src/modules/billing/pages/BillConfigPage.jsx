import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addBillingStrings } from '@hms/i18n/billing';
import {
  Banner,
  Button,
  Card,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useAdminStrings } from '../../../lib/useAdminStrings.js';
import { useCan } from '../../../lib/useCan.js';
import { rupeesText } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { ApprovalRulesTab } from '../../setup/components/ApprovalRulesTab.jsx';
import { MasterTab } from '../../setup/components/MasterTab.jsx';
import { NumberSeriesTab } from '../../setup/components/NumberSeriesTab.jsx';
import { useBillingSettingsQuery, useUpdateBillingSettingsMutation } from '../api.js';

const toForm = (s) => ({
  shiftVarianceLimit: rupeesText(s.shiftVarianceLimit),
  defaultOpeningCash: rupeesText(s.defaultOpeningCash),
  billPaper: s.billPaper,
  receiptPaper: s.receiptPaper,
  billFooter: s.billFooter ?? '',
});

/**
 * The billing rules the hospital sets (cash and shifts, or bills and receipts). Both sections
 * save the whole record, so one section never undoes the other.
 */
function SettingsForm({ settings, section }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const canEdit = can('billing:settings:update');
  const [form, setForm] = useState(() => toForm(settings));
  const [failure, setFailure] = useState(null);
  const [save, { isLoading }] = useUpdateBillingSettingsMutation();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    try {
      await save({
        version: settings.version,
        shiftVarianceLimit: Number(form.shiftVarianceLimit || 0),
        defaultOpeningCash: Number(form.defaultOpeningCash || 0),
        billPaper: form.billPaper,
        receiptPaper: form.receiptPaper,
        billFooter: form.billFooter,
      }).unwrap();
      toast({ tone: 'success', title: t('billing.cfg.saved') });
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <Card>
      <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
        {!canEdit && <Banner tone="info">{t('billing.cfg.readOnly')}</Banner>}
        <ApiErrorNotice error={failure} />
        {section === 'cash' ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted">{t('billing.cfg.statutory')}</span>
              <span className="text-ink">{t('billing.cfg.statutoryValue')}</span>
            </div>
            <FormField label={t('billing.cfg.variance')} hint={t('billing.cfg.varianceHint')}>
              <Input
                inputMode="decimal"
                value={form.shiftVarianceLimit}
                onChange={set('shiftVarianceLimit')}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label={t('billing.cfg.openingCash')} hint={t('billing.cfg.openingCashHint')}>
              <Input
                inputMode="decimal"
                value={form.defaultOpeningCash}
                onChange={set('defaultOpeningCash')}
                disabled={!canEdit}
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField label={t('billing.cfg.billPaper')}>
              <Select value={form.billPaper} onChange={set('billPaper')} disabled={!canEdit}>
                {['A4', 'A5'].map((p) => (
                  <option key={p} value={p}>
                    {t(`billing.cfg.papers.${p}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('billing.cfg.receiptPaper')}>
              <Select value={form.receiptPaper} onChange={set('receiptPaper')} disabled={!canEdit}>
                {['THERMAL_80', 'A5'].map((p) => (
                  <option key={p} value={p}>
                    {t(`billing.cfg.papers.${p}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('billing.cfg.footer')} hint={t('billing.cfg.footerHint')} optional>
              <Input
                value={form.billFooter}
                onChange={set('billFooter')}
                maxLength={200}
                disabled={!canEdit}
              />
            </FormField>
            <p className="text-sm text-muted">{t('billing.cfg.duplicate')}</p>
          </>
        )}
        {canEdit && (
          <div>
            <Button type="submit" loading={isLoading}>
              {t('billing.cfg.save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

/** One section of the billing settings record (cash and shifts, or bills and receipts). */
export function BillConfigSection({ section }) {
  const { t } = useTranslation();
  const query = useBillingSettingsQuery();
  return (
    <QueryView query={query} errorTitle={t('billing.cfg.failed')}>
      {(s) => <SettingsForm key={s.version} settings={s} section={section} />}
    </QueryView>
  );
}

/**
 * Billing settings (design board "Billing settings"): one place for everything billing depends
 * on. Payment modes, price lists, payers and tax codes are the shared masters; numbering and
 * approval rules are the hospital's (filtered to billing); cash rules and print layout are the
 * billing settings record.
 */
export default function BillConfigPage() {
  useStrings(addBillingStrings);
  useAdminStrings();
  const { t } = useTranslation();
  const can = useCan();
  return (
    <Page>
      <PageHeader title={t('billing.cfg.title')} description={t('billing.cfg.description')} />
      <UrlTabs
        label={t('billing.cfg.tabsLabel')}
        tabs={[
          {
            id: 'modes',
            label: t('billing.cfg.tabs.modes'),
            body: <MasterTab type="payment-modes" />,
          },
          { id: 'series', label: t('billing.cfg.tabs.series'), body: <NumberSeriesTab /> },
          {
            id: 'price-lists',
            label: t('billing.cfg.tabs.priceLists'),
            body: <MasterTab type="price-lists" />,
          },
          { id: 'payers', label: t('billing.cfg.tabs.payers'), body: <MasterTab type="payers" /> },
          { id: 'tax', label: t('billing.cfg.tabs.tax'), body: <MasterTab type="tax-codes" /> },
          can('settings:approval:read') && {
            id: 'approvals',
            label: t('billing.cfg.tabs.approvals'),
            body: (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{t('billing.cfg.approvalsHint')}</p>
                <ApprovalRulesTab prefix="billing." />
              </div>
            ),
          },
          {
            id: 'cash',
            label: t('billing.cfg.tabs.cash'),
            body: <BillConfigSection section="cash" />,
          },
          {
            id: 'print',
            label: t('billing.cfg.tabs.print'),
            body: <BillConfigSection section="print" />,
          },
        ]}
      />
    </Page>
  );
}
