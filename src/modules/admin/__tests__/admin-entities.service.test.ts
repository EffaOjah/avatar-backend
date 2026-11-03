import { AdminUsersService } from '../admin-users.service';
import { AdminBusinessesService } from '../admin-businesses.service';
import { AdminOrdersService } from '../admin-orders.service';
import { AdminSettingsService } from '../admin-settings.service';
import prisma from '../../../database/prisma';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    business: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformSetting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('Admin Entity Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AdminUsersService', () => {
    it('masks email and phone for SUPPORT_ADMIN and MODERATION_ADMIN', async () => {
      (prisma.user.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'user-1',
          email: 'john.doe@example.com',
          phone: '08012345678',
          role: 'CUSTOMER',
          isActive: true,
        },
      ]);

      const result = await AdminUsersService.listUsers({}, 'SUPPORT_ADMIN');
      const user = result.users[0];

      expect(user.email).toBe('jo***@example.com');
      expect(user.phone).toBe('08012****');
    });

    it('returns unmasked PII for SUPER_ADMIN', async () => {
      (prisma.user.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'user-1',
          email: 'john.doe@example.com',
          phone: '08012345678',
          role: 'CUSTOMER',
          isActive: true,
        },
      ]);

      const result = await AdminUsersService.listUsers({}, 'SUPER_ADMIN');
      const user = result.users[0];

      expect(user.email).toBe('john.doe@example.com');
      expect(user.phone).toBe('08012345678');
    });

    it('soft deletes user by anonymising email/phone and deactivating', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-del-1',
        email: 'user@example.com',
        phone: '08099999999',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const res = await AdminUsersService.softDeleteUser(
        'user-del-1',
        'GDPR right to be forgotten request',
        'admin-sa',
        'SUPER_ADMIN',
      );

      expect(res.message).toBe('User soft-deleted.');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-del-1' },
        data: {
          email: 'deleted-user-del-1@avatar.invalid',
          phone: null,
          avatarUrl: null,
          isActive: false,
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('AdminBusinessesService', () => {
    it('approves a business KYC onboarding', async () => {
      (prisma.business.findUnique as jest.Mock).mockResolvedValue({
        id: 'biz-1',
        verificationStatus: 'PENDING',
      });
      (prisma.business.update as jest.Mock).mockResolvedValue({
        id: 'biz-1',
        verificationStatus: 'APPROVED',
        isActive: true,
      });

      const res = await AdminBusinessesService.approveBusiness(
        'biz-1',
        'admin-sa',
        'SUPER_ADMIN',
      );

      expect(res.verificationStatus).toBe('APPROVED');
      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: 'biz-1' },
        data: { verificationStatus: 'APPROVED', isActive: true },
      });
    });

    it('rejects a business onboarding with reason', async () => {
      (prisma.business.findUnique as jest.Mock).mockResolvedValue({
        id: 'biz-1',
        verificationStatus: 'PENDING',
      });
      (prisma.business.update as jest.Mock).mockResolvedValue({
        id: 'biz-1',
        verificationStatus: 'REJECTED',
      });

      const res = await AdminBusinessesService.rejectBusiness(
        'biz-1',
        'Invalid business registration document',
        'admin-sa',
        'SUPER_ADMIN',
      );

      expect(res.verificationStatus).toBe('REJECTED');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws 422 if non-SA attempts permanent business suspension directly', async () => {
      (prisma.business.findUnique as jest.Mock).mockResolvedValue({ id: 'biz-1', isActive: true });

      await expect(
        AdminBusinessesService.suspendBusiness(
          'biz-1',
          'Violations repeated',
          true,
          'admin-ops',
          'OPS_ADMIN',
        ),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('AdminOrdersService', () => {
    it('blocks OPS_ADMIN from cancelling an order after pickup', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'order-1',
        delivery: { pickupTime: new Date() }, // already picked up!
      });

      await expect(
        AdminOrdersService.cancelOrder(
          'order-1',
          'Customer changed mind',
          'admin-ops',
          'OPS_ADMIN',
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('allows SUPER_ADMIN to cancel an order after pickup', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: 'OUT_FOR_DELIVERY',
        delivery: { pickupTime: new Date() },
      });
      (prisma.order.update as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: 'CANCELLED',
      });

      const res = await AdminOrdersService.cancelOrder(
        'order-1',
        'Super admin emergency cancellation',
        'admin-sa',
        'SUPER_ADMIN',
      );

      expect(res.status).toBe('CANCELLED');
    });

    it('allows SUPER_ADMIN to override order status', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: 'PENDING_PAYMENT',
      });
      (prisma.order.update as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: 'PAID',
      });

      const res = await AdminOrdersService.overrideStatus(
        'order-1',
        'PAID',
        'Payment verified manually via bank transfer',
        'admin-sa',
        'SUPER_ADMIN',
      );

      expect(res.status).toBe('PAID');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('AdminSettingsService', () => {
    it('throws 400 when updating an unknown setting key', async () => {
      await expect(
        AdminSettingsService.updateSetting(
          'unknown_unsupported_key',
          '123',
          'Valid reason 1234',
          'admin-sa',
          'SUPER_ADMIN',
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('upserts a recognized setting and writes audit log', async () => {
      (prisma.platformSetting.findUnique as jest.Mock).mockResolvedValue({
        key: 'commission_rate_default',
        value: '0.10',
      });
      (prisma.platformSetting.upsert as jest.Mock).mockResolvedValue({
        key: 'commission_rate_default',
        value: '0.15',
      });

      const res = await AdminSettingsService.updateSetting(
        'commission_rate_default',
        '0.15',
        'Updated platform commission rate to 15%',
        'admin-sa',
        'SUPER_ADMIN',
      );

      expect(res.value).toBe('0.15');
      expect(prisma.platformSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'commission_rate_default' },
        update: { value: '0.15' },
        create: { key: 'commission_rate_default', value: '0.15' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});

