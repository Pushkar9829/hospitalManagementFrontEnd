/**
 * Quick actions on each role's home page (design boards Home*): a label (rh.quick.<id>), the
 * screen that gates it and where it goes. Actions the user cannot open are left out.
 */
const q = (id, screen, to) => ({ id, screen, to });

export const QUICK = Object.freeze({
  superadmin: [
    q('approvals', 'Approvals', '/approvals'),
    q('reports', 'Reports', '/reports'),
    q('setup', 'SetupWizard', '/setup'),
  ],
  admin: [
    q('users', 'Users', '/settings/users'),
    q('masters', 'Departments', '/settings/masters'),
    q('beds', 'Beds', '/ipd/beds'),
  ],
  medsupt: [
    q('beds', 'Beds', '/ipd/beds'),
    q('discharges', 'Discharge', '/ipd/discharge'),
    q('quality', 'Quality', '/quality'),
  ],
  doctor: [
    q('startOpd', 'Consult', '/opd/visits/next'),
    q('rounds', 'IpdRounds', '/ipd/rounds'),
    q('discharges', 'Discharge', '/ipd/discharge'),
  ],
  hod: [
    q('startOpd', 'Consult', '/opd/visits/next'),
    q('roster', 'Roster', '/hr/rosters'),
    q('reports', 'Reports', '/reports'),
  ],
  clinic: [
    q('clinic', 'ClinicDesk', '/clinic'),
    q('newBill', 'Billing', '/billing'),
    q('appointments', 'Opd', '/opd'),
  ],
  nurse: [
    q('nursing', 'Nursing', '/nursing/all'),
    q('incident', 'MySpace', '/me?tab=incident'),
    q('diet', 'Diet', '/diet'),
  ],
  wardincharge: [
    q('nursing', 'Nursing', '/nursing/all'),
    q('bedRequests', 'IpdBedRequests', '/ipd/bed-requests'),
    q('indent', 'Inventory', '/inventory?tab=indents'),
  ],
  frontoffice: [
    q('register', 'Patients', '/patients/new'),
    q('appointments', 'Opd', '/opd'),
    q('admit', 'Admission', '/ipd/admit'),
  ],
  security: [
    q('frontOffice', 'FrontOffice', '/front-office'),
    q('visitorLog', 'FrontOffice', '/front-office?tab=log'),
    q('incident', 'MySpace', '/me?tab=incident'),
  ],
  cashier: [
    q('newBill', 'Billing', '/billing'),
    q('deposit', 'Billing', '/billing?tab=deposits'),
    q('shift', 'BillShift', '/billing/shift'),
  ],
  billingmgr: [
    q('ipBills', 'IpdBill', '/ipd/bills'),
    q('shift', 'BillShift', '/billing/shift'),
    q('analytics', 'BillAnalytics', '/billing/analytics'),
  ],
  tpa: [
    q('insurance', 'IpdTpa', '/ipd/insurance'),
    q('ipBills', 'IpdBill', '/ipd/bills'),
    q('discharges', 'Discharge', '/ipd/discharge'),
  ],
  lab: [
    q('worklist', 'Lab', '/lab'),
    q('samples', 'LabSample', '/lab/samples'),
    q('qc', 'LabQC', '/lab/qc'),
  ],
  phlebotomist: [
    q('homeVisits', 'PhleboPhone', '/lab/home-visits'),
    q('samples', 'LabSample', '/lab/samples'),
  ],
  radiology: [q('worklist', 'Radiology', '/radiology'), q('reports', 'Reports', '/reports')],
  pharmacy: [
    q('dispense', 'Pharmacy', '/pharmacy'),
    q('returns', 'Pharmacy', '/pharmacy?tab=returns'),
    q('stock', 'Inventory', '/inventory'),
  ],
  store: [
    q('indent', 'Inventory', '/inventory?tab=indents'),
    q('po', 'Inventory', '/inventory?tab=po'),
    q('grn', 'Inventory', '/inventory?tab=grn'),
  ],
  hr: [
    q('leave', 'Hr', '/hr?tab=leave'),
    q('employees', 'Hr', '/hr'),
    q('payroll', 'Payroll', '/payroll'),
  ],
  payroll: [
    q('payroll', 'Payroll', '/payroll'),
    q('employees', 'Hr', '/hr'),
    q('reports', 'Reports', '/reports'),
  ],
  accounts: [
    q('finance', 'Finance', '/finance'),
    q('analytics', 'BillAnalytics', '/billing/analytics'),
    q('gst', 'Finance', '/finance?tab=gst'),
  ],
  auditor: [
    q('audit', 'AuditLog', '/audit'),
    q('trialBalance', 'Finance', '/finance?tab=tb'),
    q('reports', 'Reports', '/reports'),
  ],
  mrd: [
    q('records', 'Records', '/records'),
    q('deficiencies', 'Records', '/records?tab=deficiencies'),
    q('registers', 'Records', '/records?tab=registers'),
  ],
  kitchen: [
    q('production', 'Diet', '/diet'),
    q('dietOrders', 'Diet', '/diet?tab=orders'),
    q('stock', 'Inventory', '/inventory'),
  ],
  facility: [
    q('cleaning', 'Facility', '/facility'),
    q('tickets', 'Facility', '/facility?tab=tickets'),
    q('equipment', 'Facility', '/facility?tab=equipment'),
  ],
  quality: [
    q('incidents', 'Quality', '/quality?tab=incidents'),
    q('complaints', 'Quality', '/quality?tab=complaints'),
    q('reports', 'Reports', '/reports'),
  ],
  crm: [
    q('leads', 'Crm', '/crm?tab=leads'),
    q('callCentre', 'Crm', '/crm'),
    q('campaigns', 'Crm', '/crm?tab=campaigns'),
  ],
  employee: [
    q('mySpace', 'MySpace', '/me'),
    q('leave', 'MySpace', '/me?tab=leave'),
    q('payslips', 'MySpace', '/me?tab=payslips'),
  ],
});
