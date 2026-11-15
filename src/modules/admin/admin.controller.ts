import { Response } from 'express';
import { AdminRequest } from './admin.middleware';
import {
  AdminAuthService,
  AdminStaffService,
  ApprovalService,
} from './admin.service';
import { AdminUsersService } from './admin-users.service';
import { AdminBusinessesService } from './admin-businesses.service';
import { AdminRidersService } from './admin-riders.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminSettingsService, AdminAuditService, AdminDashboardService } from './admin-settings.service';
import {
  AdminOpsOrdersService,
  AdminOpsRidersService,
  AdminOpsBusinessService,
  AdminOpsLookupService,
  AdminIncidentsService,
  AdminDisputesService,
  AdminOpsAnalyticsService,
} from './admin-ops.service';
import {
  AdminTransactionsService,
  AdminWalletsService,
  AdminRefundsService,
  AdminPayoutsService,
  AdminReconciliationService,
  AdminFinanceAnalyticsService,
} from './admin-finance.service';

/** Thin wrapper: send success response */
const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

/** Thin wrapper: send error response */
const fail = (res: Response, error: any) => {
  const status = error?.status ?? 500;
  const code = error?.code ?? 'INTERNAL_ERROR';
  const message = error?.message ?? 'An unexpected error occurred';
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export class AdminAuthController {
  static async login(req: AdminRequest, res: Response) {
    try {
      const { email, password } = req.body;
      const ip = req.ip;
      const userAgent = req.headers['user-agent'];
      const result = await AdminAuthService.loginStep1(email, password, ip, userAgent);
      ok(res, result);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async verifyMfa(req: AdminRequest, res: Response) {
    try {
      const { mfaToken, totp } = req.body;
      const ip = req.ip;
      const userAgent = req.headers['user-agent'];
      const result = await AdminAuthService.loginStep2(mfaToken, totp, ip, userAgent);

      // Set httpOnly cookie
      res.cookie('adminAccessToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 min
      });
      res.cookie('adminRefreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      ok(res, { admin: result.admin });
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async refresh(req: AdminRequest, res: Response) {
    try {
      const refreshToken =
        req.cookies?.adminRefreshToken ||
        (req.headers['x-refresh-token'] as string | undefined);
      if (!refreshToken) {
        res.status(401).json({ success: false, error: { code: 'MISSING_REFRESH_TOKEN', message: 'No refresh token' } });
        return;
      }
      const result = await AdminAuthService.refreshTokens(refreshToken, req.ip, req.headers['user-agent']);
      res.cookie('adminAccessToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('adminRefreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      ok(res, { message: 'Tokens refreshed' });
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async logout(req: AdminRequest, res: Response) {
    try {
      if (req.admin) {
        await AdminAuthService.logout(req.admin.sessionId, req.admin.id);
      }
      res.clearCookie('adminAccessToken');
      res.clearCookie('adminRefreshToken');
      ok(res, { message: 'Logged out' });
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getMe(req: AdminRequest, res: Response) {
    try {
      const data = await AdminAuthService.getMe(req.admin!.id);
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async requestPasswordReset(req: AdminRequest, res: Response) {
    try {
      const result = await AdminAuthService.requestPasswordReset(req.body.email);
      ok(res, result);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async resetPassword(req: AdminRequest, res: Response) {
    try {
      const { token, newPassword } = req.body;
      const result = await AdminAuthService.resetPassword(token, newPassword, req.ip);
      ok(res, result);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async listSessions(req: AdminRequest, res: Response) {
    try {
      const data = await AdminAuthService.listSessions(req.admin!.id);
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async revokeSession(req: AdminRequest, res: Response) {
    try {
      const sessionId = req.params.sessionId as string;
      await AdminAuthService.revokeSession(sessionId, req.admin!.id);
      ok(res, { message: 'Session revoked' });
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export class AdminStaffController {
  static async listAdmins(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminStaffService.listAdmins());
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async inviteAdmin(req: AdminRequest, res: Response) {
    try {
      const admin = await AdminStaffService.inviteAdmin(req.body, req.admin!.id, req.ip);
      ok(res, admin, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async requestRoleChange(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const request = await AdminStaffService.requestRoleChange(
        id,
        req.body.role,
        req.body.reason,
        req.admin!.id,
        req.ip,
      );
      ok(res, request, 202);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async requestDeactivation(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const request = await AdminStaffService.requestDeactivation(
        id,
        req.body.reason,
        req.admin!.id,
        req.ip,
      );
      ok(res, request, 202);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async resetMfa(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const result = await AdminStaffService.resetMfa(id, req.admin!.id, req.ip);
      ok(res, result);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVALS
// ─────────────────────────────────────────────────────────────────────────────

export class AdminApprovalsController {
  static async listPending(req: AdminRequest, res: Response) {
    try {
      const isSA = req.admin!.role === 'SUPER_ADMIN';
      ok(res, await ApprovalService.listPending(req.admin!.id, isSA));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async decide(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const result = await ApprovalService.decide(
        id,
        req.body.decision,
        req.body.reason,
        req.admin!.id,
        req.ip,
      );
      ok(res, result);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

export class AdminUsersController {
  static async listUsers(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminUsersService.listUsers(req.query as any, req.admin!.role));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getUserById(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminUsersService.getUserById(id));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async suspendUser(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminUsersService.suspendUser(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.body.until, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async reactivateUser(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminUsersService.reactivateUser(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async forceLogout(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminUsersService.forceLogout(
        id, req.admin!.id, req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async deleteUser(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminUsersService.softDeleteUser(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESSES
// ─────────────────────────────────────────────────────────────────────────────

export class AdminBusinessesController {
  static async listBusinesses(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminBusinessesService.listBusinesses(req.query as any));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getBusinessById(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminBusinessesService.getBusinessById(id));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async approveBusiness(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminBusinessesService.approveBusiness(
        id, req.admin!.id, req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async rejectBusiness(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminBusinessesService.rejectBusiness(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async suspendBusiness(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminBusinessesService.suspendBusiness(
        id, req.body.reason, req.body.permanent ?? false,
        req.admin!.id, req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async reactivateBusiness(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminBusinessesService.reactivateBusiness(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RIDERS
// ─────────────────────────────────────────────────────────────────────────────

export class AdminRidersController {
  static async listRiders(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminRidersService.listRiders(req.query as any));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getRiderById(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminRidersService.getRiderById(id));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async approveRider(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminRidersService.approveRider(
        id, req.admin!.id, req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async rejectRider(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminRidersService.rejectRider(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async suspendRider(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminRidersService.suspendRider(
        id, req.body.reason, req.body.permanent ?? false,
        req.admin!.id, req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async reactivateRider(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminRidersService.reactivateRider(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOrdersController {
  static async listOrders(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminOrdersService.listOrders(req.query as any));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getOrderById(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminOrdersService.getOrderById(id));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async cancelOrder(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminOrdersService.cancelOrder(
        id, req.body.reason, req.admin!.id,
        req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async overrideStatus(req: AdminRequest, res: Response) {
    try {
      const id = req.params.id as string;
      ok(res, await AdminOrdersService.overrideStatus(
        id, req.body.status, req.body.reason,
        req.admin!.id, req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export class AdminSettingsController {
  static async listSettings(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminSettingsService.listSettings());
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getSetting(req: AdminRequest, res: Response) {
    try {
      const key = req.params.key as string;
      ok(res, await AdminSettingsService.getSetting(key));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async updateSetting(req: AdminRequest, res: Response) {
    try {
      const key = req.params.key as string;
      ok(res, await AdminSettingsService.updateSetting(
        key, req.body.value, req.body.reason,
        req.admin!.id, req.admin!.role, req.ip, req.admin!.requestId,
      ));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────

export class AdminAuditController {
  static async listAuditLogs(req: AdminRequest, res: Response) {
    try {
      const isSA = req.admin!.role === 'SUPER_ADMIN';
      ok(res, await AdminAuditService.listAuditLogs(req.query as any, req.admin!.id, isSA));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export class AdminDashboardController {
  static async getDashboard(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminDashboardService.getDashboard());
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPS — ORDERS (OP-01, OP-03)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsOrdersController {
  static async listOrders(req: AdminRequest, res: Response) {
    try {
      const { status, businessId, riderId, zone, minAgeMinutes, cursor, limit } = req.query as any;
      const data = await AdminOpsOrdersService.listOrders({
        status,
        businessId,
        riderId,
        zone,
        minAgeMinutes: minAgeMinutes ? parseInt(minAgeMinutes, 10) : undefined,
        cursor,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getOrderDetail(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminOpsOrdersService.getOrderDetail(req.params.id as string));
    } catch (e: any) {
      fail(res, e);
    }
  }

  /**
   * OP-01 — SSE live orders stream.
   * Sends current order snapshot then polls every 15 s.
   */
  static async streamOrders(req: AdminRequest, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendSnapshot = async () => {
      try {
        const { status, zone } = req.query as any;
        const data = await AdminOpsOrdersService.listOrders({ status, zone, limit: 100 });
        res.write(`data: ${JSON.stringify({ type: 'snapshot', payload: data })}\n\n`);
      } catch {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to fetch orders' })}\n\n`);
      }
    };

    // Send initial snapshot
    await sendSnapshot();

    // Poll every 15 seconds
    const interval = setInterval(sendSnapshot, 15_000);

    // Keep-alive comment every 15 s
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15_000);

    req.on('close', () => {
      clearInterval(interval);
      clearInterval(keepAlive);
    });
  }

  static async reassignRider(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminOpsOrdersService.reassignRider(
        req.params.id as string,
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async regeneratePin(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminOpsOrdersService.regeneratePin(
        req.params.id as string,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPS — RIDERS (OP-04)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsRidersController {
  static async listRiders(req: AdminRequest, res: Response) {
    try {
      const { online, zone, verificationStatus, cursor, limit } = req.query as any;
      const data = await AdminOpsRidersService.listRiders({
        online: online === 'true' ? true : online === 'false' ? false : undefined,
        zone,
        verificationStatus,
        cursor,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async approveDocument(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminOpsRidersService.approveDocument(
        req.params.id as string,
        req.params.documentId as string,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async rejectDocument(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminOpsRidersService.rejectDocument(
        req.params.id as string,
        req.params.documentId as string,
        req.body.reason as string,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async suspendRider(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminOpsRidersService.suspendRider(
        req.params.id as string,
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async requestPermanentSuspension(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminOpsRidersService.requestPermanentSuspension(
        req.params.id as string,
        req.body.reason as string,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 202);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPS — BUSINESSES (OP-05)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsBusinessController {
  static async setStatus(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const { status, reason } = req.body;
      const data = await AdminOpsBusinessService.setBusinessStatus(
        req.params.id as string,
        status,
        reason,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async setProductAvailability(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const { isAvailable, reason } = req.body;
      const data = await AdminOpsBusinessService.setProductAvailability(
        req.params.id as string,
        req.params.productId as string,
        isAvailable,
        reason,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPS — LOOKUP + NOTIFY (OP-06)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsLookupController {
  static async unifiedLookup(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const { q } = req.query as { q?: string };
      if (!q || q.trim().length < 2) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: 'q must be at least 2 characters' } });
      }
      const data = await AdminOpsLookupService.unifiedLookup(q.trim(), admin.role);
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async sendNotification(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminOpsLookupService.sendTargetedNotification(
        req.params.id as string,
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPS — INCIDENTS (OP-07)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminIncidentsController {
  static async listIncidents(req: AdminRequest, res: Response) {
    try {
      const { status, type, orderId, riderId, cursor, limit } = req.query as any;
      ok(res, await AdminIncidentsService.listIncidents({ status, type, orderId, riderId, cursor, limit: limit ? parseInt(limit, 10) : 20 }));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getIncident(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminIncidentsService.getIncidentById(req.params.id as string));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async logIncident(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminIncidentsService.logIncident(
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async updateIncident(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminIncidentsService.updateIncident(
        req.params.id as string,
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPS — DISPUTES (OP-07)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminDisputesController {
  static async listDisputes(req: AdminRequest, res: Response) {
    try {
      const { status, orderId, cursor, limit } = req.query as any;
      ok(res, await AdminDisputesService.listDisputes({ status, orderId, cursor, limit: limit ? parseInt(limit, 10) : 20 }));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getDispute(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminDisputesService.getDisputeById(req.params.id as string));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async openDispute(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminDisputesService.openDispute(
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async updateDispute(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminDisputesService.updateDispute(
        req.params.id as string,
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPS — ANALYTICS (OP-08)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsAnalyticsController {
  static async getAnalytics(req: AdminRequest, res: Response) {
    try {
      const { from, to } = req.query as any;
      ok(res, await AdminOpsAnalyticsService.getOperationalAnalytics({ from, to }));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE — TRANSACTIONS (FN-01)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminTransactionsController {
  static async listTransactions(req: AdminRequest, res: Response) {
    try {
      const { reference, orderId, userId, status, provider, minAmount, maxAmount, cursor, limit } = req.query as any;
      const data = await AdminTransactionsService.listTransactions({
        reference,
        orderId,
        userId,
        status,
        provider,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
        cursor,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getTransaction(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminTransactionsService.getTransactionById(req.params.id as string));
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE — WALLETS (FN-02, FN-08)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminWalletsController {
  static async getWallet(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      ok(res, await AdminWalletsService.getWalletById(req.params.id as string, admin.role));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getWalletLedger(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const { cursor, limit } = req.query as any;
      const data = await AdminWalletsService.getWalletLedger(
        req.params.id as string,
        { cursor, limit: limit ? parseInt(limit, 10) : 20 },
        admin.role,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async freezeWallet(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminWalletsService.freezeWallet(
        req.params.id as string,
        req.body.reason,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async unfreezeWallet(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminWalletsService.unfreezeWallet(
        req.params.id as string,
        req.body.reason,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async requestAdjustment(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminWalletsService.requestAdjustment(
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 202);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE — REFUNDS (FN-05)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminRefundsController {
  static async listRefunds(req: AdminRequest, res: Response) {
    try {
      const { status, orderId, requestedBy, cursor, limit } = req.query as any;
      const data = await AdminRefundsService.listRefunds({
        status,
        orderId,
        requestedBy,
        cursor,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getRefund(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminRefundsService.getRefundById(req.params.id as string));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async requestRefund(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminRefundsService.requestRefund(
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async approveRefund(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminRefundsService.approveRefund(
        req.params.id as string,
        req.body,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async rejectRefund(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminRefundsService.rejectRefund(
        req.params.id as string,
        req.body.reason,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE — PAYOUTS (FN-04)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminPayoutsController {
  static async listPayouts(req: AdminRequest, res: Response) {
    try {
      const { batchId, status, recipientType, cursor, limit } = req.query as any;
      const data = await AdminPayoutsService.listPayoutLines({
        batchId,
        status,
        recipientType,
        cursor,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async createBatch(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const { periodStart, periodEnd, notes } = req.body;
      const data = await AdminPayoutsService.createBatch(
        new Date(periodStart),
        new Date(periodEnd),
        notes,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getBatch(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminPayoutsService.getBatchById(req.params.id as string));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async approveBatch(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminPayoutsService.approveBatch(
        req.params.id as string,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async submitBatch(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminPayoutsService.submitBatch(
        req.params.id as string,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async retryLine(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminPayoutsService.retryLine(
        req.params.id as string,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE — RECONCILIATION (FN-06)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminReconciliationController {
  static async listRuns(req: AdminRequest, res: Response) {
    try {
      const { cursor, limit } = req.query as any;
      ok(res, await AdminReconciliationService.listRuns({ cursor, limit: limit ? parseInt(limit, 10) : 20 }));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async getRun(req: AdminRequest, res: Response) {
    try {
      ok(res, await AdminReconciliationService.getRunById(req.params.id as string));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async triggerRun(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const { periodStart, periodEnd, notes } = req.body;
      const data = await AdminReconciliationService.runReconciliation(
        new Date(periodStart),
        new Date(periodEnd),
        notes,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async resolveFlag(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const data = await AdminReconciliationService.resolveFlag(
        req.params.id as string,
        req.body.note,
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data);
    } catch (e: any) {
      fail(res, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE — ANALYTICS & EXPORTS (FN-03, FN-07)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminFinanceAnalyticsController {
  static async getOverview(req: AdminRequest, res: Response) {
    try {
      const { from, to } = req.query as any;
      ok(res, await AdminFinanceAnalyticsService.getOverview({ from, to }));
    } catch (e: any) {
      fail(res, e);
    }
  }

  static async exportReport(req: AdminRequest, res: Response) {
    try {
      const admin = req.admin!;
      const { type, format } = req.body;
      const data = await AdminFinanceAnalyticsService.exportReport(
        type,
        format ?? 'CSV',
        admin.id,
        admin.role,
        req.ip,
        req.headers['x-request-id'] as string,
      );
      ok(res, data, 201);
    } catch (e: any) {
      fail(res, e);
    }
  }
}
