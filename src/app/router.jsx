import { Suspense, lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import { SCREEN_ROUTES } from './registry.js';
import {
  FullPageLoading,
  PublicOnly,
  RequireAuth,
  RootRoute,
  ScreenGate,
  SessionGate,
} from './guards.jsx';
import { AppLayout } from './shell/AppLayout.jsx';
import { RouteError } from './RouteError.jsx';
import { isConsoleHost, isMarketingHost } from './host.js';
import {
  ChangePasswordPage,
  DevGalleryPage,
  FeedbackPage,
  PortalPage,
  ForgotPasswordPage,
  LoginPage,
  NotFoundPage,
  PricingPage,
  QueueTvPage,
  SetupTwoFactorPage,
  SignupPage,
  SuspendedPage,
  WelcomePage,
} from './pages.js';

function lazyPage(Component) {
  return (
    <Suspense fallback={<FullPageLoading />}>
      <Component />
    </Suspense>
  );
}

/** Route table: public sign-in pages, then the signed-in shell with one route per screen. */
export const routes = [
  ...(DevGalleryPage ? [{ path: '/dev/ui', element: lazyPage(DevGalleryPage) }] : []),
  {
    element: <SessionGate />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <PublicOnly>{lazyPage(LoginPage)}</PublicOnly> },
      { path: '/welcome', element: lazyPage(WelcomePage) },
      // Waiting-area TV: full screen, no menu, works without a signed-in user (display key).
      { path: '/display/queue', element: lazyPage(QueueTvPage) },
      // Patient feedback from the SMS link: no sign-in.
      { path: '/feedback/:token', element: lazyPage(FeedbackPage) },
      // Patient portal: its own sign-in by a code on the registered mobile.
      { path: '/my/*', element: lazyPage(PortalPage) },
      {
        path: '/forgot-password',
        element: <PublicOnly>{lazyPage(ForgotPasswordPage)}</PublicOnly>,
      },
      {
        path: '/setup-2fa',
        element: <RequireAuth gate="/setup-2fa">{lazyPage(SetupTwoFactorPage)}</RequireAuth>,
      },
      {
        path: '/change-password',
        element: <RequireAuth gate="/change-password">{lazyPage(ChangePasswordPage)}</RequireAuth>,
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/suspended', element: lazyPage(SuspendedPage) },
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <RootRoute /> },
              ...SCREEN_ROUTES.filter((r) => r.path !== '/').map((r) => ({
                path: r.path,
                element: <ScreenGate key={r.key} screenKey={r.key} />,
              })),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * The marketing host (no hospital): pricing and the trial signup, calling /api/public. Nothing
 * here asks /api/v1/auth/me, which needs a hospital address.
 */
export const publicRoutes = [
  {
    errorElement: <RouteError />,
    children: [
      { path: '/pricing', element: lazyPage(PricingPage) },
      { path: '/signup', element: lazyPage(SignupPage) },
      { path: '*', element: <Navigate to="/pricing" replace /> },
    ],
  },
];

const ConsoleLoginPage = lazy(() => import('../modules/console/pages/ConsoleLoginPage.jsx'));
const ConsoleLayout = lazy(() => import('../modules/console/pages/ConsoleLayout.jsx'));
const CataloguePage = lazy(() => import('../modules/console/pages/CataloguePage.jsx'));
const ConsoleHome = lazy(() =>
  import('../modules/console/pages/ConsoleLayout.jsx').then((m) => ({ default: m.ConsoleHome })),
);
const TenantsPage = lazy(() => import('../modules/console/pages/TenantsPage.jsx'));
const TrialsPage = lazy(() =>
  import('../modules/console/pages/TenantsPage.jsx').then((m) => ({ default: m.TrialsPage })),
);
const SubscriptionsPage = lazy(() =>
  import('../modules/console/pages/TenantsPage.jsx').then((m) => ({
    default: m.SubscriptionsPage,
  })),
);
const TenantPage = lazy(() => import('../modules/console/pages/TenantPage.jsx'));
const InvoicesPage = lazy(() => import('../modules/console/pages/InvoicesPage.jsx'));
const ConsolePlaceholder = lazy(() =>
  import('../modules/console/pages/ConsoleLayout.jsx').then((m) => ({
    default: m.ConsolePlaceholder,
  })),
);

/** The platform console host (console.<root>): its own sign-in and shell, /api/platform only. */
export const consoleRoutes = [
  {
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: lazyPage(ConsoleLoginPage) },
      {
        element: lazyPage(ConsoleLayout),
        children: [
          { path: '/', element: lazyPage(ConsoleHome) },
          { path: '/tenants', element: lazyPage(TenantsPage) },
          { path: '/tenants/:id', element: lazyPage(TenantPage) },
          { path: '/trials', element: lazyPage(TrialsPage) },
          { path: '/catalogue', element: lazyPage(CataloguePage) },
          { path: '/subscriptions', element: lazyPage(SubscriptionsPage) },
          { path: '/billing', element: lazyPage(InvoicesPage) },
          { path: '*', element: lazyPage(ConsolePlaceholder) },
        ],
      },
    ],
  },
];

/** The staff app on a hospital host, the public pages on the marketing host (see host.js). */
export function createAppRouter(hostname = globalThis.location?.hostname) {
  if (isConsoleHost(hostname)) return createBrowserRouter(consoleRoutes);
  return createBrowserRouter(isMarketingHost(hostname) ? publicRoutes : routes);
}
