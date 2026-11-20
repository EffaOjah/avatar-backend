import {
  AdminTicketsService,
  AdminAccountActionsService,
  AdminSupportAnalyticsService,
} from '../admin-support.service';
import prisma from '../../../database/prisma';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    supportTicket: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    ticketMessage: {
      create: jest.fn(),
    },
    cannedResponse: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      upsert: jest.fn(),
    },
    adminSession: {
      updateMany: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    delivery: {
      update: jest.fn(),
    },
    platformSetting: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('Support Admin Services (SP-01 to SP-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Tickets & Messages
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminTicketsService', () => {
    it('listTickets calculates isSlaBreached correctly', async () => {
      const past = new Date(Date.now() - 3600_000); // 1 hr ago
      const future = new Date(Date.now() + 3600_000); // 1 hr later

      (prisma.supportTicket.findMany as jest.Mock).mockResolvedValue([
        { id: 't-1', status: 'OPEN', slaDueAt: past, _count: { messages: 2 } },
        { id: 't-2', status: 'OPEN', slaDueAt: future, _count: { messages: 1 } },
      ]);

      const res = await AdminTicketsService.listTickets({});
      expect(res.tickets[0].isSlaBreached).toBe(true);
      expect(res.tickets[1].isSlaBreached).toBe(false);
    });

    it('getTicketById filters out internal notes for non-staff callers', async () => {
      (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValue({
        id: 't-1',
        status: 'OPEN',
        messages: [
          { id: 'm-1', body: 'Public response', isInternal: false },
          { id: 'm-2', body: 'Staff-only note', isInternal: true },
        ],
      });

      const customerView = await AdminTicketsService.getTicketById('t-1', 'CUSTOMER');
      expect(customerView.messages).toHaveLength(1);
      expect(customerView.messages[0].isInternal).toBe(false);

      const staffView = await AdminTicketsService.getTicketById('t-1', 'SUPPORT_ADMIN');
      expect(staffView.messages).toHaveLength(2);
    });

    it('createTicket calculates SLA due date and saves message', async () => {
      (prisma.platformSetting.findUnique as jest.Mock).mockResolvedValue({
        key: 'support_sla_hours',
        value: '6',
      });
      (prisma.supportTicket.create as jest.Mock).mockResolvedValue({
        id: 't-1',
        ticketNumber: 'TIK-123456',
        subject: 'Delivery issue',
      });

      const res = await AdminTicketsService.createTicket(
        {
          source: 'CUSTOMER',
          category: 'DELIVERY',
          subject: 'Package was damaged',
          body: 'The package arrived broken',
        },
        'admin-1',
        'SUPPORT_ADMIN',
      );

      expect(res.id).toBe('t-1');
      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'DELIVERY',
            slaDueAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('addMessage automatically reopens resolved ticket if customer replies within 7 days', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 3600_000);
      (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValue({
        id: 't-1',
        status: 'RESOLVED',
        resolvedAt: fourDaysAgo,
      });
      (prisma.supportTicket.update as jest.Mock).mockResolvedValue({});
      (prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: 'm-new' });

      const res = await AdminTicketsService.addMessage(
        't-1',
        { body: 'I still have a problem with this' },
        'cust-1',
        'CUSTOMER',
      );

      expect(res.autoReopened).toBe(true);
      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { status: 'OPEN', resolvedAt: null },
      });
    });

    it('cannedResponses can be queried and created', async () => {
      (prisma.cannedResponse.findMany as jest.Mock).mockResolvedValue([{ id: 'c-1', title: 'Greeting' }]);
      const list = await AdminTicketsService.listCannedResponses('general');
      expect(list).toHaveLength(1);

      (prisma.cannedResponse.create as jest.Mock).mockResolvedValue({ id: 'c-2', title: 'Refund Info' });
      const created = await AdminTicketsService.createCannedResponse(
        { title: 'Refund Info', content: 'Refund takes 3-5 business days' },
        'admin-1',
      );
      expect(created.id).toBe('c-2');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Account Actions
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminAccountActionsService', () => {
    it('throws error if reason is less than 10 characters', async () => {
      await expect(
        AdminAccountActionsService.performAccountAction(
          'u-1',
          'UNLOCK_ACCOUNT',
          { reason: 'Short' },
          'admin-1',
          'SUPPORT_ADMIN',
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('temporary suspension enforces max configured threshold', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-1', email: 'test@avatar.com' });
      (prisma.platformSetting.findUnique as jest.Mock).mockResolvedValue({
        key: 'support_max_suspension_days',
        value: '14',
      });

      const farFuture = new Date(Date.now() + 20 * 24 * 3600_000).toISOString(); // 20 days > 14 days
      await expect(
        AdminAccountActionsService.performAccountAction(
          'u-1',
          'TEMPORARY_SUSPEND',
          { reason: 'Abusive language used towards support staff', until: farFuture },
          'admin-1',
          'SUPPORT_ADMIN',
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('trigger password reset generates password reset token', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-1', email: 'user@example.com' });
      (prisma.passwordResetToken.upsert as jest.Mock).mockResolvedValue({});

      const res = await AdminAccountActionsService.performAccountAction(
        'u-1',
        'TRIGGER_PASSWORD_RESET',
        { reason: 'Customer requested manual password reset assistance' },
        'admin-1',
        'SUPPORT_ADMIN',
      );

      expect(res.success).toBe(true);
      expect(prisma.passwordResetToken.upsert).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('resend delivery PIN generates new PIN hash and updates delivery', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-1', email: 'user@example.com' });
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'o-1',
        delivery: { id: 'del-1' },
      });
      (prisma.delivery.update as jest.Mock).mockResolvedValue({});

      const res = await AdminAccountActionsService.performAccountAction(
        'u-1',
        'RESEND_DELIVERY_PIN',
        { reason: 'Customer did not receive original PIN SMS', orderId: 'o-1' },
        'admin-1',
        'SUPPORT_ADMIN',
      );

      expect(res.success).toBe(true);
      expect(prisma.delivery.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Support Analytics
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminSupportAnalyticsService', () => {
    it('computes ticket overview, SLA breach count, and category breakdown', async () => {
      (prisma.supportTicket.count as jest.Mock)
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(10) // open
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(35) // resolved
        .mockResolvedValueOnce(3); // slaBreached

      (prisma.supportTicket.groupBy as jest.Mock)
        .mockResolvedValueOnce([{ category: 'DELIVERY', _count: { id: 30 } }])
        .mockResolvedValueOnce([{ priority: 'HIGH', _count: { id: 12 } }]);

      const metrics = await AdminSupportAnalyticsService.getSupportMetrics({});
      expect(metrics.overview.totalTickets).toBe(50);
      expect(metrics.overview.resolvedTickets).toBe(35);
      expect(metrics.overview.resolutionRate).toBe(70);
      expect(metrics.overview.slaBreachedCount).toBe(3);
      expect(metrics.breakdown.byCategory[0].category).toBe('DELIVERY');
    });
  });
});
