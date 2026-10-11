import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Patient CRM (apps/api/src/modules/crm). Money in paise. */

const TAGS = [
  'CrmLookup',
  'CrmLeads',
  'CrmCamps',
  'CrmCampaigns',
  'CrmPlans',
  'CrmCards',
  'CrmReferrals',
  'CrmReport',
];
const post = (url, body = {}) => ({ url, method: 'POST', body });

export const crmApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    crmLookup: b.query({
      query: (mobile) => ({ url: '/crm/lookup', params: { mobile } }),
      providesTags: ['CrmLookup'],
    }),
    crmLogEnquiry: b.mutation({
      query: (body) => post('/crm/enquiries', body),
      invalidatesTags: ['CrmLookup', 'CrmLeads'],
    }),
    crmLeads: b.query({
      query: (params = {}) => ({ url: '/crm/leads', params: cleanParams(params) }),
      providesTags: ['CrmLeads'],
    }),
    crmCreateLead: b.mutation({
      query: (body) => post('/crm/leads', body),
      invalidatesTags: ['CrmLeads', 'CrmReport'],
    }),
    crmUpdateLead: b.mutation({
      query: ({ id, ...body }) => ({ url: `/crm/leads/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['CrmLeads', 'CrmLookup', 'CrmReport'],
    }),
    crmCamps: b.query({ query: () => '/crm/camps', providesTags: ['CrmCamps'] }),
    crmCreateCamp: b.mutation({
      query: (body) => post('/crm/camps', body),
      invalidatesTags: ['CrmCamps'],
    }),
    crmRegisterAtCamp: b.mutation({
      query: ({ id, ...body }) => post(`/crm/camps/${id}/registrations`, body),
      invalidatesTags: ['CrmCamps', 'CrmLeads'],
    }),
    crmCloseCamp: b.mutation({
      query: (id) => post(`/crm/camps/${id}/done`),
      invalidatesTags: ['CrmCamps'],
    }),
    crmCampReport: b.query({
      query: (id) => `/crm/camps/${id}/report`,
      providesTags: ['CrmCamps'],
    }),
    crmSetPreference: b.mutation({
      query: (body) => post('/crm/preferences', body),
      invalidatesTags: ['CrmLookup'],
    }),
    crmCampaigns: b.query({ query: () => '/crm/campaigns', providesTags: ['CrmCampaigns'] }),
    crmPreviewAudience: b.mutation({ query: (body) => post('/crm/campaigns/preview', body) }),
    crmCreateCampaign: b.mutation({
      query: (body) => post('/crm/campaigns', body),
      invalidatesTags: ['CrmCampaigns'],
    }),
    crmSendCampaign: b.mutation({
      query: (id) => post(`/crm/campaigns/${id}/send`),
      invalidatesTags: ['CrmCampaigns'],
    }),
    crmPlans: b.query({ query: () => '/crm/plans', providesTags: ['CrmPlans'] }),
    crmCreatePlan: b.mutation({
      query: (body) => post('/crm/plans', body),
      invalidatesTags: ['CrmPlans'],
    }),
    crmCards: b.query({
      query: (params = {}) => ({ url: '/crm/memberships', params: cleanParams(params) }),
      providesTags: ['CrmCards'],
    }),
    crmSellCard: b.mutation({
      query: (body) => post('/crm/memberships', body),
      invalidatesTags: ['CrmCards', 'CrmLookup'],
    }),
    crmFreeVisit: b.mutation({
      query: ({ id, ...body }) => post(`/crm/memberships/${id}/free-visit`, body),
      invalidatesTags: ['CrmCards', 'CrmLookup'],
    }),
    crmReferrals: b.query({
      query: (month) => ({ url: '/crm/referrals', params: { month } }),
      providesTags: ['CrmReferrals'],
    }),
    crmSaveAgreement: b.mutation({
      query: (body) => ({ url: '/crm/referrals/agreements', method: 'PUT', body }),
      invalidatesTags: ['CrmReferrals'],
    }),
    crmMakeStatements: b.mutation({
      query: (month) => post('/crm/referrals/statements', { month }),
      invalidatesTags: ['CrmReferrals'],
    }),
    crmSendStatement: b.mutation({
      query: (id) => post(`/crm/referrals/statements/${id}/send`),
      invalidatesTags: ['CrmReferrals'],
    }),
    crmReport: b.query({
      query: (params) => ({ url: '/crm/report', params }),
      providesTags: ['CrmReport'],
    }),
  }),
});

export const {
  useLazyCrmLookupQuery,
  useCrmLogEnquiryMutation,
  useCrmLeadsQuery,
  useCrmCreateLeadMutation,
  useCrmUpdateLeadMutation,
  useCrmCampsQuery,
  useCrmCreateCampMutation,
  useCrmRegisterAtCampMutation,
  useCrmCloseCampMutation,
  useCrmCampReportQuery,
  useCrmSetPreferenceMutation,
  useCrmCampaignsQuery,
  useCrmPreviewAudienceMutation,
  useCrmCreateCampaignMutation,
  useCrmSendCampaignMutation,
  useCrmPlansQuery,
  useCrmCreatePlanMutation,
  useCrmCardsQuery,
  useCrmSellCardMutation,
  useCrmFreeVisitMutation,
  useCrmReferralsQuery,
  useCrmSaveAgreementMutation,
  useCrmMakeStatementsMutation,
  useCrmSendStatementMutation,
  useCrmReportQuery,
} = crmApi;

export const STAGES = ['NEW', 'CONTACTED', 'COUNSELLED', 'BOOKED', 'CONVERTED', 'LOST'];
export const STAGE_TONE = {
  NEW: 'info',
  CONTACTED: 'info',
  COUNSELLED: 'warning',
  BOOKED: 'warning',
  CONVERTED: 'success',
  LOST: 'neutral',
};
