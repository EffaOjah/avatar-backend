import { AdminAuthService, AdminStaffService, ApprovalService } from '../admin.service';
import prisma from '../../../database/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../../../utils/email';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    adminUser: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    adminSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    approvalRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(prisma)),
  },
}));

jest.mock('../../../utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
}));

jest.mock('bcrypt');
jest.mock('jsonwebtoken');

describe('Admin Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((cb) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    });
  });

  describe('AdminAuthService', () => {
    describe('loginStep1', () => {
      it('throws 401 if admin is not found or has no passwordHash', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(AdminAuthService.loginStep1('unknown@avatar.com', 'password123'))
          .rejects.toMatchObject({ status: 401, message: 'Invalid credentials' });
      });

      it('throws 403 if admin is DEACTIVATED', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
          id: 'admin-1',
          passwordHash: 'hashed_pw',
          status: 'DEACTIVATED',
        });

        await expect(AdminAuthService.loginStep1('deactivated@avatar.com', 'password123'))
          .rejects.toMatchObject({ status: 403, message: 'Admin account is deactivated' });
      });

      it('throws 401 if password comparison fails', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
          id: 'admin-1',
          passwordHash: 'hashed_pw',
          status: 'ACTIVE',
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        await expect(AdminAuthService.loginStep1('admin@avatar.com', 'wrongpassword'))
          .rejects.toMatchObject({ status: 401, message: 'Invalid credentials' });
      });

      it('returns mfaRequired and mfaToken on valid credentials', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
          id: 'admin-1',
          role: 'SUPER_ADMIN',
          passwordHash: 'hashed_pw',
          status: 'ACTIVE',
          mfaEnabled: true,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        (jwt.sign as jest.Mock).mockReturnValue('mock_mfa_challenge_token');

        const result = await AdminAuthService.loginStep1('admin@avatar.com', 'correctpassword');

        expect(result.mfaRequired).toBe(true);
        expect(result.mfaToken).toBe('mock_mfa_challenge_token');
        expect(result.mfaEnabled).toBe(true);
        expect(prisma.auditLog.create).toHaveBeenCalled();
      });
    });

    describe('loginStep2', () => {
      it('throws 401 if mfa token verification fails', async () => {
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw new Error('expired');
        });

        await expect(AdminAuthService.loginStep2('invalid_mfa_token', '123456'))
          .rejects.toMatchObject({ status: 401 });
      });

      it('throws 401 if totp code format is invalid when mfa is enabled', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({ adminId: 'admin-1', phase: 'mfa_pending' });
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
          id: 'admin-1',
          mfaEnabled: true,
          mfaSecret: 'secret123',
        });

        await expect(AdminAuthService.loginStep2('valid_mfa_token', '12a'))
          .rejects.toMatchObject({ status: 401, message: 'Invalid TOTP code' });
      });

      it('creates session and issues tokens when TOTP verification succeeds', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({ adminId: 'admin-1', phase: 'mfa_pending' });
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
          id: 'admin-1',
          name: 'Super Admin',
          email: 'admin@avatar.com',
          role: 'SUPER_ADMIN',
          mfaEnabled: true,
          mfaSecret: 'secret123',
        });
        (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_refresh_token');
        (prisma.adminSession.create as jest.Mock).mockResolvedValue({ id: 'session-1' });
        (prisma.adminUser.update as jest.Mock).mockResolvedValue({});
        (jwt.sign as jest.Mock)
          .mockReturnValueOnce('refresh_token_jwt')
          .mockReturnValueOnce('access_token_jwt');

        const result = await AdminAuthService.loginStep2('valid_mfa_token', '123456');

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.admin.id).toBe('admin-1');
        expect(prisma.adminSession.create).toHaveBeenCalled();
        expect(prisma.adminUser.update).toHaveBeenCalledWith({
          where: { id: 'admin-1' },
          data: { lastLoginAt: expect.any(Date) },
        });
      });
    });

    describe('refreshTokens', () => {
      it('revokes session family when token reuse is detected', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({ familyId: 'fam-1', sessionId: 'sess-1' });
        (prisma.adminSession.findUnique as jest.Mock).mockResolvedValue({
          id: 'sess-1',
          revokedAt: new Date(), // already revoked -> reuse!
          admin: { role: 'SUPER_ADMIN' },
        });

        await expect(AdminAuthService.refreshTokens('reused_token'))
          .rejects.toMatchObject({ status: 401 });

        expect(prisma.adminSession.updateMany).toHaveBeenCalledWith({
          where: { familyId: 'fam-1' },
          data: { revokedAt: expect.any(Date) },
        });
      });

      it('rotates refresh token and issues new tokens on valid refresh', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({ familyId: 'fam-1', sessionId: 'sess-1' });
        (prisma.adminSession.findUnique as jest.Mock).mockResolvedValue({
          id: 'sess-1',
          adminId: 'admin-1',
          refreshHash: 'hashed_pw',
          revokedAt: null,
          admin: { role: 'SUPER_ADMIN' },
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        (bcrypt.hash as jest.Mock).mockResolvedValue('new_hash');
        (prisma.adminSession.update as jest.Mock).mockResolvedValue({});
        (prisma.adminSession.create as jest.Mock).mockResolvedValue({ id: 'sess-2' });
        (jwt.sign as jest.Mock)
          .mockReturnValueOnce('new_refresh_jwt')
          .mockReturnValueOnce('new_access_jwt');

        const result = await AdminAuthService.refreshTokens('valid_token');

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(prisma.adminSession.update).toHaveBeenCalledWith({
          where: { id: 'sess-1' },
          data: { revokedAt: expect.any(Date) },
        });
      });
    });

    describe('getMe', () => {
      it('returns admin data along with permissions list', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
          id: 'admin-1',
          email: 'admin@avatar.com',
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        });

        const me = await AdminAuthService.getMe('admin-1');
        expect(me.id).toBe('admin-1');
        expect(me.permissions).toBeDefined();
        expect(me.permissions).toContain('admins:manage');
      });

      it('throws 404 if admin not found', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(AdminAuthService.getMe('unknown')).rejects.toMatchObject({ status: 404 });
      });
    });
  });

  describe('AdminStaffService', () => {
    describe('inviteAdmin', () => {
      it('throws 409 if admin with email already exists', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

        await expect(
          AdminStaffService.inviteAdmin(
            { email: 'existing@avatar.com', name: 'Existing', role: 'OPS_ADMIN' },
            'creator-1',
          ),
        ).rejects.toMatchObject({ status: 409 });
      });

      it('creates admin with INVITED status and sends invitation email', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.adminUser.create as jest.Mock).mockResolvedValue({
          id: 'new-admin-1',
          email: 'new@avatar.com',
          status: 'INVITED',
        });
        (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});

        const res = await AdminStaffService.inviteAdmin(
          { email: 'new@avatar.com', name: 'New Admin', role: 'OPS_ADMIN' },
          'creator-1',
        );

        expect(res.id).toBe('new-admin-1');
        expect(prisma.adminUser.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            email: 'new@avatar.com',
            status: 'INVITED',
            createdBy: 'creator-1',
          }),
        });
        expect(sendEmail).toHaveBeenCalledTimes(1);
      });
    });

    describe('requestRoleChange', () => {
      it('throws 422 if admin tries to change their own role', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' });

        await expect(
          AdminStaffService.requestRoleChange('admin-1', 'OPS_ADMIN', 'Valid reason 1234', 'admin-1'),
        ).rejects.toMatchObject({ status: 422, message: 'You cannot change your own role' });
      });

      it('throws 409 if demoting the last active Super Admin', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'target-sa', role: 'SUPER_ADMIN' });
        (prisma.adminUser.count as jest.Mock).mockResolvedValue(1); // Only 1 active SA!

        await expect(
          AdminStaffService.requestRoleChange('target-sa', 'OPS_ADMIN', 'Valid reason 1234', 'caller-sa'),
        ).rejects.toMatchObject({ status: 409, message: 'Cannot demote the last active Super Admin' });
      });

      it('creates an approval request for valid role change request', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'target-ops', role: 'OPS_ADMIN' });
        (prisma.approvalRequest.create as jest.Mock).mockResolvedValue({ id: 'app-1', type: 'ADMIN_ROLE_CHANGE' });

        const req = await AdminStaffService.requestRoleChange(
          'target-ops',
          'FINANCE_ADMIN',
          'Promoting to finance lead',
          'caller-sa',
        );

        expect(req.id).toBe('app-1');
        expect(prisma.approvalRequest.create).toHaveBeenCalled();
      });
    });

    describe('requestDeactivation', () => {
      it('throws 422 if admin tries to deactivate themselves', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' });

        await expect(
          AdminStaffService.requestDeactivation('admin-1', 'Valid reason 1234', 'admin-1'),
        ).rejects.toMatchObject({ status: 422, message: 'You cannot deactivate yourself' });
      });

      it('throws 409 if deactivating the last active Super Admin', async () => {
        (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'target-sa', role: 'SUPER_ADMIN' });
        (prisma.adminUser.count as jest.Mock).mockResolvedValue(1);

        await expect(
          AdminStaffService.requestDeactivation('target-sa', 'Valid reason 1234', 'caller-sa'),
        ).rejects.toMatchObject({ status: 409, message: 'Cannot deactivate the last active Super Admin' });
      });
    });
  });

  describe('ApprovalService', () => {
    describe('decide', () => {
      it('throws 404 if request not found', async () => {
        (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(
          ApprovalService.decide('req-1', 'APPROVED', 'Reason for approval', 'checker-1'),
        ).rejects.toMatchObject({ status: 404 });
      });

      it('throws 409 if request is already decided', async () => {
        (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue({
          id: 'req-1',
          status: 'APPROVED',
          requestedBy: 'maker-1',
        });

        await expect(
          ApprovalService.decide('req-1', 'APPROVED', 'Reason for approval', 'checker-1'),
        ).rejects.toMatchObject({ status: 409, message: 'Request is already decided' });
      });

      it('throws 422 if maker attempts to approve their own request', async () => {
        (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue({
          id: 'req-1',
          status: 'PENDING',
          requestedBy: 'maker-1',
        });

        await expect(
          ApprovalService.decide('req-1', 'APPROVED', 'Reason for approval', 'maker-1'),
        ).rejects.toMatchObject({ status: 422, message: 'You cannot approve your own request' });
      });

      it('executes role change and revokes sessions on approval', async () => {
        (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue({
          id: 'req-1',
          status: 'PENDING',
          type: 'ADMIN_ROLE_CHANGE',
          payload: JSON.stringify({ targetAdminId: 'target-1', newRole: 'FINANCE_ADMIN' }),
          requestedBy: 'maker-1',
        });
        (prisma.approvalRequest.update as jest.Mock).mockResolvedValue({
          id: 'req-1',
          status: 'APPROVED',
        });
        (prisma.adminUser.update as jest.Mock).mockResolvedValue({});
        (prisma.adminSession.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

        const result = await ApprovalService.decide(
          'req-1',
          'APPROVED',
          'Approved by second Super Admin',
          'checker-2',
        );

        expect(result.status).toBe('APPROVED');
        expect(prisma.adminUser.update).toHaveBeenCalledWith({
          where: { id: 'target-1' },
          data: { role: 'FINANCE_ADMIN' },
        });
        expect(prisma.adminSession.updateMany).toHaveBeenCalledWith({
          where: { adminId: 'target-1', revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        });
      });
    });
  });
});
