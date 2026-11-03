import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';

export class AdminBusinessesService {
  static async listBusinesses(filters: {
    q?: string;
    status?: string;
    verificationStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const { q, status, verificationStatus, page = 1, limit = 20 } = filters;

    const where: any = {
      ...(status === 'active' ? { isActive: true } : {}),
      ...(status === 'inactive' ? { isActive: false } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, businesses] = await Promise.all([
      prisma.business.count({ where }),
      prisma.business.findMany({
        where,
        include: { user: { select: { id: true, email: true, phone: true, isActive: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { businesses, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  static async getBusinessById(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        user: { select: { id: true, email: true, phone: true, isActive: true } },
        products: { where: { isDeleted: false }, take: 10 },
        orders: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!business) throw Object.assign(new Error('Business not found'), { status: 404 });
    return business;
  }

  static async approveBusiness(
    businessId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw Object.assign(new Error('Business not found'), { status: 404 });

    const before = { verificationStatus: business.verificationStatus };
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { verificationStatus: 'APPROVED', isActive: true },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'business.approve',
      entityType: 'Business', entityId: businessId,
      before, after: { verificationStatus: 'APPROVED' }, ip, requestId,
    });

    return updated;
  }

  static async rejectBusiness(
    businessId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw Object.assign(new Error('Business not found'), { status: 404 });

    const before = { verificationStatus: business.verificationStatus };
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { verificationStatus: 'REJECTED' },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'business.reject',
      entityType: 'Business', entityId: businessId,
      before, after: { verificationStatus: 'REJECTED' }, reason, ip, requestId,
    });

    return updated;
  }

  static async suspendBusiness(
    businessId: string,
    reason: string,
    permanent: boolean,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw Object.assign(new Error('Business not found'), { status: 404 });

    if (permanent && actorRole !== 'SUPER_ADMIN') {
      // Non-SA must create an approval request (handled in controller)
      throw Object.assign(
        new Error('Permanent suspension requires Super Admin approval. Submit an approval request.'),
        { status: 422 },
      );
    }

    const before = { isActive: business.isActive };
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { isActive: false },
    });

    await writeAuditLog({
      actorId, actorRole,
      action: permanent ? 'business.suspend.permanent' : 'business.suspend.temporary',
      entityType: 'Business', entityId: businessId,
      before, after: { isActive: false }, reason, ip, requestId,
    });

    return updated;
  }

  static async reactivateBusiness(
    businessId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw Object.assign(new Error('Business not found'), { status: 404 });

    const before = { isActive: business.isActive };
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { isActive: true },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'business.reactivate',
      entityType: 'Business', entityId: businessId,
      before, after: { isActive: true }, reason, ip, requestId,
    });

    return updated;
  }
}
