import prisma from '../../database/prisma';
import { PermissionKey } from './admin.permissions';

/**
 * Write an immutable audit log row inside the same transaction when possible.
 * The caller should pass the `tx` (Prisma transaction client) so the audit
 * write happens atomically with the change; if no tx is provided it uses the
 * global client.
 */
export async function writeAuditLog(
  params: {
    actorId: string;
    actorRole?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    before?: object;
    after?: object;
    reason?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  },
  tx?: typeof prisma,
) {
  const client = tx ?? prisma;

  const redact = (obj?: object): string | undefined => {
    if (!obj) return undefined;
    // Redact common sensitive fields
    const sensitive = ['password', 'passwordHash', 'mfaSecret', 'pinHash'];
    const copy = { ...(obj as Record<string, unknown>) };
    for (const key of sensitive) {
      if (key in copy) copy[key] = '[REDACTED]';
    }
    return JSON.stringify(copy);
  };

  return (client as any).auditLog.create({
    data: {
      action: params.action,
      actorId: params.actorId,
      actorRole: params.actorRole,
      entityType: params.entityType,
      entityId: params.entityId,
      before: redact(params.before),
      after: redact(params.after),
      reason: params.reason,
      ip: params.ip,
      userAgent: params.userAgent,
      requestId: params.requestId,
    },
  });
}

/**
 * Return the permission list for an admin role from the static mapping.
 * We import lazily to keep this util dependency-free of the constants file
 * when used in tests.
 */
export function getPermissionsForRole(role: string): PermissionKey[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ROLE_PERMISSIONS } = require('./admin.permissions') as typeof import('./admin.permissions');
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check whether the active Super Admin count would drop below 1 after
 * deactivating / role-changing the given admin id. Used to enforce the
 * "last SA cannot be deactivated" rule.
 */
export async function wouldRemoveLastSuperAdmin(adminId: string): Promise<boolean> {
  const activeSuperAdmins = await prisma.adminUser.count({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });
  return activeSuperAdmins <= 1;
}
