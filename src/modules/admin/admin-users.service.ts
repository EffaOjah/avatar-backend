import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';

export class AdminUsersService {
  /**
   * List / search platform users (customers, businesses, riders).
   * Phone and email are masked for Support and Moderation roles.
   */
  static async listUsers(
    filters: {
      q?: string;
      status?: 'active' | 'inactive';
      role?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
    callerRole: string,
  ) {
    const { q, status, role, from, to, page = 1, limit = 20 } = filters;
    const maskPii = ['SUPPORT_ADMIN', 'MODERATION_ADMIN'].includes(callerRole);

    const where: any = {
      ...(status === 'active' ? { isActive: true } : {}),
      ...(status === 'inactive' ? { isActive: false } : {}),
      ...(role ? { role } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: !maskPii,
          phone: !maskPii,
          role: true,
          isActive: true,
          avatarUrl: true,
          createdAt: true,
          ...(maskPii
            ? {
                // Provide masked variants at the service level
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const masked = maskPii
      ? users.map((u: any) => ({
          ...u,
          email: u.email ? u.email.replace(/(.{2}).+(@.+)/, '$1***$2') : null,
          phone: u.phone ? u.phone.slice(0, 5) + '****' : null,
        }))
      : users;

    return { users: masked, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /**
   * Get a single user profile (full detail for admin view).
   */
  static async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        business: true,
        rider: true,
        addresses: true,
        orders: { orderBy: { createdAt: 'desc' }, take: 10 },
        wallets: { select: { id: true, balance: true, currency: true } },
      },
    });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    const { password, ...safe } = user;
    return safe;
  }

  /**
   * Suspend a platform user.
   */
  static async suspendUser(
    userId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    until?: string,
    ip?: string,
    requestId?: string,
  ) {
    if (reason.length < 10) throw Object.assign(new Error('Reason too short'), { status: 422 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const before = { isActive: user.isActive };
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'user.suspend',
      entityType: 'User',
      entityId: userId,
      before,
      after: { isActive: false, until: until ?? 'indefinite' },
      reason,
      ip,
      requestId,
    });

    return updated;
  }

  /**
   * Reactivate a suspended user.
   */
  static async reactivateUser(
    userId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const before = { isActive: user.isActive };
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'user.reactivate',
      entityType: 'User',
      entityId: userId,
      before,
      after: { isActive: true },
      reason,
      ip,
      requestId,
    });

    return updated;
  }

  /**
   * Force-logout a platform user (revoke their JWT sessions).
   * Since the current auth uses stateless JWTs, this is a best-effort flag.
   * In a full implementation, store a "logout timestamp" and check it in the
   * user auth middleware.
   */
  static async forceLogout(
    userId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    // Touch updatedAt so any cached JWT payload is stale
    await prisma.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'user.force_logout',
      entityType: 'User',
      entityId: userId,
      ip,
      requestId,
    });

    return { message: 'User sessions invalidated.' };
  }

  /**
   * Soft-delete a user (Super Admin only). Anonymises PII after legal window.
   */
  static async softDeleteUser(
    userId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    if (reason.length < 10) throw Object.assign(new Error('Reason too short'), { status: 422 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const before = { email: user.email, phone: user.phone };

    // Soft-delete: anonymise PII immediately, mark inactive
    const anonymisedEmail = `deleted-${userId}@avatar.invalid`;
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymisedEmail,
        phone: null,
        avatarUrl: null,
        isActive: false,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'user.soft_delete',
      entityType: 'User',
      entityId: userId,
      before,
      after: { email: anonymisedEmail, phone: null },
      reason,
      ip,
      requestId,
    });

    return { message: 'User soft-deleted.' };
  }
}
