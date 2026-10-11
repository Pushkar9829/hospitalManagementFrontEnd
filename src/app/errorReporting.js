/**
 * Browser error tracking (Sentry), loaded only when VITE_SENTRY_DSN is set at build time, and
 * after the app has started, so it never adds to the first download. Nothing typed into a form
 * and no patient data is sent: breadcrumbs, request bodies and the URL query are dropped.
 */
export function startErrorReporting() {
  // Written as one compile-time condition, so a build without a DSN drops the import entirely.
  if (!import.meta.env.VITE_SENTRY_DSN || import.meta.env.MODE === 'test') return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  import('@sentry/react')
    .then((Sentry) =>
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        maxBreadcrumbs: 0,
        beforeSend(event) {
          if (event.request) {
            delete event.request.data;
            delete event.request.cookies;
            if (event.request.url) event.request.url = event.request.url.split('?')[0];
          }
          delete event.user;
          return event;
        },
      }),
    )
    .catch(() => {});
}
