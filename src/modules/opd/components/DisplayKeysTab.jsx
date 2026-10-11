import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Banner, Button, Card, DataTable, Input, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useCreateDisplayKeyMutation,
  useDisplayKeysQuery,
  useRevokeDisplayKeyMutation,
} from '../api.js';

const tvLink = (key) => `${globalThis.location?.origin ?? ''}/display/queue?key=${key}`;

/** Queue TVs of the branch: register one (its link is shown once), see when it was last on, switch it off. */
export function DisplayKeysTab({ canEdit }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const q = useDisplayKeysQuery();
  const [create] = useCreateDisplayKeyMutation();
  const [revoke] = useRevokeDisplayKeyMutation();
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{t('opd.tvk.hint')}</p>
        {canEdit && <Button onClick={() => setAdding(true)}>{t('opd.tvk.add')}</Button>}
      </div>
      {fresh && (
        <Banner tone="warning" title={t('opd.tvk.once', { name: fresh.name })}>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              readOnly
              aria-label={t('opd.tvk.link')}
              className="min-w-0 flex-1 font-mono"
              value={tvLink(fresh.key)}
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                await globalThis.navigator?.clipboard?.writeText(tvLink(fresh.key));
                toast({ tone: 'success', title: t('opd.tvk.copied') });
              }}
            >
              {t('opd.tvk.copy')}
            </Button>
            <Button variant="ghost" onClick={() => setFresh(null)}>
              {t('opd.tvk.done')}
            </Button>
          </div>
        </Banner>
      )}
      <ApiErrorNotice error={failure} />
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('opd.tvk.title')}
              data={d.items}
              empty={t('opd.tvk.none')}
              columns={[
                { id: 'name', header: t('opd.tvk.name'), cell: ({ row }) => row.original.name },
                {
                  id: 'key',
                  header: t('opd.tvk.key'),
                  cell: ({ row }) => <span className="font-mono">…{row.original.last4}</span>,
                },
                {
                  id: 'seen',
                  header: t('opd.tvk.lastSeen'),
                  cell: ({ row }) =>
                    row.original.lastSeenAt
                      ? fmtDateTime(row.original.lastSeenAt, locale)
                      : t('opd.tvk.never'),
                },
                {
                  id: 'by',
                  header: t('opd.tvk.by'),
                  cell: ({ row }) => row.original.createdByName ?? '',
                },
                canEdit && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        setFailure(null);
                        try {
                          await revoke(row.original.id).unwrap();
                          toast({
                            tone: 'success',
                            title: t('opd.tvk.revoked', { name: row.original.name }),
                          });
                        } catch (e) {
                          setFailure(e);
                        }
                      }}
                    >
                      {t('opd.tvk.revoke')}
                    </Button>
                  ),
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('opd.tvk.add')}
        schema={z.object({ name: z.string().trim().min(2).max(60) })}
        defaultValues={{ name: '' }}
        fields={[
          { name: 'name', label: t('opd.tvk.name'), required: true, hint: t('opd.tvk.nameHint') },
        ]}
        submitLabel={t('opd.tvk.add')}
        onSubmit={(v) => create(v).unwrap()}
        onDone={(k) => setFresh(k)}
      />
    </div>
  );
}
