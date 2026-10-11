import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Inventory and pharmacy (apps/api/src/modules/inventory, pharmacy). Money in paise. */

const post = (url, body = {}) => ({ url, method: 'POST', body });
const STOCK = ['InvStock', 'InvBatches', 'InvLedger', 'InvReports', 'InvReorder'];
const DOCS = ['InvPos', 'InvGrns', 'InvIndents', 'InvRequisitions', 'InvTransfers'];
const PHR = ['PhrQueue', 'PhrRx', 'PhrSales', 'PhrReturns', 'PhrRegisters'];

export const invApi = baseApi
  .enhanceEndpoints({
    addTagTypes: [...STOCK, ...DOCS, ...PHR, 'InvItems', 'InvStores', 'InvVendors'],
  })
  .injectEndpoints({
    endpoints: (b) => ({
      invItems: b.query({
        query: (params = {}) => ({ url: '/inventory/items', params: cleanParams(params) }),
        providesTags: ['InvItems'],
      }),
      createItem: b.mutation({
        query: (body) => post('/inventory/items', body),
        invalidatesTags: ['InvItems', ...STOCK],
      }),
      updateItem: b.mutation({
        query: ({ id, ...body }) => ({ url: `/inventory/items/${id}`, method: 'PUT', body }),
        invalidatesTags: ['InvItems', ...STOCK],
      }),
      invStores: b.query({ query: () => '/inventory/stores', providesTags: ['InvStores'] }),
      invVendors: b.query({ query: () => '/inventory/vendors', providesTags: ['InvVendors'] }),
      createVendor: b.mutation({
        query: (body) => post('/inventory/vendors', body),
        invalidatesTags: ['InvVendors'],
      }),
      invStock: b.query({
        query: (params = {}) => ({ url: '/inventory/stock', params: cleanParams(params) }),
        providesTags: ['InvStock'],
      }),
      itemBatches: b.query({
        query: ({ id, storeId }) => ({
          url: `/inventory/items/${id}/batches`,
          params: cleanParams({ storeId }),
        }),
        providesTags: ['InvBatches'],
      }),
      invLedger: b.query({
        query: (params = {}) => ({ url: '/inventory/ledger', params: cleanParams(params) }),
        providesTags: ['InvLedger'],
      }),
      purchaseOrders: b.query({
        query: (params = {}) => ({
          url: '/inventory/purchase-orders',
          params: cleanParams(params),
        }),
        providesTags: ['InvPos'],
      }),
      createPo: b.mutation({
        query: (body) => post('/inventory/purchase-orders', body),
        invalidatesTags: ['InvPos'],
      }),
      cancelPo: b.mutation({
        query: (id) => post(`/inventory/purchase-orders/${id}/cancel`),
        invalidatesTags: ['InvPos'],
      }),
      grns: b.query({ query: () => '/inventory/grns', providesTags: ['InvGrns'] }),
      createGrn: b.mutation({
        query: (body) => post('/inventory/grns', body),
        invalidatesTags: [...DOCS, ...STOCK],
      }),
      indents: b.query({
        query: (params = {}) => ({ url: '/inventory/indents', params: cleanParams(params) }),
        providesTags: ['InvIndents'],
      }),
      createIndent: b.mutation({
        query: (body) => post('/inventory/indents', body),
        invalidatesTags: ['InvIndents'],
      }),
      issueIndent: b.mutation({
        query: (id) => post(`/inventory/indents/${id}/issue`),
        invalidatesTags: [...DOCS, ...STOCK],
      }),
      stockTransfer: b.mutation({
        query: (body) => post('/inventory/transfers', body),
        invalidatesTags: [...STOCK, 'InvTransfers'],
      }),
      stockTransfers: b.query({
        query: () => '/inventory/transfers',
        providesTags: ['InvTransfers'],
      }),
      requisitions: b.query({
        query: (params = {}) => ({ url: '/inventory/requisitions', params: cleanParams(params) }),
        providesTags: ['InvRequisitions'],
      }),
      createRequisition: b.mutation({
        query: (body) => post('/inventory/requisitions', body),
        invalidatesTags: ['InvRequisitions'],
      }),
      reorderRequisition: b.mutation({
        query: (body) => post('/inventory/requisitions/reorder', body),
        invalidatesTags: ['InvRequisitions'],
      }),
      convertRequisition: b.mutation({
        query: ({ id, ...body }) => post(`/inventory/requisitions/${id}/convert`, body),
        invalidatesTags: ['InvRequisitions', 'InvPos'],
      }),
      rejectRequisition: b.mutation({
        query: ({ id, ...body }) => post(`/inventory/requisitions/${id}/reject`, body),
        invalidatesTags: ['InvRequisitions'],
      }),
      adjust: b.mutation({
        query: (body) => post('/inventory/adjustments', body),
        invalidatesTags: STOCK,
      }),
      reorder: b.query({
        query: (params = {}) => ({ url: '/inventory/reorder', params: cleanParams(params) }),
        providesTags: ['InvReorder'],
      }),
      expiryReport: b.query({
        query: (params = {}) => ({ url: '/inventory/reports/expiry', params: cleanParams(params) }),
        providesTags: ['InvReports'],
      }),
      deadStock: b.query({
        query: (params = {}) => ({
          url: '/inventory/reports/dead-stock',
          params: cleanParams(params),
        }),
        providesTags: ['InvReports'],
      }),
      // Pharmacy
      rxQueue: b.query({
        query: (params = {}) => ({ url: '/pharmacy/rx-queue', params: cleanParams(params) }),
        providesTags: ['PhrQueue'],
      }),
      rx: b.query({ query: (id) => `/pharmacy/rx/${id}`, providesTags: ['PhrRx'] }),
      cancelRx: b.mutation({
        query: ({ id, ...body }) => post(`/pharmacy/rx/${id}/cancel`, body),
        invalidatesTags: ['PhrQueue'],
      }),
      dispense: b.mutation({
        query: (body) => post('/pharmacy/sales', body),
        invalidatesTags: [...PHR, ...STOCK],
      }),
      dispenses: b.query({
        query: (params = {}) => ({ url: '/pharmacy/sales', params: cleanParams(params) }),
        providesTags: ['PhrSales'],
      }),
      phrReturns: b.query({
        query: (params = {}) => ({ url: '/pharmacy/returns', params: cleanParams(params) }),
        providesTags: ['PhrReturns'],
      }),
      requestReturn: b.mutation({
        query: (body) => post('/pharmacy/returns', body),
        invalidatesTags: ['PhrReturns'],
      }),
      decideReturn: b.mutation({
        query: ({ id, accept }) => post(`/pharmacy/returns/${id}/decide`, { accept }),
        invalidatesTags: [...PHR, ...STOCK],
      }),
      phrRegister: b.query({
        query: (params = {}) => ({ url: '/pharmacy/registers', params: cleanParams(params) }),
        providesTags: ['PhrRegisters'],
      }),
      salesSummary: b.query({
        query: (params = {}) => ({ url: '/pharmacy/sales-summary', params: cleanParams(params) }),
        providesTags: ['PhrSales'],
      }),
    }),
  });

