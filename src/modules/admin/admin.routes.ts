import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware';
import { authenticateAdmin, requirePermission } from './admin.middleware';
import {
  AdminAuthController,
  AdminStaffController,
  AdminApprovalsController,
  AdminUsersController,
  AdminBusinessesController,
  AdminRidersController,
  AdminOrdersController,
  AdminSettingsController,
  AdminAuditController,
  AdminDashboardController,
  // Operations Admin
  AdminOpsOrdersController,
  AdminOpsRidersController,
  AdminOpsBusinessController,
  AdminOpsLookupController,
  AdminIncidentsController,
  AdminDisputesController,
  AdminOpsAnalyticsController,
  // Finance Admin
  AdminTransactionsController,
  AdminWalletsController,
  AdminRefundsController,
  AdminPayoutsController,
  AdminReconciliationController,
  AdminFinanceAnalyticsController,
  // Support Admin
  AdminTicketsController,
  AdminAccountActionsController,
  AdminSupportAnalyticsController,
  // Moderation Admin
  AdminContentController,
  AdminReviewsController,
  AdminAbuseReportsController,
  AdminUserRestrictionsController,
  AdminModerationAppealsController,
  AdminBlockedTermsController,
  AdminModerationAnalyticsController,
} from './admin.controller';
import {
  adminLoginSchema,
  adminMfaVerifySchema,
  adminPasswordResetRequestSchema,
  adminPasswordResetSchema,
  inviteAdminSchema,
  changeAdminRoleSchema,
  deactivateAdminSchema,
  suspendUserSchema,
  reactivateUserSchema,
  deleteUserSchema,
  rejectBusinessSchema,
  suspendBusinessSchema,
  rejectRiderSchema,
  suspendRiderSchema,
  cancelOrderSchema,
  overrideOrderStatusSchema,
  updateSettingSchema,
  decideApprovalSchema,
  auditLogQuerySchema,
  usersQuerySchema,
  // Operations Admin schemas
  ordersQuerySchema,
  reassignRiderSchema,
  riderDocumentActionSchema,
  suspendRiderOpsSchema,
  permanentSuspendRiderSchema,
  ridersQuerySchema,
  setBusinessStatusSchema,
  setProductAvailabilitySchema,
  sendNotificationSchema,
  logIncidentSchema,
  updateIncidentSchema,
  incidentsQuerySchema,
  openDisputeSchema,
  updateDisputeSchema,
  disputesQuerySchema,
  analyticsQuerySchema,
  // Finance Admin schemas
  transactionsQuerySchema,
  freezeWalletSchema,
  unfreezeWalletSchema,
  walletAdjustmentSchema,
  refundsQuerySchema,
  createRefundSchema,
  approveRefundSchema,
  rejectRefundSchema,
  payoutsQuerySchema,
  createPayoutBatchSchema,
  reconciliationRunsQuerySchema,
  triggerReconciliationSchema,
  resolveReconciliationFlagSchema,
  exportFinanceReportSchema,
  // Support Admin schemas
  ticketsQuerySchema,
  createTicketSchema,
  updateTicketSchema,
  ticketMessageSchema,
  cannedResponseSchema,
  accountActionSchema,
  // Moderation Admin schemas
  feedPostsQuerySchema,
  moderatePostSchema,
  storiesQuerySchema,
  removeStorySchema,
  reviewsQuerySchema,
  moderateReviewSchema,
  abuseReportsQuerySchema,
  resolveAbuseReportSchema,
  applyUserRestrictionSchema,
  appealsQuerySchema,
  decideAppealSchema,
  createBlockedTermSchema,
} from './admin.schema';

const router = Router();

// ── Public (no session) ──────────────────────────────────────────────────────
router.post('/auth/login', validate(adminLoginSchema), AdminAuthController.login);
router.post('/auth/mfa/verify', validate(adminMfaVerifySchema), AdminAuthController.verifyMfa);
router.post('/auth/refresh', AdminAuthController.refresh);
router.post('/auth/password/reset-request', validate(adminPasswordResetRequestSchema), AdminAuthController.requestPasswordReset);
router.post('/auth/password/reset', validate(adminPasswordResetSchema), AdminAuthController.resetPassword);

// ── Authenticated ────────────────────────────────────────────────────────────
router.use(authenticateAdmin);

// Auth (self-service)
router.post('/auth/logout', AdminAuthController.logout);
router.get('/auth/me', AdminAuthController.getMe);
router.get('/auth/sessions', AdminAuthController.listSessions);
router.delete('/auth/sessions/:sessionId', AdminAuthController.revokeSession);

