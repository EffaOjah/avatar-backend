import { authenticateAdmin, requirePermission, AdminRequest } from '../admin.middleware';
import prisma from '../../../database/prisma';
import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    adminSession: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('jsonwebtoken');

describe('Admin Middleware', () => {
  let mockReq: Partial<AdminRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      headers: {},
      cookies: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('authenticateAdmin', () => {
    it('returns 401 UNAUTHENTICATED when no token is present', async () => {
      await authenticateAdmin(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'UNAUTHENTICATED', message: 'No token provided' },
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 INVALID_TOKEN when jwt.verify fails', async () => {
      mockReq.headers = { authorization: 'Bearer invalid_token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await authenticateAdmin(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        }),
      );
    });

    it('returns 401 SESSION_REVOKED if session does not exist, is revoked, or expired', async () => {
      mockReq.headers = { authorization: 'Bearer valid_token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        sessionId: 'session-1',
      });
      (prisma.adminSession.findUnique as jest.Mock).mockResolvedValue(null);

      await authenticateAdmin(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'SESSION_REVOKED', message: 'Session is invalid or has expired' },
        }),
      );
    });

    it('returns 403 ADMIN_DEACTIVATED if admin status is not ACTIVE', async () => {
      mockReq.headers = { authorization: 'Bearer valid_token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        sessionId: 'session-1',
      });
      (prisma.adminSession.findUnique as jest.Mock).mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        admin: { status: 'DEACTIVATED', role: 'SUPER_ADMIN' },
      });

      await authenticateAdmin(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'ADMIN_DEACTIVATED', message: 'Admin account is not active' },
        }),
      );
    });

    it('authenticates successfully and attaches req.admin', async () => {
      mockReq.headers = { authorization: 'Bearer valid_token', 'x-request-id': 'req-xyz' };
      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        sessionId: 'session-1',
      });
      (prisma.adminSession.findUnique as jest.Mock).mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        admin: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
      });

      await authenticateAdmin(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockReq.admin).toBeDefined();
      expect(mockReq.admin?.id).toBe('admin-1');
      expect(mockReq.admin?.role).toBe('SUPER_ADMIN');
      expect(mockReq.admin?.permissions).toContain('admins:manage');
      expect(mockReq.admin?.requestId).toBe('req-xyz');
    });

    it('reads token from cookies if authorization header is not provided', async () => {
      mockReq.cookies = { adminAccessToken: 'cookie_token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        sessionId: 'session-1',
      });
      (prisma.adminSession.findUnique as jest.Mock).mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        admin: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
      });

      await authenticateAdmin(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockReq.admin?.id).toBe('admin-1');
    });
  });

  describe('requirePermission', () => {
    it('returns 401 if req.admin is missing', () => {
      const guard = requirePermission('users:read');
      guard(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 403 if req.admin lacks required permission', () => {
      mockReq.admin = {
        id: 'admin-1',
        role: 'SUPPORT_ADMIN',
        permissions: ['users:read'],
        sessionId: 's-1',
      };

      const guard = requirePermission('admins:manage');
      guard(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Missing required permission: admins:manage',
          },
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next() when req.admin has all required permissions', () => {
      mockReq.admin = {
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        permissions: ['users:read', 'users:delete'],
        sessionId: 's-1',
      };

      const guard = requirePermission('users:read', 'users:delete');
      guard(mockReq as AdminRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});