export const {
  useInvItemsQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useInvStoresQuery,
  useInvVendorsQuery,
  useCreateVendorMutation,
  useInvStockQuery,
  useItemBatchesQuery,
  useInvLedgerQuery,
  usePurchaseOrdersQuery,
  useCreatePoMutation,
  useCancelPoMutation,
  useGrnsQuery,
  useCreateGrnMutation,
  useIndentsQuery,
  useCreateIndentMutation,
  useIssueIndentMutation,
  useStockTransferMutation,
  useStockTransfersQuery,
  useRequisitionsQuery,
  useCreateRequisitionMutation,
  useReorderRequisitionMutation,
  useConvertRequisitionMutation,
  useRejectRequisitionMutation,
  useAdjustMutation,
  useReorderQuery,
  useExpiryReportQuery,
  useDeadStockQuery,
  useRxQueueQuery,
  useRxQuery,
  useCancelRxMutation,
  useDispenseMutation,
  useDispensesQuery,
  usePhrReturnsQuery,
  useRequestReturnMutation,
  useDecideReturnMutation,
  usePhrRegisterQuery,
  useSalesSummaryQuery,
} = invApi;

export const SCHEDULE_TONE = {
  OTC: 'neutral',
  H: 'info',
  H1: 'warning',
  X: 'critical',
  NARCOTIC: 'critical',
};
export const PO_TONE = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  PARTIAL: 'accent',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
};
