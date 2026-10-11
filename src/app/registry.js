import { lazy } from 'react';
import { routeMatches } from '@hms/ui';
import { ALL_SCREENS } from './screens.js';

/*
 * Module registry: every web screen in the design catalogue (packages/shared/catalog, plus the
 * web-only screens in screens.js) gets a route. Screens built so far map to a page component;
 * every other route shows PlannedScreen until its module is built. Each module adds its pages
 * here when it lands.
 */

const HomePage = lazy(() => import('../modules/home/HomePage.jsx'));
const SettingsPage = lazy(() => import('../modules/setup/pages/SettingsPage.jsx'));
const MastersPage = lazy(() => import('../modules/setup/pages/MastersPage.jsx'));
const SetupWizardPage = lazy(() => import('../modules/setup/pages/SetupWizardPage.jsx'));
const ApprovalsPage = lazy(() => import('../modules/approvals/pages/ApprovalsPage.jsx'));
const AuditLogPage = lazy(() => import('../modules/audit/pages/AuditLogPage.jsx'));
const UsersPage = lazy(() => import('../modules/users/pages/UsersPage.jsx'));
const RolesPage = lazy(() => import('../modules/users/pages/RolesPage.jsx'));
const PatientSearchPage = lazy(() => import('../modules/patients/pages/PatientSearchPage.jsx'));
const RegisterPatientPage = lazy(() => import('../modules/patients/pages/RegisterPatientPage.jsx'));
const PatientProfilePage = lazy(() => import('../modules/patients/pages/PatientProfilePage.jsx'));
const BillingPage = lazy(() => import('../modules/billing/pages/BillingPage.jsx'));
const BillDetailPage = lazy(() => import('../modules/billing/pages/BillDetailPage.jsx'));
const ShiftPage = lazy(() => import('../modules/billing/pages/ShiftPage.jsx'));
const BillAnalyticsPage = lazy(() => import('../modules/billing/pages/BillAnalyticsPage.jsx'));
const BillConfigPage = lazy(() => import('../modules/billing/pages/BillConfigPage.jsx'));
const BillCorporatePage = lazy(() => import('../modules/billing/pages/BillCorporatePage.jsx'));
const SubscriptionPage = lazy(() => import('../modules/subscription/pages/SubscriptionPage.jsx'));
// OPD and front office
const OpdPage = lazy(() => import('../modules/opd/pages/OpdPage.jsx'));
const OpdCheckinPage = lazy(() => import('../modules/opd/pages/OpdCheckinPage.jsx'));
const OpdTriagePage = lazy(() => import('../modules/opd/pages/OpdTriagePage.jsx'));
const ConsultPage = lazy(() => import('../modules/opd/pages/ConsultPage.jsx'));
const OpdSettingsPage = lazy(() => import('../modules/opd/pages/OpdSettingsPage.jsx'));
const OpdAnalyticsPage = lazy(() => import('../modules/opd/pages/OpdAnalyticsPage.jsx'));
const ClinicDeskPage = lazy(() => import('../modules/opd/pages/ClinicDeskPage.jsx'));
const FrontOfficePage = lazy(() => import('../modules/opd/pages/FrontOfficePage.jsx'));
// IPD, nursing and the insurance desk
const BedBoardPage = lazy(() => import('../modules/ipd/pages/BedBoardPage.jsx'));
const AdmitPage = lazy(() => import('../modules/ipd/pages/AdmitPage.jsx'));
const BedRequestsPage = lazy(() => import('../modules/ipd/pages/BedRequestsPage.jsx'));
const RoundsPage = lazy(() => import('../modules/ipd/pages/RoundsPage.jsx'));
const NursingPage = lazy(() => import('../modules/ipd/pages/NursingPage.jsx'));
const DischargePage = lazy(() => import('../modules/ipd/pages/DischargePage.jsx'));
const TpaDeskPage = lazy(() => import('../modules/ipd/pages/TpaDeskPage.jsx'));
const IpdBillPage = lazy(() => import('../modules/ipd/pages/IpdBillPage.jsx'));
const IpdSettingsPage = lazy(() => import('../modules/ipd/pages/IpdSettingsPage.jsx'));
const IpdAnalyticsPage = lazy(() => import('../modules/ipd/pages/IpdAnalyticsPage.jsx'));
const LabPage = lazy(() => import('../modules/lab/pages/LabPage.jsx'));
const LabSamplePage = lazy(() => import('../modules/lab/pages/LabSamplePage.jsx'));
const LabReportPage = lazy(() => import('../modules/lab/pages/LabReportPage.jsx'));
const LabQcPage = lazy(() => import('../modules/lab/pages/LabQcPage.jsx'));
const LabSettingsPage = lazy(() => import('../modules/lab/pages/LabSettingsPage.jsx'));
const LabAnalyticsPage = lazy(() => import('../modules/lab/pages/LabAnalyticsPage.jsx'));
const LabMicroPage = lazy(() => import('../modules/lab/pages/LabMicroPage.jsx'));
const LabHistoPage = lazy(() => import('../modules/lab/pages/LabHistoPage.jsx'));
const HomeVisitsPage = lazy(() => import('../modules/lab/pages/HomeVisitsPage.jsx'));
const RadiologyPage = lazy(() => import('../modules/radiology/pages/RadiologyPage.jsx'));
const PharmacyPage = lazy(() => import('../modules/inventory/pages/PharmacyPage.jsx'));
const InventoryPage = lazy(() => import('../modules/inventory/pages/InventoryPage.jsx'));
// HR, payroll and finance
const HrPage = lazy(() => import('../modules/hr/pages/HrPage.jsx'));
const RosterPage = lazy(() => import('../modules/hr/pages/RosterPage.jsx'));
const MySpacePage = lazy(() => import('../modules/hr/pages/MySpacePage.jsx'));
const PayrollPage = lazy(() => import('../modules/payroll/pages/PayrollPage.jsx'));
const FinancePage = lazy(() => import('../modules/finance/pages/FinancePage.jsx'));
// Support modules
const ReportsPage = lazy(() => import('../modules/reports/pages/ReportsPage.jsx'));
const CrmPage = lazy(() => import('../modules/crm/pages/CrmPage.jsx'));
const QualityPage = lazy(() => import('../modules/quality/pages/QualityPage.jsx'));
const FacilityPage = lazy(() => import('../modules/facility/pages/FacilityPage.jsx'));
const DietPage = lazy(() => import('../modules/diet/pages/DietPage.jsx'));
const RecordsPage = lazy(() => import('../modules/mrd/pages/RecordsPage.jsx'));

