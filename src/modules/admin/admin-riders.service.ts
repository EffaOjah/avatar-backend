import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';

export class AdminRidersService {
  static async listRiders(filters: {
    q?: string;
    onlineStatus?: string;
    verificationStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const { q, onlineStatus, verificationStatus, page = 1, limit = 20 } = filters;

    const userWhere: any = q
      ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }] }
      : {};

    const where: any = {
      ...(onlineStatus ? { status: onlineStatus } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(q ? { user: userWhere } : {}),
    };

    const [total, riders] = await Promise.all([
      prisma.rider.count({ where }),
      prisma.rider.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, phone: true, isActive: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { riders, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  static async getRiderById(riderId: string) {
    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
      include: {
        user: { select: { id: true, email: true, phone: true, isActive: true, avatarUrl: true } },
        deliveries: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });
    return rider;
  }

  static async approveRider(
    riderId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    const before = { verificationStatus: rider.verificationStatus };
    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { verificationStatus: 'APPROVED' },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'rider.approve',
      entityType: 'Rider', entityId: riderId,
      before, after: { verificationStatus: 'APPROVED' }, ip, requestId,
    });

    return updated;
  }

  static async rejectRider(
    riderId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    const before = { verificationStatus: rider.verificationStatus };
    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { verificationStatus: 'REJECTED' },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'rider.reject',
      entityType: 'Rider', entityId: riderId,
      before, after: { verificationStatus: 'REJECTED' }, reason, ip, requestId,
    });

    return updated;
  }

  static async suspendRider(
    riderId: string,
    reason: string,
    permanent: boolean,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
      include: { user: true },
    });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    if (permanent && actorRole !== 'SUPER_ADMIN') {
      throw Object.assign(
        new Error('Permanent suspension requires Super Admin approval.'),
        { status: 422 },
      );
    }

    // Suspend by deactivating the underlying user account
    await prisma.user.update({
      where: { id: rider.userId },
      data: { isActive: false },
    });

    await writeAuditLog({
      actorId, actorRole,
      action: permanent ? 'rider.suspend.permanent' : 'rider.suspend.temporary',
      entityType: 'Rider', entityId: riderId,
      reason, ip, requestId,
    });

    return { message: `Rider ${permanent ? 'permanently' : 'temporarily'} suspended.` };
  }

  static async reactivateRider(
    riderId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: { user: true } });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    await prisma.user.update({ where: { id: rider.userId }, data: { isActive: true } });

    await writeAuditLog({
      actorId, actorRole, action: 'rider.reactivate',
      entityType: 'Rider', entityId: riderId, reason, ip, requestId,
    });

    return { message: 'Rider reactivated.' };
  }
}
