import {
  AdminOpsOrdersService,
  AdminOpsRidersService,
  AdminOpsBusinessService,
  AdminOpsLookupService,
  AdminIncidentsService,
  AdminDisputesService,
  AdminOpsAnalyticsService,
} from '../admin-ops.service';
import prisma from '../../../database/prisma';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    order: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    delivery: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    rider: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    verificationRecord: {
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    business: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    incident: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    dispute: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    approvalRequest: {
      create: jest.fn(),
    },
    platformSetting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

describe('Operations Admin Services (OP-01 to OP-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => {
      if (typeof cb === 'function') return cb(prisma);
      return Promise.all(cb);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OP-01 & OP-03: Orders
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminOpsOrdersService', () => {
    it('listOrders flags orders older than threshold as stuck', async () => {
      const now = Date.now();
      const oldDate = new Date(now - 45 * 60_000); // 45 mins ago
      const recentDate = new Date(now - 10 * 60_000); // 10 mins ago

      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', createdAt: oldDate, delivery: {} },
        { id: 'o-2', createdAt: recentDate, delivery: {} },
      ]);
      (prisma.platformSetting.findMany as jest.Mock).mockResolvedValue([
        { key: 'stuck_order_threshold_minutes', value: '30' },
      ]);

      const result = await AdminOpsOrdersService.listOrders({});
      expect(result.orders[0].stuck).toBe(true);
      expect(result.orders[1].stuck).toBe(false);
    });

    it('getOrderDetail removes pinHash from delivery info', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'o-123',
        delivery: {
          id: 'del-1',
          pinHash: '$2b$10$secretpinHashValue',
        },
      });

      const order = await AdminOpsOrdersService.getOrderDetail('o-123');
      expect((order.delivery as any).pinHash).toBeUndefined();
    });

    it('reassignRider rejects with 409 if another reassign lock is active', async () => {
      (prisma.delivery.findUnique as jest.Mock).mockResolvedValue({
        orderId: 'o-1',
        riderId: 'rider-old',
        claimLockedAt: new Date(), // Just locked
        claimLockedBy: 'other-admin',
      });
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'o-1',
        status: 'PAID',
      });

      await expect(
        AdminOpsOrdersService.reassignRider(
          'o-1',
          { riderId: 'rider-new', reason: 'Rider uncontactable' },
          'my-admin-id',
          'OPS_ADMIN',
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('reassignRider successfully reassigns to pool', async () => {
      (prisma.delivery.findUnique as jest.Mock).mockResolvedValue({
        orderId: 'o-1',
        riderId: 'rider-old',
        claimLockedAt: null,
      });
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'o-1',
        status: 'READY_FOR_PICKUP',
      });
      (prisma.delivery.update as jest.Mock).mockResolvedValue({
        orderId: 'o-1',
        riderId: null,
      });

      const res = await AdminOpsOrdersService.reassignRider(
        'o-1',
        { pool: true, reason: 'Rider bike broke down' },
        'admin-1',
        'OPS_ADMIN',
      );

      expect(res.riderId).toBeNull();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('regeneratePin rejects if max regenerations (3) reached', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'o-1',
        status: 'OUT_FOR_DELIVERY',
        delivery: {
          pinRegenerationCount: 3,
        },
      });

      await expect(
        AdminOpsOrdersService.regeneratePin('o-1', 'admin-1', 'OPS_ADMIN'),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('regeneratePin increments count and returns a new 6-digit pin', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'o-1',
        status: 'OUT_FOR_DELIVERY',
        delivery: {
          pinRegenerationCount: 1,
        },
      });
      (prisma.delivery.update as jest.Mock).mockResolvedValue({});

      const result = await AdminOpsOrdersService.regeneratePin('o-1', 'admin-1', 'OPS_ADMIN');
      expect(result.pin).toMatch(/^\d{6}$/);
      expect(result.regenerationCount).toBe(2);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OP-04: Rider Management
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminOpsRidersService', () => {
    it('approveDocument marks document as APPROVED and updates rider when all docs approved', async () => {
      (prisma.rider.findUnique as jest.Mock).mockResolvedValue({ id: 'r-1', userId: 'u-1' });
      (prisma.verificationRecord.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-1', userId: 'u-1' });
      (prisma.verificationRecord.update as jest.Mock).mockResolvedValue({ id: 'doc-1', status: 'APPROVED' });
      (prisma.verificationRecord.count as jest.Mock).mockResolvedValue(0); // 0 pending docs remaining

      await AdminOpsRidersService.approveDocument('r-1', 'doc-1', 'admin-1', 'OPS_ADMIN');

      expect(prisma.rider.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { verificationStatus: 'APPROVED' },
      });
    });

    it('suspendRider blocks if rider has active deliveries', async () => {
      (prisma.platformSetting.findUnique as jest.Mock).mockResolvedValue({
        key: 'rider_max_suspension_days',
        value: '30',
      });
      (prisma.rider.findUnique as jest.Mock).mockResolvedValue({
        id: 'r-1',
        deliveries: [{ id: 'del-active' }],
      });

      const until = new Date(Date.now() + 5 * 86_400_000).toISOString();
      await expect(
        AdminOpsRidersService.suspendRider('r-1', { reason: 'Violation of rules', until }, 'admin-1', 'OPS_ADMIN'),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('requestPermanentSuspension creates an approval request for Super Admin', async () => {
      (prisma.rider.findUnique as jest.Mock).mockResolvedValue({ id: 'r-1' });
      (prisma.approvalRequest.create as jest.Mock).mockResolvedValue({
        id: 'appr-1',
        type: 'RIDER_PERMANENT_SUSPENSION',
        status: 'PENDING',
      });

      const res = await AdminOpsRidersService.requestPermanentSuspension(
        'r-1',
        'Repeated safety violations',
        'admin-1',
        'OPS_ADMIN',
      );

      expect(res.id).toBe('appr-1');
      expect(prisma.approvalRequest.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OP-05: Business Support
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminOpsBusinessService', () => {
    it('setBusinessStatus updates active status and logs audit', async () => {
      (prisma.business.findUnique as jest.Mock).mockResolvedValue({ id: 'b-1', isActive: true });
      (prisma.business.update as jest.Mock).mockResolvedValue({ id: 'b-1', isActive: false });

      const res = await AdminOpsBusinessService.setBusinessStatus(
        'b-1',
        'PAUSED',
        'Temporary kitchen issue',
        'admin-1',
        'OPS_ADMIN',
      );

      expect(res.platformStatus).toBe('PAUSED');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('setProductAvailability toggles product availability', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', isAvailable: true });
      (prisma.product.update as jest.Mock).mockResolvedValue({ id: 'p-1', isAvailable: false });

      const res = await AdminOpsBusinessService.setProductAvailability(
        'b-1',
        'p-1',
        false,
        'Out of stock',
        'admin-1',
        'OPS_ADMIN',
      );

      expect(res.isAvailable).toBe(false);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OP-06: Lookup & Notifications
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminOpsLookupService', () => {
    it('unifiedLookup returns matching customers, businesses, riders', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'c-1', role: 'CUSTOMER' }]);
      (prisma.business.findMany as jest.Mock).mockResolvedValue([{ id: 'b-1', name: 'Tasty Burger' }]);
      (prisma.rider.findMany as jest.Mock).mockResolvedValue([{ id: 'r-1', user: { id: 'u-r' } }]);

      const res = await AdminOpsLookupService.unifiedLookup('burger', 'OPS_ADMIN');
      expect(res.customers).toHaveLength(1);
      expect(res.businesses).toHaveLength(1);
      expect(res.riders).toHaveLength(1);
    });

    it('sendTargetedNotification creates in-app notification', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-1' });
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({ id: 'o-1' });
      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif-1',
        userId: 'u-1',
        message: 'Your rider is arriving shortly',
      });

      const res = await AdminOpsLookupService.sendTargetedNotification(
        'u-1',
        { templateKey: 'RIDER_DELAY', orderId: 'o-1', message: 'Your rider is arriving shortly' },
        'admin-1',
        'OPS_ADMIN',
      );

      expect(res.id).toBe('notif-1');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OP-07: Incidents & Disputes
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminIncidentsService & AdminDisputesService', () => {
    it('logIncident creates incident and logs audit', async () => {
      (prisma.incident.create as jest.Mock).mockResolvedValue({
        id: 'inc-1',
        type: 'LATE_DELIVERY',
        status: 'OPEN',
      });

      const res = await AdminIncidentsService.logIncident(
        { type: 'LATE_DELIVERY', description: 'Rider delayed by 40 minutes' },
        'admin-1',
        'OPS_ADMIN',
      );

      expect(res.id).toBe('inc-1');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('updateDispute with refundAmount creates an approval request for Finance', async () => {
      (prisma.dispute.findUnique as jest.Mock).mockResolvedValue({
        id: 'disp-1',
        orderId: 'o-1',
        status: 'OPEN',
      });
      (prisma.approvalRequest.create as jest.Mock).mockResolvedValue({ id: 'appr-refund-1' });
      (prisma.dispute.update as jest.Mock).mockResolvedValue({
        id: 'disp-1',
        status: 'RESOLVED',
        refundRequestId: 'appr-refund-1',
      });

      const res = await AdminDisputesService.updateDispute(
        'disp-1',
        {
          status: 'RESOLVED',
          resolution: 'Food spilled in transit',
          refundAmount: 5000,
        },
        'admin-1',
        'OPS_ADMIN',
      );

      expect(res.refundRequestId).toBe('appr-refund-1');
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'REFUND',
          }),
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OP-08: Operational Analytics
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminOpsAnalyticsService', () => {
    it('computes metrics including cancellation rate and avg times', async () => {
      (prisma.order.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(85)  // delivered
        .mockResolvedValueOnce(15); // cancelled

      (prisma.delivery.findMany as jest.Mock).mockResolvedValue([
        {
          createdAt: new Date('2026-11-10T10:00:00Z'),
          pickupTime: new Date('2026-11-10T10:15:00Z'), // 15 mins
          dropoffTime: new Date('2026-11-10T10:45:00Z'), // 30 mins
        },
      ]);

      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValue([
        { reason: 'Customer requested', _count: { id: 10 } },
      ]);

      (prisma.rider.count as jest.Mock)
        .mockResolvedValueOnce(20) // active
        .mockResolvedValueOnce(50); // total

      (prisma.delivery.groupBy as jest.Mock).mockResolvedValue([
        { deliveryZone: 'Zone-1', _count: { id: 50 } },
      ]);

      const analytics = await AdminOpsAnalyticsService.getOperationalAnalytics({});

      expect(analytics.orders.total).toBe(100);
      expect(analytics.orders.cancellationRate).toBe(15);
      expect(analytics.deliveryPerformance.avgClaimTimeMinutes).toBe(15);
      expect(analytics.deliveryPerformance.avgDeliveryTimeMinutes).toBe(30);
      expect(analytics.riders.utilisationPercent).toBe(40); // 20 / 50 * 100
    });
  });
});