// Dashboard
router.get('/dashboard',
  requirePermission('analytics:read'),
  AdminDashboardController.getDashboard,
);

// ── Staff / Admin management ─────────────────────────────────────────────────
router.get('/admins',
  requirePermission('admins:manage'),
  AdminStaffController.listAdmins,
);
router.post('/admins/invitations',
  requirePermission('admins:manage'),
  validate(inviteAdminSchema),
  AdminStaffController.inviteAdmin,
);
router.patch('/admins/:id/role',
  requirePermission('admins:manage'),
  validate(changeAdminRoleSchema),
  AdminStaffController.requestRoleChange,
);
router.post('/admins/:id/deactivate',
  requirePermission('admins:manage'),
  validate(deactivateAdminSchema),
  AdminStaffController.requestDeactivation,
);
router.post('/admins/:id/reset-mfa',
  requirePermission('admins:manage'),
  AdminStaffController.resetMfa,
);

// ── Approvals ─────────────────────────────────────────────────────────────────
router.get('/approvals',
  requirePermission('admins:manage'),
  AdminApprovalsController.listPending,
);
router.post('/approvals/:id/decide',
  requirePermission('admins:manage'),
  validate(decideApprovalSchema),
  AdminApprovalsController.decide,
);

// ── Users / Customers ─────────────────────────────────────────────────────────
router.get('/users',
  requirePermission('users:read'),
  validate(usersQuerySchema),
  AdminUsersController.listUsers,
);
router.get('/users/:id',
  requirePermission('users:read'),
  AdminUsersController.getUserById,
);
router.post('/users/:id/suspend',
  requirePermission('users:manage'),
  validate(suspendUserSchema),
  AdminUsersController.suspendUser,
);
router.post('/users/:id/reactivate',
  requirePermission('users:manage'),
  validate(reactivateUserSchema),
  AdminUsersController.reactivateUser,
);
router.post('/users/:id/force-logout',
  requirePermission('users:manage'),
  AdminUsersController.forceLogout,
);
router.delete('/users/:id',
  requirePermission('users:delete'),
  validate(deleteUserSchema),
  AdminUsersController.deleteUser,
);

// ── Businesses ─────────────────────────────────────────────────────────────────
router.get('/businesses',
  requirePermission('businesses:read'),
  AdminBusinessesController.listBusinesses,
);
router.get('/businesses/:id',
  requirePermission('businesses:read'),
  AdminBusinessesController.getBusinessById,
);
router.post('/businesses/:id/approve',
  requirePermission('businesses:approve'),
  AdminBusinessesController.approveBusiness,
);
router.post('/businesses/:id/reject',
  requirePermission('businesses:approve'),
  validate(rejectBusinessSchema),
  AdminBusinessesController.rejectBusiness,
);
router.post('/businesses/:id/suspend',
  requirePermission('businesses:suspend'),
  validate(suspendBusinessSchema),
  AdminBusinessesController.suspendBusiness,
);
router.post('/businesses/:id/reactivate',
  requirePermission('businesses:manage'),
  validate(reactivateUserSchema),
  AdminBusinessesController.reactivateBusiness,
);

// ── Riders ─────────────────────────────────────────────────────────────────────
router.get('/riders',
  requirePermission('riders:read'),
  AdminRidersController.listRiders,
);
router.get('/riders/:id',
  requirePermission('riders:read'),
  AdminRidersController.getRiderById,
);
router.post('/riders/:id/approve',
  requirePermission('riders:approve'),
  AdminRidersController.approveRider,
);
router.post('/riders/:id/reject',
  requirePermission('riders:approve'),
  validate(rejectRiderSchema),
  AdminRidersController.rejectRider,
);
router.post('/riders/:id/suspend',
  requirePermission('riders:manage'),
  validate(suspendRiderSchema),
  AdminRidersController.suspendRider,
);
router.post('/riders/:id/reactivate',
  requirePermission('riders:manage'),
  validate(reactivateUserSchema),
  AdminRidersController.reactivateRider,
);

