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

// ── Orders ─────────────────────────────────────────────────────────────────────
router.get('/orders',
  requirePermission('orders:read'),
  AdminOrdersController.listOrders,
);
router.get('/orders/:id',
  requirePermission('orders:read'),
  AdminOrdersController.getOrderById,
);
router.post('/orders/:id/cancel',
  requirePermission('orders:manage'),
  validate(cancelOrderSchema),
  AdminOrdersController.cancelOrder,
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

export default router;
