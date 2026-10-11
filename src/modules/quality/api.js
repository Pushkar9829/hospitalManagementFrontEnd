import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Quality (apps/api/src/modules/quality) and the public feedback link. */

const TAGS = [
  'QltOverview',
  'QltSettings',
  'QltIncidents',
  'QltIncident',
  'QltComplaints',
  'QltFeedback',
  'QltIndicators',
  'QltAudits',
  'QltDocuments',
  'QltInfection',
];
const post = (url, body = {}) => ({ url, method: 'POST', body });

export const qualityApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    qltOverview: b.query({ query: () => '/quality/overview', providesTags: ['QltOverview'] }),
    qltSettings: b.query({ query: () => '/quality/settings', providesTags: ['QltSettings'] }),
    saveQltSettings: b.mutation({
      query: (body) => ({ url: '/quality/settings', method: 'PUT', body }),
      invalidatesTags: ['QltSettings', 'QltIndicators'],
    }),
    incidents: b.query({
      query: (params = {}) => ({ url: '/quality/incidents', params: cleanParams(params) }),
      providesTags: ['QltIncidents'],
    }),
    incident: b.query({ query: (id) => `/quality/incidents/${id}`, providesTags: ['QltIncident'] }),
    reportIncident: b.mutation({
      query: ({ anonymous, ...body }) =>
        post(anonymous ? '/quality/incidents/anonymous' : '/quality/incidents', body),
      invalidatesTags: ['QltIncidents', 'QltOverview'],
    }),
    investigate: b.mutation({
      query: ({ id, ...body }) => post(`/quality/incidents/${id}/investigation`, body),
      invalidatesTags: ['QltIncidents', 'QltIncident'],
    }),
    actionDone: b.mutation({
      query: ({ id, actionId }) => post(`/quality/incidents/${id}/actions/${actionId}/done`),
      invalidatesTags: ['QltIncident'],
    }),
    closeIncident: b.mutation({
      query: (id) => post(`/quality/incidents/${id}/close`),
      invalidatesTags: ['QltIncidents', 'QltIncident', 'QltOverview'],
    }),
    complaints: b.query({
      query: (params = {}) => ({ url: '/quality/complaints', params: cleanParams(params) }),
      providesTags: ['QltComplaints'],
    }),
    createComplaint: b.mutation({
      query: (body) => post('/quality/complaints', body),
      invalidatesTags: ['QltComplaints', 'QltOverview'],
    }),
    complaintAction: b.mutation({
      query: ({ id, ...body }) => post(`/quality/complaints/${id}/action`, body),
      invalidatesTags: ['QltComplaints', 'QltOverview'],
    }),
    feedbackSummary: b.query({
      query: (params) => ({ url: '/quality/feedback', params }),
      providesTags: ['QltFeedback'],
    }),
    indicators: b.query({
      query: (month) => ({ url: '/quality/indicators', params: { month } }),
      providesTags: ['QltIndicators'],
    }),
    auditTemplates: b.query({ query: () => '/quality/audit-templates' }),
    audits: b.query({ query: () => '/quality/audits', providesTags: ['QltAudits'] }),
    recordAudit: b.mutation({
      query: (body) => post('/quality/audits', body),
      invalidatesTags: ['QltAudits'],
    }),
    auditActionDone: b.mutation({
      query: ({ id, actionId }) => post(`/quality/audits/${id}/actions/${actionId}/done`),
      invalidatesTags: ['QltAudits'],
    }),
    documents: b.query({
      query: (status) => ({ url: '/quality/documents', params: cleanParams({ status }) }),
      providesTags: ['QltDocuments'],
    }),
    draftDocument: b.mutation({
      query: (body) => post('/quality/documents', body),
      invalidatesTags: ['QltDocuments'],
    }),
    approveDocument: b.mutation({
      query: (id) => post(`/quality/documents/${id}/approve`),
      invalidatesTags: ['QltDocuments', 'QltOverview'],
    }),
    acknowledgeDocument: b.mutation({
      query: (id) => post(`/quality/documents/${id}/acknowledge`),
      invalidatesTags: ['QltDocuments'],
    }),
    infection: b.query({
      query: (month) => ({ url: '/quality/infection', params: { month } }),
      providesTags: ['QltInfection'],
    }),
    recordHai: b.mutation({
      query: (body) => post('/quality/infection/cases', body),
      invalidatesTags: ['QltInfection'],
    }),
    saveDeviceDays: b.mutation({
      query: (body) => ({ url: '/quality/infection/device-days', method: 'PUT', body }),
      invalidatesTags: ['QltInfection'],
    }),
    feedbackForm: b.query({ query: (token) => `/feedback/${token}` }),
    submitFeedback: b.mutation({
      query: ({ token, ...body }) => post(`/feedback/${token}`, body),
    }),
  }),
});

export const {
  useQltOverviewQuery,
  useQltSettingsQuery,
  useSaveQltSettingsMutation,
  useIncidentsQuery,
  useIncidentQuery,
  useReportIncidentMutation,
  useInvestigateMutation,
  useActionDoneMutation,
  useCloseIncidentMutation,
  useComplaintsQuery,
  useCreateComplaintMutation,
  useComplaintActionMutation,
  useFeedbackSummaryQuery,
  useIndicatorsQuery,
  useAuditTemplatesQuery,
  useAuditsQuery,
  useRecordAuditMutation,
  useAuditActionDoneMutation,
  useDocumentsQuery,
  useDraftDocumentMutation,
  useApproveDocumentMutation,
  useAcknowledgeDocumentMutation,
  useInfectionQuery,
  useRecordHaiMutation,
  useSaveDeviceDaysMutation,
  useFeedbackFormQuery,
  useSubmitFeedbackMutation,
} = qualityApi;

export const INCIDENT_TONE = {
  REPORTED: 'warning',
  INVESTIGATING: 'info',
  CAPA: 'info',
  PENDING_CLOSURE: 'warning',
  CLOSED: 'success',
};
export const SEVERITY_TONE = {
  NEAR_MISS: 'neutral',
  NO_HARM: 'neutral',
  MILD: 'warning',
  MODERATE: 'warning',
  SEVERE: 'critical',
  SENTINEL: 'critical',
};
export const COMPLAINT_TONE = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  ESCALATED: 'critical',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};
export const INCIDENT_TYPES = [
  'FALL',
  'MEDICATION_ERROR',
  'NEEDLE_STICK',
  'EQUIPMENT_FAILURE',
  'PRESSURE_INJURY',
  'INFECTION',
  'NEAR_MISS',
  'VIOLENCE',
  'OTHER',
];
export const SEVERITIES = ['NEAR_MISS', 'NO_HARM', 'MILD', 'MODERATE', 'SEVERE', 'SENTINEL'];