// ── Orders (OP-01, OP-03) ─────────────────────────────────────────────────────
// /stream must be declared before /:id to prevent "stream" matching as an id param
router.get('/orders/stream',
  requirePermission('orders:read'),
  AdminOpsOrdersController.streamOrders,
);
router.get('/orders',
  requirePermission('orders:read'),
  validate(ordersQuerySchema),
  AdminOpsOrdersController.listOrders,
);
router.get('/orders/:id',
  requirePermission('orders:read'),
  AdminOpsOrdersController.getOrderDetail,
);
router.post('/orders/:id/cancel',
  requirePermission('orders:manage'),
  validate(cancelOrderSchema),
  AdminOrdersController.cancelOrder,
);
router.post('/orders/:id/reassign',
  requirePermission('orders:manage'),
  validate(reassignRiderSchema),
  AdminOpsOrdersController.reassignRider,
);
router.post('/orders/:id/pin/regenerate',
  requirePermission('orders:manage'),
  AdminOpsOrdersController.regeneratePin,
);
router.post('/orders/:id/override-status',
  requirePermission('orders:override'),
  validate(overrideOrderStatusSchema),
  AdminOrdersController.overrideStatus,
);

// ── Platform Settings (Super Admin only) ──────────────────────────────────────
router.get('/settings',
  requirePermission('settings:read'),
  AdminSettingsController.listSettings,
);
router.get('/settings/:key',
  requirePermission('settings:read'),
  AdminSettingsController.getSetting,
);
router.put('/settings/:key',
  requirePermission('settings:write'),
  validate(updateSettingSchema),
  AdminSettingsController.updateSetting,
);

// ── Audit Logs ─────────────────────────────────────────────────────────────────
router.get('/audit-logs',
  requirePermission('audit:read'),
  validate(auditLogQuerySchema),
  AdminAuditController.listAuditLogs,
);

// ── Operations: Rider Roster (OP-04) ─────────────────────────────────────────
router.get('/ops/riders',
  requirePermission('riders:read'),
  validate(ridersQuerySchema),
  AdminOpsRidersController.listRiders,
);
router.post('/ops/riders/:id/documents/:documentId/approve',
  requirePermission('riders:approve'),
  AdminOpsRidersController.approveDocument,
);
router.post('/ops/riders/:id/documents/:documentId/reject',
  requirePermission('riders:approve'),
  validate(riderDocumentActionSchema),
  AdminOpsRidersController.rejectDocument,
);
router.post('/ops/riders/:id/suspend',
  requirePermission('riders:manage'),
  validate(suspendRiderOpsSchema),
  AdminOpsRidersController.suspendRider,
);
router.post('/ops/riders/:id/request-permanent-suspension',
  requirePermission('riders:manage'),
  validate(permanentSuspendRiderSchema),
  AdminOpsRidersController.requestPermanentSuspension,
);

// ── Operations: Business Support (OP-05) ────────────────────────────────────
router.patch('/ops/businesses/:id/status',
  requirePermission('businesses:manage'),
  validate(setBusinessStatusSchema),
  AdminOpsBusinessController.setStatus,
);
router.patch('/ops/businesses/:id/products/:productId/availability',
  requirePermission('businesses:manage'),
  validate(setProductAvailabilitySchema),
  AdminOpsBusinessController.setProductAvailability,
);

// ── Operations: Lookup + Notify (OP-06) ──────────────────────────────────────
router.get('/lookup',
  requirePermission('users:read'),
  AdminOpsLookupController.unifiedLookup,
);
router.post('/users/:id/notify',
  requirePermission('notifications:send:targeted'),
  validate(sendNotificationSchema),
  AdminOpsLookupController.sendNotification,
);

// ── Operations: Incidents (OP-07) ─────────────────────────────────────────────
router.get('/incidents',
  requirePermission('incidents:manage'),
  validate(incidentsQuerySchema),
  AdminIncidentsController.listIncidents,
);
router.post('/incidents',
  requirePermission('incidents:manage'),
  validate(logIncidentSchema),
  AdminIncidentsController.logIncident,
);
router.get('/incidents/:id',
  requirePermission('incidents:manage'),
  AdminIncidentsController.getIncident,
);
router.patch('/incidents/:id',
  requirePermission('incidents:manage'),
  validate(updateIncidentSchema),
  AdminIncidentsController.updateIncident,
);

// ── Operations: Disputes (OP-07) ──────────────────────────────────────────────
router.get('/disputes',
  requirePermission('disputes:read'),
  validate(disputesQuerySchema),
  AdminDisputesController.listDisputes,
);
router.post('/disputes',
  requirePermission('disputes:manage'),
  validate(openDisputeSchema),
  AdminDisputesController.openDispute,
);
router.get('/disputes/:id',
  requirePermission('disputes:read'),
  AdminDisputesController.getDispute,
);
router.patch('/disputes/:id',
  requirePermission('disputes:manage'),
  validate(updateDisputeSchema),
  AdminDisputesController.updateDispute,
);

