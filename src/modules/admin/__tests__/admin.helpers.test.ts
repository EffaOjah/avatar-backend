import { writeAuditLog, getPermissionsForRole, wouldRemoveLastSuperAdmin } from '../admin.helpers';
import prisma from '../../../database/prisma';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    auditLog: {
      create: jest.fn(),
    },
    adminUser: {
      count: jest.fn(),
    },
  },
}));

describe('Admin Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPermissionsForRole', () => {
    it('returns all permissions for SUPER_ADMIN', () => {
      const perms = getPermissionsForRole('SUPER_ADMIN');
      expect(perms).toBeDefined();
      expect(perms).toContain('admins:manage');
      expect(perms).toContain('settings:write');
    });

    it('returns empty array for unknown role', () => {
      const perms = getPermissionsForRole('NON_EXISTENT_ROLE');
      expect(perms).toEqual([]);
    });
  });

  describe('wouldRemoveLastSuperAdmin', () => {
    it('returns true when there is only 1 active Super Admin', async () => {
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(1);

      const result = await wouldRemoveLastSuperAdmin('admin-1');
      expect(result).toBe(true);
      expect(prisma.adminUser.count).toHaveBeenCalledWith({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
    });

    it('returns true when there are 0 active Super Admins', async () => {
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(0);

      const result = await wouldRemoveLastSuperAdmin('admin-1');
      expect(result).toBe(true);
    });

    it('returns false when there are 2 or more active Super Admins', async () => {
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(2);

      const result = await wouldRemoveLastSuperAdmin('admin-1');
      expect(result).toBe(false);
    });
  });

  describe('writeAuditLog', () => {
    it('creates an audit log entry and redacts sensitive fields', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log-1' });

      const before = { email: 'test@avatar.com', password: 'plain_password', mfaSecret: 'secret123' };
      const after = { email: 'test@avatar.com', passwordHash: 'hashed_pw', pinHash: 'pin123', isActive: true };

      await writeAuditLog({
        actorId: 'admin-1',
        actorRole: 'SUPER_ADMIN',
        action: 'user.update',
        entityType: 'User',
        entityId: 'user-1',
        before,
        after,
        reason: 'Profile updated by admin',
        ip: '127.0.0.1',
        userAgent: 'JestTest',
        requestId: 'req-123',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const callData = (prisma.auditLog.create as jest.Mock).mock.calls[0][0].data;

      expect(callData.action).toBe('user.update');
      expect(callData.actorId).toBe('admin-1');
      expect(callData.reason).toBe('Profile updated by admin');

      // Check redaction
      const parsedBefore = JSON.parse(callData.before);
      expect(parsedBefore.password).toBe('[REDACTED]');
      expect(parsedBefore.mfaSecret).toBe('[REDACTED]');
      expect(parsedBefore.email).toBe('test@avatar.com');

      const parsedAfter = JSON.parse(callData.after);
      expect(parsedAfter.passwordHash).toBe('[REDACTED]');
      expect(parsedAfter.pinHash).toBe('[REDACTED]');
      expect(parsedAfter.isActive).toBe(true);
    });

    it('uses a provided transaction client if supplied', async () => {
      const mockTx = {
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'log-tx' }),
        },
      };

      await writeAuditLog(
        {
          actorId: 'admin-1',
          action: 'user.delete',
        },
        mockTx as any,
      );

      expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});