/** Screen key -> page component. The admin dashboard is the role home until Phase 1 fills it. */
export const PAGES = {
  Home: HomePage,
  Dashboard: HomePage,
  Settings: SettingsPage,
  Departments: MastersPage,
  SetupWizard: SetupWizardPage,
  Approvals: ApprovalsPage,
  AuditLog: AuditLogPage,
  Users: UsersPage,
  Roles: RolesPage,
  PatientSearch: PatientSearchPage,
  Patients: RegisterPatientPage,
  PatientProfile: PatientProfilePage,
  Billing: BillingPage,
  BillDetail: BillDetailPage,
  BillShift: ShiftPage,
  BillAnalytics: BillAnalyticsPage,
  BillConfig: BillConfigPage,
  BillCorporate: BillCorporatePage,
  Subscription: SubscriptionPage,
  // OPD and front office
  Opd: OpdPage,
  OpdCheckin: OpdCheckinPage,
  OpdTriage: OpdTriagePage,
  Consult: ConsultPage,
  OpdConfig: OpdSettingsPage,
  OpdAnalytics: OpdAnalyticsPage,
  ClinicDesk: ClinicDeskPage,
  FrontOffice: FrontOfficePage,
  // IPD
  Beds: BedBoardPage,
  Admission: AdmitPage,
  IpdBedRequests: BedRequestsPage,
  IpdRounds: RoundsPage,
  Nursing: NursingPage,
  Discharge: DischargePage,
  IpdTpa: TpaDeskPage,
  IpdBill: IpdBillPage,
  IpdConfig: IpdSettingsPage,
  IpdAnalytics: IpdAnalyticsPage,
  Lab: LabPage,
  LabSample: LabSamplePage,
  LabReport: LabReportPage,
  LabQC: LabQcPage,
  LabConfig: LabSettingsPage,
  LabAnalytics: LabAnalyticsPage,
  LabMicro: LabMicroPage,
  LabHisto: LabHistoPage,
  PhleboPhone: HomeVisitsPage,
  Radiology: RadiologyPage,
  Pharmacy: PharmacyPage,
  Inventory: InventoryPage,
  Hr: HrPage,
  Roster: RosterPage,
  MySpace: MySpacePage,
  Payroll: PayrollPage,
  Finance: FinancePage,
  Reports: ReportsPage,
  Crm: CrmPage,
  Quality: QualityPage,
  Facility: FacilityPage,
  Diet: DietPage,
  Records: RecordsPage,
};

/** Screens served outside the signed-in shell (the queue TV runs full screen, signed in or with a display key). */
export const PUBLIC_SCREENS = new Set(['Login', 'QueueTV']);

/** Every routable web screen: { key, path, screen, Component | null }. */
export const SCREEN_ROUTES = Object.entries(ALL_SCREENS)
  .filter(([key, s]) => s.app === 'web' && s.route?.startsWith('/') && !PUBLIC_SCREENS.has(key))
  .map(([key, screen]) => ({ key, path: screen.route, screen, Component: PAGES[key] ?? null }));

/** The screen for a URL path (exact routes beat patterns such as /patients/:id). */
export function screenForPath(path) {
  let best = null;
  let bestScore = -1;
  for (const r of SCREEN_ROUTES) {
    if (!routeMatches(r.path, path)) continue;
    const score = (r.path === path ? 1000 : 0) + r.path.replace(/:[^/]+/g, '').length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/** The developer component gallery is in dev builds, or when VITE_DEV_GALLERY=1 (smoke tests). */
export const GALLERY_ENABLED =
  import.meta.env.DEV ||
  import.meta.env.VITE_DEV_GALLERY === '1' ||
  import.meta.env.MODE === 'test';