// ── Operations: Analytics (OP-08) ─────────────────────────────────────────────
router.get('/analytics/operations',
  requirePermission('analytics:read:operations'),
  validate(analyticsQuerySchema),
  AdminOpsAnalyticsController.getAnalytics,
);

// ── Finance: Transactions (FN-01) ─────────────────────────────────────────────
router.get('/transactions',
  requirePermission('transactions:read'),
  validate(transactionsQuerySchema),
  AdminTransactionsController.listTransactions,
);
router.get('/transactions/:id',
  requirePermission('transactions:read'),
  AdminTransactionsController.getTransaction,
);

// ── Finance: Wallets (FN-02, FN-08) ───────────────────────────────────────────
router.get('/wallets/:id',
  requirePermission('wallets:read'),
  AdminWalletsController.getWallet,
);
router.get('/wallets/:id/ledger',
  requirePermission('wallets:read'),
  AdminWalletsController.getWalletLedger,
);
router.post('/wallets/:id/freeze',
  requirePermission('wallets:freeze'),
  validate(freezeWalletSchema),
  AdminWalletsController.freezeWallet,
);
router.post('/wallets/:id/unfreeze',
  requirePermission('wallets:freeze'),
  validate(unfreezeWalletSchema),
  AdminWalletsController.unfreezeWallet,
);
router.post('/wallets/adjustments',
  requirePermission('wallets:adjust:request'),
  validate(walletAdjustmentSchema),
  AdminWalletsController.requestAdjustment,
);

// ── Finance: Refunds (FN-05) ──────────────────────────────────────────────────
router.get('/refunds',
  requirePermission('refunds:read'),
  validate(refundsQuerySchema),
  AdminRefundsController.listRefunds,
);
router.get('/refunds/:id',
  requirePermission('refunds:read'),
  AdminRefundsController.getRefund,
);
router.post('/refunds',
  requirePermission('refunds:request'),
  validate(createRefundSchema),
  AdminRefundsController.requestRefund,
);
router.post('/refunds/:id/approve',
  requirePermission('refunds:decide'),
  validate(approveRefundSchema),
  AdminRefundsController.approveRefund,
);
router.post('/refunds/:id/reject',
  requirePermission('refunds:decide'),
  validate(rejectRefundSchema),
  AdminRefundsController.rejectRefund,
);

// ── Finance: Payouts (FN-04) ──────────────────────────────────────────────────
router.get('/payouts',
  requirePermission('payouts:read'),
  validate(payoutsQuerySchema),
  AdminPayoutsController.listPayouts,
);
router.post('/payouts/batches',
  requirePermission('payouts:manage'),
  validate(createPayoutBatchSchema),
  AdminPayoutsController.createBatch,
);
router.get('/payouts/batches/:id',
  requirePermission('payouts:read'),
  AdminPayoutsController.getBatch,
);
router.post('/payouts/batches/:id/approve',
  requirePermission('payouts:approve'),
  AdminPayoutsController.approveBatch,
);
router.post('/payouts/batches/:id/submit',
  requirePermission('payouts:manage'),
  AdminPayoutsController.submitBatch,
);
router.post('/payouts/:id/retry',
  requirePermission('payouts:manage'),
  AdminPayoutsController.retryLine,
);

// ── Finance: Reconciliation (FN-06) ───────────────────────────────────────────
router.get('/reconciliation/runs',
  requirePermission('reconciliation:read'),
  validate(reconciliationRunsQuerySchema),
  AdminReconciliationController.listRuns,
);
router.post('/reconciliation/runs',
  requirePermission('reconciliation:read'),
  validate(triggerReconciliationSchema),
  AdminReconciliationController.triggerRun,
);
router.get('/reconciliation/runs/:id',
  requirePermission('reconciliation:read'),
  AdminReconciliationController.getRun,
);
router.post('/reconciliation/flags/:id/resolve',
  requirePermission('reconciliation:read'),
  validate(resolveReconciliationFlagSchema),
  AdminReconciliationController.resolveFlag,
);

// ── Finance: Analytics & Reports (FN-03, FN-07) ───────────────────────────────
router.get('/analytics/finance',
  requirePermission('analytics:read:finance'),
  validate(analyticsQuerySchema),
  AdminFinanceAnalyticsController.getOverview,
);
router.post('/exports/finance',
  requirePermission('finance_reports:export'),
  validate(exportFinanceReportSchema),
  AdminFinanceAnalyticsController.exportReport,
);

