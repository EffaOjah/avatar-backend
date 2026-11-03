import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';

/**
 * Allowed platform setting keys (validated before write).
 * Add new keys here as the platform grows.
 */
export const ALLOWED_SETTING_KEYS = new Set([
  'commission_rate_default',
  'delivery_fee_rules',
  'rider_claim_timeout_seconds',
  'refund_auto_approval_limit',
  'refund_super_admin_threshold',
  'wallet_adjustment_threshold',
  'payout_schedule',
  'payout_approval_threshold',
  'support_sla_targets',
  'moderation_strike_thresholds',
  'feature_flags',
  'maintenance_mode',
]);

export class AdminSettingsService {
  static async listSettings() {
    return prisma.platformSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  static async getSetting(key: string) {
    const setting = await prisma.platformSetting.findUnique({ where: { key } });
    if (!setting) throw Object.assign(new Error(`Setting '${key}' not found`), { status: 404 });
    return setting;
  }

  static async updateSetting(
    key: string,
    value: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    if (!ALLOWED_SETTING_KEYS.has(key)) {
      throw Object.assign(
        new Error(`'${key}' is not a recognised platform setting`),
        { status: 400 },
      );
    }

    const existing = await prisma.platformSetting.findUnique({ where: { key } });
    const before = existing ? { value: existing.value } : undefined;

    const updated = await prisma.platformSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'settings.update',
      entityType: 'PlatformSetting', entityId: key,
      before, after: { value }, reason, ip, requestId,
    });

    return updated;
  }
}

export class AdminAuditService {
  /**
   * Read audit logs. Super Admin sees all; other admins see only their own.
   */
  static async listAuditLogs(
    filters: {
      actorId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      requestId?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    },
    callerAdminId: string,
    isSuperAdmin: boolean,
  ) {
    const { actorId, action, entityType, entityId, requestId, from, to, cursor, limit = 20 } = filters;

    const where: any = {
      // Non-SA can only see their own logs
      ...(isSuperAdmin ? {} : { actorId: callerAdminId }),
      ...(actorId && isSuperAdmin ? { actorId } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const logs = await (prisma as any).auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = logs.length === limit ? logs[logs.length - 1].id : null;
    return { logs, meta: { cursor: nextCursor, limit } };
  }
}

export class AdminDashboardService {
  /**
   * Dashboard KPI aggregates (cached up to 60s in a real-world implementation).
   */
  static async getDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      ordersToday,
      activeRiders,
      pendingVerifications,
      newSignupsToday,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.rider.count({ where: { status: 'ONLINE' } }),
      prisma.business.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
    ]);

    return {
      ordersToday,
      activeRiders,
      pendingVerifications,
      newSignupsToday,
    };
  }
}
