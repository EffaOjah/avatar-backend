/**
 * Operations Admin Services — TRD §5.2 (OP-01 to OP-08)
 *
 * Services:
 *  - AdminOpsOrdersService  : live board (OP-01), reassign (OP-03), PIN regen (OP-03)
 *  - AdminOpsRidersService  : roster, doc approval, temp/permanent suspend (OP-04)
 *  - AdminOpsBusinessService: set status, pause items, correct hours (OP-05)
 *  - AdminOpsLookupService  : unified customer lookup + notify (OP-06)
 *  - AdminIncidentsService  : log, assign, resolve incidents (OP-07)
 *  - AdminDisputesService   : open, assign, resolve disputes; spawn refund requests (OP-07)
 *  - AdminOpsAnalyticsService: operational analytics (OP-08)
 */

import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';
import bcrypt from 'bcrypt';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getStuckThresholdMs(settings: Array<{ key: string; value: string }>): number {
  const setting = settings.find((s) => s.key === 'stuck_order_threshold_minutes');
  const minutes = setting ? parseInt(setting.value, 10) : 30;
  return (isNaN(minutes) ? 30 : minutes) * 60_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-01 / OP-03 — Orders (live board, reassign, PIN regen)
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsOrdersService {
  /**
   * OP-01 — Live orders board with enhanced filters.
   * Returns orders with a `stuck` flag for those older than the threshold.
   */
  static async listOrders(filters: {
    status?: string;
    businessId?: string;
    riderId?: string;
    zone?: string;
    minAgeMinutes?: number;
    cursor?: string;
    limit?: number;
  }) {
    const { status, businessId, riderId, zone, minAgeMinutes, cursor, limit = 20 } = filters;

    const ageFilter = minAgeMinutes
      ? { createdAt: { lte: new Date(Date.now() - minAgeMinutes * 60_000) } }
      : {};

    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
      ...(businessId ? { businessId } : {}),
      ...(riderId ? { delivery: { riderId } } : {}),
      ...(zone ? { delivery: { deliveryZone: zone } } : {}),
      ...ageFilter,
    };

    const [orders, settings] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, email: true } },
          business: { select: { id: true, name: true, slug: true } },
          delivery: {
            select: {
              id: true,
              riderId: true,
              deliveryZone: true,
              pickupTime: true,
              dropoffTime: true,
              pinRegenerationCount: true,
            },
          },
          payment: { select: { id: true, status: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit,
      }),
      prisma.platformSetting.findMany({
        where: { key: 'stuck_order_threshold_minutes' },
      }),
    ]);

    const thresholdMs = getStuckThresholdMs(settings);
    const now = Date.now();

    const ordersWithFlags = orders.map((o) => ({
      ...o,
      stuck: now - new Date(o.createdAt).getTime() > thresholdMs,
    }));

    const nextCursor = orders.length === limit ? orders[orders.length - 1].id : null;
    return { orders: ordersWithFlags, meta: { cursor: nextCursor, limit } };
  }

  /**
   * OP-01 — Order detail with full timeline. Never exposes the raw PIN value.
   */
  static async getOrderDetail(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, email: true, phone: true } },
        business: true,
        address: true,
        items: { include: { product: { select: { id: true, name: true, price: true } } } },
        payment: true,
        delivery: {
          include: {
            rider: {
              include: {
                user: { select: { id: true, email: true, phone: true } },
              },
            },
          },
          // Intentionally exclude pinHash — never expose raw PIN
        },
      },
    });

    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

    // Mask the pinHash from the response
    if (order.delivery) {
      (order.delivery as Record<string, unknown>).pinHash = undefined;
    }

    return order;
  }

  /**
   * OP-03 — Atomic rider reassignment.
   *
   * Uses a Prisma transaction to:
   *   1. Lock the delivery row (simulated via upsert / update with version check)
   *   2. Clear the existing rider claim
   *   3. Either return to pool (delivery.riderId = null) or assign named rider
   *
   * Two concurrent reassign requests on the same order will result in
   * exactly one winner and one 409 (the second update will find claimLockedBy !== actorId).
   */
  static async reassignRider(
    orderId: string,
    opts: { riderId?: string; pool?: boolean; reason: string },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const { riderId, pool = false, reason } = opts;

    if (!riderId && !pool) {
      throw Object.assign(
        new Error('Either riderId or pool=true must be provided'),
        { status: 400 },
      );
    }

    return prisma.$transaction(async (tx) => {
      // 1. Fetch and lock delivery row
      const delivery = await tx.delivery.findUnique({ where: { orderId } });
      if (!delivery) throw Object.assign(new Error('Delivery not found for order'), { status: 404 });

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

      // Only orders in certain statuses can be reassigned
      const reassignableStatuses = ['PAID', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'];
      if (!reassignableStatuses.includes(order.status)) {
        throw Object.assign(
          new Error(`Order with status ${order.status} cannot be reassigned`),
          { status: 422 },
        );
      }

      // 2. Attempt to claim the lock — concurrent second attempt will fail because
      //    claimLockedBy was set by the first transaction
      if (delivery.claimLockedAt && delivery.claimLockedBy !== actorId) {
        const lockAge = Date.now() - new Date(delivery.claimLockedAt).getTime();
        // If locked less than 30 s ago by someone else, reject
        if (lockAge < 30_000) {
          throw Object.assign(
            new Error('Another reassignment is in progress for this order'),
            { status: 409 },
          );
        }
      }

      // 3. Set lock
      await tx.delivery.update({
        where: { orderId },
        data: { claimLockedAt: new Date(), claimLockedBy: actorId },
      });

      // 4. If assigning a named rider, verify rider exists and is online
      if (riderId) {
        const rider = await tx.rider.findUnique({ where: { id: riderId } });
        if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });
        if (rider.status !== 'ONLINE') {
          throw Object.assign(new Error('Rider is not online'), { status: 422 });
        }
      }

      // 5. Perform reassignment
      const updatedDelivery = await tx.delivery.update({
        where: { orderId },
        data: {
          riderId: pool ? null : riderId ?? null,
          claimLockedAt: null,
          claimLockedBy: null,
        },
      });

      await writeAuditLog({
        actorId,
        actorRole,
        action: 'order.reassign',
        entityType: 'Order',
        entityId: orderId,
        before: { riderId: delivery.riderId },
        after: { riderId: pool ? null : riderId ?? null, returnedToPool: pool },
        reason,
        ip,
        requestId,
      });

      return updatedDelivery;
    });
  }

  /**
   * OP-03 — Regenerate delivery PIN.
   * Allowed only while order is claimed (OUT_FOR_DELIVERY) or picked up.
   * Max 3 regenerations per order.
   */
  static async regeneratePin(
    orderId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { delivery: true },
      });

      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

      const delivery = order.delivery;
      if (!delivery) throw Object.assign(new Error('No delivery found for order'), { status: 404 });

      // Only allowed while claimed or picked up
      const allowedStatuses = ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
      if (!allowedStatuses.includes(order.status)) {
        throw Object.assign(
          new Error('PIN can only be regenerated while order is active'),
          { status: 422 },
        );
      }

      // Max 3 regenerations
      if (delivery.pinRegenerationCount >= 3) {
        throw Object.assign(
          new Error('Maximum PIN regeneration limit (3) reached for this order'),
          { status: 422 },
        );
      }

      // Generate a new 6-digit PIN
      const newPin = Math.floor(100_000 + Math.random() * 900_000).toString();
      const pinHash = await bcrypt.hash(newPin, 10);

      await tx.delivery.update({
        where: { orderId },
        data: {
          pinHash,
          pinRegenerationCount: { increment: 1 },
          failedAttempts: 0,
        },
      });

      await writeAuditLog({
        actorId,
        actorRole,
        action: 'order.pin_regenerate',
        entityType: 'Order',
        entityId: orderId,
        reason: 'PIN regenerated by admin',
        ip,
        requestId,
      });

      // Return PIN to admin so they can relay to customer. It is NOT stored in plain text.
      return { pin: newPin, regenerationCount: delivery.pinRegenerationCount + 1 };
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-04 — Rider Management
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsRidersService {
  /**
   * OP-04 — Rider roster with operational filters.
   */
  static async listRiders(filters: {
    online?: boolean;
    zone?: string;
    verificationStatus?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { online, zone, verificationStatus, cursor, limit = 20 } = filters;

    const where: Record<string, unknown> = {
      ...(online !== undefined ? { status: online ? 'ONLINE' : 'OFFLINE' } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(zone
        ? {
            deliveries: {
              some: { delivery: { deliveryZone: zone } },
            },
          }
        : {}),
    };

    const riders = await prisma.rider.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, phone: true } },
        deliveries: {
          where: { order: { status: { in: ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'] } } },
          select: { id: true, orderId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const ridersWithFlags = riders.map((r) => ({
      ...r,
      hasActiveClaim: r.deliveries.length > 0,
      activeClaims: r.deliveries.length,
    }));

    const nextCursor = riders.length === limit ? riders[riders.length - 1].id : null;
    return { riders: ridersWithFlags, meta: { cursor: nextCursor, limit } };
  }

  /**
   * OP-04 — Approve a rider verification document.
   */
  static async approveDocument(
    riderId: string,
    documentId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    const doc = await prisma.verificationRecord.findFirst({
      where: { id: documentId, userId: rider.userId },
    });
    if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });

    const updated = await prisma.verificationRecord.update({
      where: { id: documentId },
      data: {
        status: 'APPROVED',
        reviewedBy: actorId,
        reviewedAt: new Date(),
        reviewNotes: 'Approved by Operations Admin',
      },
    });

    // If all documents are approved, approve the rider
    const pendingDocs = await prisma.verificationRecord.count({
      where: { userId: rider.userId, status: { not: 'APPROVED' } },
    });

    if (pendingDocs === 0) {
      await prisma.rider.update({
        where: { id: riderId },
        data: { verificationStatus: 'APPROVED' },
      });
    }

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'rider.document_approve',
      entityType: 'Rider',
      entityId: riderId,
      after: { documentId, status: 'APPROVED' },
      ip,
      requestId,
    });

    return updated;
  }

  /**
   * OP-04 — Reject a rider verification document.
   */
  static async rejectDocument(
    riderId: string,
    documentId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    const doc = await prisma.verificationRecord.findFirst({
      where: { id: documentId, userId: rider.userId },
    });
    if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });

    const updated = await prisma.verificationRecord.update({
      where: { id: documentId },
      data: {
        status: 'REJECTED',
        reviewedBy: actorId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'rider.document_reject',
      entityType: 'Rider',
      entityId: riderId,
      after: { documentId, status: 'REJECTED' },
      reason,
      ip,
      requestId,
    });

    return updated;
  }

  /**
   * OP-04 — Temporarily suspend a rider.
   * Enforces configured maximum suspension duration.
   * Blocks if rider has an active claimed order.
   */
  static async suspendRider(
    riderId: string,
    opts: { reason: string; until: string },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const { reason, until } = opts;

    const untilDate = new Date(until);
    if (isNaN(untilDate.getTime())) {
      throw Object.assign(new Error('Invalid suspension end date'), { status: 400 });
    }

    // Enforce max suspension duration from settings
    const maxSetting = await prisma.platformSetting.findUnique({
      where: { key: 'rider_max_suspension_days' },
    });
    const maxDays = maxSetting ? parseInt(maxSetting.value, 10) : 30;
    const maxDate = new Date(Date.now() + maxDays * 86_400_000);

    if (untilDate > maxDate) {
      throw Object.assign(
        new Error(`Suspension cannot exceed ${maxDays} days. Use permanent suspension request for longer.`),
        { status: 422 },
      );
    }

    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
      include: {
        deliveries: {
          where: {
            order: { status: { in: ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'] } },
          },
        },
      },
    });

    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    if (rider.deliveries.length > 0) {
      throw Object.assign(
        new Error('Rider has active orders. Reassign them before suspending.'),
        { status: 422 },
      );
    }

    const before = { status: rider.status, verificationStatus: rider.verificationStatus };

    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { status: 'OFFLINE', verificationStatus: 'REJECTED' },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'rider.suspend_temporary',
      entityType: 'Rider',
      entityId: riderId,
      before,
      after: { status: 'OFFLINE', suspendedUntil: untilDate },
      reason,
      ip,
      requestId,
    });

    return { ...updated, suspendedUntil: untilDate };
  }

  /**
   * OP-04 — Request permanent rider suspension (maker-checker, needs SA approval).
   */
  static async requestPermanentSuspension(
    riderId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw Object.assign(new Error('Rider not found'), { status: 404 });

    const approval = await prisma.approvalRequest.create({
      data: {
        type: 'RIDER_PERMANENT_SUSPENSION',
        payload: JSON.stringify({ riderId, reason }),
        requestedBy: actorId,
        status: 'PENDING',
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'rider.permanent_suspension_requested',
      entityType: 'Rider',
      entityId: riderId,
      reason,
      ip,
      requestId,
    });

    return approval;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-05 — Business Support
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsBusinessService {
  /**
   * OP-05 — Set business open/closed/paused, labelled "changed by platform".
   */
  static async setBusinessStatus(
    businessId: string,
    status: 'OPEN' | 'CLOSED' | 'PAUSED',
    reason: string | undefined,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw Object.assign(new Error('Business not found'), { status: 404 });

    const isActive = status === 'OPEN';
    const before = { isActive: business.isActive };

    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { isActive },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'business.status_change',
      entityType: 'Business',
      entityId: businessId,
      before,
      after: { status, isActive, changedByPlatform: true },
      reason: reason ?? `Status set to ${status} by platform`,
      ip,
      requestId,
    });

    return { ...updated, platformStatus: status };
  }

  /**
   * OP-05 — Pause or unpause an individual menu item.
   */
  static async setProductAvailability(
    businessId: string,
    productId: string,
    isAvailable: boolean,
    reason: string | undefined,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!product) throw Object.assign(new Error('Product not found on this business'), { status: 404 });

    const before = { isAvailable: product.isAvailable };
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isAvailable },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: isAvailable ? 'product.unpause' : 'product.pause',
      entityType: 'Product',
      entityId: productId,
      before,
      after: { isAvailable, changedByPlatform: true },
      reason: reason ?? `Product ${isAvailable ? 'resumed' : 'paused'} by platform`,
      ip,
      requestId,
    });

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-06 — Customer Lookup + Notify
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsLookupService {
  /**
   * OP-06 — Unified search across customers, businesses, and riders.
   * Masks PII for OPS_ADMIN (consistent with TRD §4 PII rules).
   */
  static async unifiedLookup(query: string, actorRole: string) {
    const q = `%${query}%`;
    const maskPii = actorRole !== 'SUPER_ADMIN';

    const [customers, businesses, riders] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
          ],
          isActive: true,
        },
        select: {
          id: true,
          email: maskPii ? undefined : true,
          phone: maskPii ? undefined : true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        take: 10,
      }),
      prisma.business.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, slug: true, verificationStatus: true, isActive: true },
        take: 10,
      }),
      prisma.rider.findMany({
        where: {
          user: {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
            ],
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: maskPii ? undefined : true,
              phone: maskPii ? undefined : true,
            },
          },
        },
        take: 10,
      }),
    ]);

    return { customers, businesses, riders };
  }

  /**
   * OP-06 — Send a templated notification to a customer, linked to an order.
   */
  static async sendTargetedNotification(
    userId: string,
    opts: { templateKey: string; orderId?: string; message: string },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    if (opts.orderId) {
      const order = await prisma.order.findFirst({
        where: { id: opts.orderId, customerId: userId },
      });
      if (!order) throw Object.assign(new Error('Order not found for this user'), { status: 404 });
    }

    // Create in-app notification
    const notification = await prisma.notification.create({
      data: {
        userId,
        title: `Message from AVATAR Support`,
        message: opts.message,
        type: 'IN_APP',
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'user.notify_targeted',
      entityType: 'User',
      entityId: userId,
      after: { templateKey: opts.templateKey, orderId: opts.orderId },
      ip,
      requestId,
    });

    return notification;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-07 — Incidents
// ─────────────────────────────────────────────────────────────────────────────

export class AdminIncidentsService {
  static async listIncidents(filters: {
    status?: string;
    type?: string;
    orderId?: string;
    riderId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { status, type, orderId, riderId, cursor, limit = 20 } = filters;

    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(orderId ? { orderId } : {}),
      ...(riderId ? { riderId } : {}),
    };

    const incidents = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = incidents.length === limit ? incidents[incidents.length - 1].id : null;
    return { incidents, meta: { cursor: nextCursor, limit } };
  }

  static async getIncidentById(incidentId: string) {
    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw Object.assign(new Error('Incident not found'), { status: 404 });
    return incident;
  }

  static async logIncident(
    data: {
      type: string;
      description: string;
      orderId?: string;
      riderId?: string;
      businessId?: string;
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const incident = await prisma.incident.create({
      data: {
        type: data.type as any,
        description: data.description,
        orderId: data.orderId,
        riderId: data.riderId,
        businessId: data.businessId,
        reportedBy: actorId,
        status: 'OPEN',
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'incident.log',
      entityType: 'Incident',
      entityId: incident.id,
      after: { type: data.type, orderId: data.orderId },
      ip,
      requestId,
    });

    return incident;
  }

  static async updateIncident(
    incidentId: string,
    data: { ownerId?: string; notes?: string; status?: string; resolution?: string },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw Object.assign(new Error('Incident not found'), { status: 404 });

    const isResolving = data.status === 'RESOLVED' && incident.status !== 'RESOLVED';

    const before = { status: incident.status, ownerId: incident.ownerId };

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        ...(data.ownerId ? { ownerId: data.ownerId, status: 'ASSIGNED' as any } : {}),
        ...(data.status ? { status: data.status as any } : {}),
        ...(isResolving ? { resolvedAt: new Date() } : {}),
        // Notes are append-only: append new note with timestamp
        ...(data.notes
          ? {
              notes: incident.notes
                ? `${incident.notes}\n---\n[${new Date().toISOString()}] ${data.notes}`
                : `[${new Date().toISOString()}] ${data.notes}`,
            }
          : {}),
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'incident.update',
      entityType: 'Incident',
      entityId: incidentId,
      before,
      after: { status: data.status, ownerId: data.ownerId },
      ip,
      requestId,
    });

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-07 — Disputes
// ─────────────────────────────────────────────────────────────────────────────

export class AdminDisputesService {
  static async listDisputes(filters: {
    status?: string;
    orderId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { status, orderId, cursor, limit = 20 } = filters;

    const disputes = await prisma.dispute.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(orderId ? { orderId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = disputes.length === limit ? disputes[disputes.length - 1].id : null;
    return { disputes, meta: { cursor: nextCursor, limit } };
  }

  static async getDisputeById(disputeId: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw Object.assign(new Error('Dispute not found'), { status: 404 });
    return dispute;
  }

  static async openDispute(
    data: { orderId?: string; customerId?: string; description: string },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const dispute = await prisma.dispute.create({
      data: {
        orderId: data.orderId,
        customerId: data.customerId,
        description: data.description,
        reportedBy: actorId,
        status: 'OPEN',
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'dispute.open',
      entityType: 'Dispute',
      entityId: dispute.id,
      after: { orderId: data.orderId, customerId: data.customerId },
      ip,
      requestId,
    });

    return dispute;
  }

  static async updateDispute(
    disputeId: string,
    data: {
      ownerId?: string;
      status?: string;
      resolution?: string;
      escalateTo?: string;
      /** If set, creates a RefundRequest in Finance queue for this amount */
      refundAmount?: number;
      refundReason?: string;
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw Object.assign(new Error('Dispute not found'), { status: 404 });

    const before = { status: dispute.status, ownerId: dispute.ownerId };

    return prisma.$transaction(async (tx) => {
      let refundRequestId: string | undefined;

      // If money movement is needed, create a pending refund request
      if (data.refundAmount && data.refundAmount > 0) {
        const approval = await tx.approvalRequest.create({
          data: {
            type: 'REFUND',
            payload: JSON.stringify({
              disputeId,
              orderId: dispute.orderId,
              amount: data.refundAmount,
              reason: data.refundReason ?? data.resolution,
              requestedFrom: 'OPS_DISPUTE',
            }),
            requestedBy: actorId,
            status: 'PENDING',
          },
        });
        refundRequestId = approval.id;
      }

      const updated = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          ...(data.ownerId ? { ownerId: data.ownerId } : {}),
          ...(data.status ? { status: data.status as any } : {}),
          ...(data.resolution ? { resolution: data.resolution } : {}),
          ...(data.escalateTo ? { escalatedTo: data.escalateTo, status: 'ESCALATED' as any } : {}),
          ...(refundRequestId ? { refundRequestId } : {}),
          ...(data.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
        },
      });

      await writeAuditLog({
        actorId,
        actorRole,
        action: 'dispute.update',
        entityType: 'Dispute',
        entityId: disputeId,
        before,
        after: { status: data.status, refundRequestId },
        ip,
        requestId,
      });

      return updated;
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-08 — Operational Analytics
// ─────────────────────────────────────────────────────────────────────────────

export class AdminOpsAnalyticsService {
  /**
   * OP-08 — Key operational metrics for the given time range.
   */
  static async getOperationalAnalytics(filters: { from?: string; to?: string }) {
    const from = filters.from ? new Date(filters.from) : new Date(Date.now() - 7 * 86_400_000);
    const to = filters.to ? new Date(filters.to) : new Date();

    const dateRange = { createdAt: { gte: from, lte: to } };

    const [
      totalOrders,
      deliveredOrders,
      cancelledOrders,
      deliveries,
      cancellationReasons,
      riderStats,
      zoneStats,
    ] = await Promise.all([
      prisma.order.count({ where: dateRange }),

      prisma.order.count({ where: { ...dateRange, status: 'DELIVERED' } }),

      prisma.order.count({ where: { ...dateRange, status: 'CANCELLED' } }),

      // For avg claim & delivery times
      prisma.delivery.findMany({
        where: {
          order: { ...dateRange, status: 'DELIVERED' },
          pickupTime: { not: null },
          dropoffTime: { not: null },
        },
        select: {
          createdAt: true,
          pickupTime: true,
          dropoffTime: true,
        },
      }),

      // Cancellation by reason (from audit logs)
      prisma.auditLog.groupBy({
        by: ['reason'],
        where: {
          action: 'order.cancel',
          createdAt: { gte: from, lte: to },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // Rider utilisation: distinct riders with at least one delivery
      prisma.rider.count({
        where: {
          deliveries: {
            some: {
              order: dateRange,
            },
          },
        },
      }),

      // Orders per zone
      prisma.delivery.groupBy({
        by: ['deliveryZone'],
        where: { order: dateRange },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    // Avg claim time (createdAt → pickupTime)
    const claimTimesMs = deliveries
      .filter((d) => d.pickupTime)
      .map((d) => new Date(d.pickupTime!).getTime() - new Date(d.createdAt).getTime());
    const avgClaimTimeMinutes =
      claimTimesMs.length > 0
        ? Math.round(claimTimesMs.reduce((a, b) => a + b, 0) / claimTimesMs.length / 60_000)
        : null;

    // Avg delivery time (pickupTime → dropoffTime)
    const deliveryTimesMs = deliveries
      .filter((d) => d.pickupTime && d.dropoffTime)
      .map((d) => new Date(d.dropoffTime!).getTime() - new Date(d.pickupTime!).getTime());
    const avgDeliveryTimeMinutes =
      deliveryTimesMs.length > 0
        ? Math.round(deliveryTimesMs.reduce((a, b) => a + b, 0) / deliveryTimesMs.length / 60_000)
        : null;

    const totalRiders = await prisma.rider.count();
    const riderUtilisationPercent =
      totalRiders > 0 ? Math.round((riderStats / totalRiders) * 100) : 0;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      orders: {
        total: totalOrders,
        delivered: deliveredOrders,
        cancelled: cancelledOrders,
        cancellationRate:
          totalOrders > 0 ? parseFloat(((cancelledOrders / totalOrders) * 100).toFixed(2)) : 0,
      },
      deliveryPerformance: {
        avgClaimTimeMinutes,
        avgDeliveryTimeMinutes,
      },
      riders: {
        total: totalRiders,
        active: riderStats,
        utilisationPercent: riderUtilisationPercent,
      },
      cancellationByReason: cancellationReasons.map((r) => ({
        reason: r.reason ?? 'unspecified',
        count: r._count.id,
      })),
      ordersByZone: zoneStats.map((z) => ({
        zone: z.deliveryZone ?? 'unknown',
        count: z._count.id,
      })),
    };
  }
}