// ── Support: Tickets (SP-01, SP-02, SP-07) ────────────────────────────────────
router.get('/tickets',
  requirePermission('tickets:read'),
  validate(ticketsQuerySchema),
  AdminTicketsController.listTickets,
);
router.post('/tickets',
  requirePermission('tickets:manage'),
  validate(createTicketSchema),
  AdminTicketsController.createTicket,
);
router.get('/tickets/:id',
  requirePermission('tickets:read'),
  AdminTicketsController.getTicket,
);
router.patch('/tickets/:id',
  requirePermission('tickets:manage'),
  validate(updateTicketSchema),
  AdminTicketsController.updateTicket,
);
router.post('/tickets/:id/messages',
  requirePermission('tickets:manage'),
  validate(ticketMessageSchema),
  AdminTicketsController.addMessage,
);
router.get('/canned-responses',
  requirePermission('tickets:manage'),
  AdminTicketsController.listCannedResponses,
);
router.post('/canned-responses',
  requirePermission('tickets:manage'),
  validate(cannedResponseSchema),
  AdminTicketsController.createCannedResponse,
);

// ── Support: Account Actions (SP-05) ──────────────────────────────────────────
router.post('/users/:id/account-actions',
  requirePermission('users:manage'),
  validate(accountActionSchema),
  AdminAccountActionsController.performAction,
);

// ── Support: Analytics (SP-08) ────────────────────────────────────────────────
router.get('/analytics/support',
  requirePermission('analytics:read:support'),
  validate(analyticsQuerySchema),
  AdminSupportAnalyticsController.getMetrics,
);

// ── Moderation: Content & Feed (MD-01, MD-02) ─────────────────────────────────
router.get('/content/feed',
  requirePermission('content:read'),
  validate(feedPostsQuerySchema),
  AdminContentController.listFeedPosts,
);
router.post('/content/feed/:id/moderate',
  requirePermission('content:moderate'),
  validate(moderatePostSchema),
  AdminContentController.moderatePost,
);
router.get('/content/stories',
  requirePermission('content:read'),
  validate(storiesQuerySchema),
  AdminContentController.listStories,
);
router.post('/content/stories/:id/remove',
  requirePermission('content:moderate'),
  validate(removeStorySchema),
  AdminContentController.removeStory,
);

// ── Moderation: Reviews (MD-04) ───────────────────────────────────────────────
router.get('/reviews',
  requirePermission('reviews:read'),
  validate(reviewsQuerySchema),
  AdminReviewsController.listReviews,
);
router.post('/reviews/:id/moderate',
  requirePermission('reviews:moderate'),
  validate(moderateReviewSchema),
  AdminReviewsController.moderateReview,
);

// ── Moderation: Abuse Reports & Restrictions (MD-03, MD-05, MD-06) ─────────────
router.get('/abuse-reports',
  requirePermission('abuse_reports:read'),
  validate(abuseReportsQuerySchema),
  AdminAbuseReportsController.listReports,
);
router.post('/abuse-reports/:id/resolve',
  requirePermission('abuse_reports:manage'),
  validate(resolveAbuseReportSchema),
  AdminAbuseReportsController.resolveReport,
);
router.post('/users/:id/restrictions',
  requirePermission('abuse_reports:manage'),
  validate(applyUserRestrictionSchema),
  AdminUserRestrictionsController.applyRestriction,
);
router.get('/users/restrictions',
  requirePermission('abuse_reports:read'),
  AdminUserRestrictionsController.listRestrictions,
);

// ── Moderation: Appeals & Blocked Terms (MD-07, MD-08) ─────────────────────────
router.get('/moderation/appeals',
  requirePermission('content:moderate'),
  validate(appealsQuerySchema),
  AdminModerationAppealsController.listAppeals,
);
router.post('/moderation/appeals/:id/decide',
  requirePermission('content:moderate'),
  validate(decideAppealSchema),
  AdminModerationAppealsController.decideAppeal,
);
router.get('/moderation/blocked-terms',
  requirePermission('content:moderate'),
  AdminBlockedTermsController.listTerms,
);
router.post('/moderation/blocked-terms',
  requirePermission('content:moderate'),
  validate(createBlockedTermSchema),
  AdminBlockedTermsController.addTerm,
);
router.delete('/moderation/blocked-terms/:id',
  requirePermission('content:moderate'),
  AdminBlockedTermsController.removeTerm,
);

// ── Moderation: Analytics ─────────────────────────────────────────────────────
router.get('/analytics/moderation',
  requirePermission('analytics:read:moderation'),
  validate(analyticsQuerySchema),
  AdminModerationAnalyticsController.getMetrics,
);

export default router;
