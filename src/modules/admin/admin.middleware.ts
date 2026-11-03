import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../database/prisma';
import { PermissionKey, ROLE_PERMISSIONS } from './admin.permissions';

const ADMIN_ACCESS_SECRET =
  process.env.ADMIN_ACCESS_SECRET || 'admin_access_secret_change_me';

export interface AdminRequest extends Request {
  admin?: {
    id: string;
    role: string;
    permissions: PermissionKey[];
    sessionId: string;
    requestId?: string;
  };
}

/**
 * Authenticate an admin from the request access token (cookie or Bearer).
 * Attaches `req.admin` on success.
 */
export const authenticateAdmin = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token =
    req.cookies?.adminAccessToken ||
    req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'No token provided' },
      requestId: req.headers['x-request-id'],
    });
    return;
  }

  let decoded: { id: string; role: string; sessionId: string };
  try {
    decoded = jwt.verify(token, ADMIN_ACCESS_SECRET) as typeof decoded;
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
      requestId: req.headers['x-request-id'],
    });
    return;
  }

  // Verify the session still exists and is not revoked
  const session = await prisma.adminSession.findUnique({
    where: { id: decoded.sessionId },
    include: { admin: { select: { status: true, role: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    res.status(401).json({
      success: false,
      error: { code: 'SESSION_REVOKED', message: 'Session is invalid or has expired' },
      requestId: req.headers['x-request-id'],
    });
    return;
  }

  if (session.admin.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      error: { code: 'ADMIN_DEACTIVATED', message: 'Admin account is not active' },
      requestId: req.headers['x-request-id'],
    });
    return;
  }

  req.admin = {
    id: decoded.id,
    role: decoded.role,
    permissions: ROLE_PERMISSIONS[decoded.role] ?? [],
    sessionId: decoded.sessionId,
    requestId: (req.headers['x-request-id'] as string) || undefined,
  };

  next();
};

/**
 * Guard factory. Verifies that `req.admin` has the required permission.
 * Usage: router.get('/resource', authenticateAdmin, requirePermission('users:read'), handler)
 */
export const requirePermission = (...required: PermissionKey[]) => {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
      });
      return;
    }

    const hasAll = required.every((p) => req.admin!.permissions.includes(p));
    if (!hasAll) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing required permission: ${required.join(', ')}`,
        },
        requestId: req.admin.requestId,
      });
      return;
    }

    next();
  };
};
