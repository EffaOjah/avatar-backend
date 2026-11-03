import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';

export class AdminOrdersService {
  static async listOrders(filters: {
    status?: string;
    businessId?: string;
    riderId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { status, businessId, riderId, cursor, limit = 20 } = filters;

    const where: any = {
      ...(status ? { status } : {}),
      ...(businessId ? { businessId } : {}),
      ...(riderId
        ? { delivery: { riderId } }
        : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, email: true } },
        business: { select: { id: true, name: true, slug: true } },
        delivery: { select: { id: true, riderId: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
        payment: { select: { id: true, status: true, amount: true, reference: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = orders.length === limit ? orders[orders.length - 1].id : null;
    return { orders, meta: { cursor: nextCursor, limit } };
  }

  static async getOrderById(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, email: true, phone: true } },
        business: true,
        address: true,
        items: { include: { product: true } },
        payment: true,
        delivery: { include: { rider: { include: { user: { select: { id: true, email: true, phone: true } } } } } },
      },
    });
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    return order;
  }

  static async cancelOrder(
    orderId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

    // Operations can only cancel before pickup
    if (
      actorRole === 'OPS_ADMIN' &&
      order.delivery?.pickupTime != null
    ) {
      throw Object.assign(
        new Error('Cannot cancel after pickup. Escalate to Super Admin or log a failed delivery incident.'),
        { status: 422 },
      );
    }

    const before = { status: order.status };
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'order.cancel',
      entityType: 'Order', entityId: orderId,
      before, after: { status: 'CANCELLED' }, reason, ip, requestId,
    });

    return updated;
  }

  /**
   * Override order status (Super Admin only). Always writes audit.
   */
  static async overrideStatus(
    orderId: string,
    newStatus: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

    const before = { status: order.status };
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus as any },
    });

    await writeAuditLog({
      actorId, actorRole, action: 'order.status_override',
      entityType: 'Order', entityId: orderId,
      before, after: { status: newStatus }, reason, ip, requestId,
    });

    return updated;
  }
}
