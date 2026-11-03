import prisma from '../../database/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendEmail } from '../../utils/email';
import { writeAuditLog, wouldRemoveLastSuperAdmin } from './admin.helpers';
import { ROLE_PERMISSIONS, PermissionKey } from './admin.permissions';

const ADMIN_ACCESS_SECRET =
  process.env.ADMIN_ACCESS_SECRET || 'admin_access_secret_change_me';
const ADMIN_REFRESH_SECRET =
  process.env.ADMIN_REFRESH_SECRET || 'admin_refresh_secret_change_me';
const FRONTEND_ADMIN_URL =
  process.env.ADMIN_FRONTEND_URL || 'http://localhost:3001';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;
const INVITE_TTL_HOURS = 48;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function signAccessToken(adminId: string, role: string, sessionId: string) {
  return jwt.sign({ id: adminId, role, sessionId }, ADMIN_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function signRefreshToken(familyId: string, sessionId: string) {
  return jwt.sign({ familyId, sessionId }, ADMIN_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

// ---------------------------------------------------------------------------
// Admin Auth Service
// ---------------------------------------------------------------------------

export class AdminAuthService {
  /**
   * Step 1 of login: validate email + password, return MFA challenge token.
   */
  static async loginStep1(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ) {
    const admin = await prisma.adminUser.findUnique({ where: { email } });

    // Generic error to prevent enumeration
    if (!admin || !admin.passwordHash) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    if (admin.status === 'DEACTIVATED') {
      throw Object.assign(new Error('Admin account is deactivated'), {
        status: 403,
      });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    // Issue a short-lived MFA challenge token (no session created yet)
    const mfaToken = jwt.sign(
      { adminId: admin.id, phase: 'mfa_pending' },
      ADMIN_ACCESS_SECRET,
      { expiresIn: '5m' },
    );

    await writeAuditLog({
      actorId: admin.id,
      actorRole: admin.role,
      action: 'admin.login.step1',
      entityType: 'AdminUser',
      entityId: admin.id,
      ip,
      userAgent,
    });

    return {
      mfaRequired: true,
      mfaToken,
      mfaEnabled: admin.mfaEnabled,
    };
  }

  /**
   * Step 2 of login: verify TOTP, create session, return tokens.
   * If MFA is not yet enrolled, skip TOTP and return tokens (first-login flow).
   */
  static async loginStep2(
    mfaToken: string,
    totp: string,
    ip?: string,
    userAgent?: string,
  ) {
    let decoded: { adminId: string; phase: string };
    try {
      decoded = jwt.verify(mfaToken, ADMIN_ACCESS_SECRET) as typeof decoded;
    } catch {
      throw Object.assign(new Error('MFA token is invalid or expired'), {
        status: 401,
      });
    }

    if (decoded.phase !== 'mfa_pending') {
      throw Object.assign(new Error('Invalid MFA token'), { status: 401 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: decoded.adminId },
    });
    if (!admin) {
      throw Object.assign(new Error('Admin not found'), { status: 404 });
    }

    // TOTP verification
    if (admin.mfaEnabled) {
      if (!admin.mfaSecret) {
        throw Object.assign(new Error('MFA not configured'), { status: 422 });
      }
      // In production integrate a proper TOTP library (e.g. speakeasy / otplib)
      // For now we check a placeholder — replace with:
      //   const verified = totp.verify({ secret: admin.mfaSecret, token: totp });
      const isValidTotp = totp.length === 6 && /^\d+$/.test(totp);
      if (!isValidTotp) {
        throw Object.assign(new Error('Invalid TOTP code'), { status: 401 });
      }
    }

    // Create session
    const familyId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const refreshToken = signRefreshToken(familyId, sessionId);
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const session = await prisma.adminSession.create({
      data: {
        id: sessionId,
        adminId: admin.id,
        refreshHash,
        familyId,
        ip,
        userAgent,
        expiresAt,
      },
    });

    // Update last login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = signAccessToken(admin.id, admin.role, session.id);

    await writeAuditLog({
      actorId: admin.id,
      actorRole: admin.role,
      action: 'admin.login.success',
      entityType: 'AdminUser',
      entityId: admin.id,
      ip,
      userAgent,
    });

    return { accessToken, refreshToken, admin: { id: admin.id, role: admin.role, name: admin.name, email: admin.email } };
  }

  /**
   * Rotate the refresh token. Revoke on reuse (refresh token rotation).
   */
  static async refreshTokens(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ) {
    let decoded: { familyId: string; sessionId: string };
    try {
      decoded = jwt.verify(refreshToken, ADMIN_REFRESH_SECRET) as typeof decoded;
    } catch {
      throw Object.assign(new Error('Refresh token is invalid or expired'), {
        status: 401,
      });
    }

    const session = await prisma.adminSession.findUnique({
      where: { id: decoded.sessionId },
      include: { admin: true },
    });

    if (!session || session.revokedAt) {
      // Possible token reuse — revoke the whole family
      await prisma.adminSession.updateMany({
        where: { familyId: decoded.familyId },
        data: { revokedAt: new Date() },
      });
      throw Object.assign(new Error('Refresh token reuse detected. Sessions revoked.'), {
        status: 401,
      });
    }

    const valid = await bcrypt.compare(refreshToken, session.refreshHash);
    if (!valid) {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
    }

    // Revoke old session, create new one
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const newSessionId = crypto.randomUUID();
    const newRefreshToken = signRefreshToken(decoded.familyId, newSessionId);
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const newSession = await prisma.adminSession.create({
      data: {
        id: newSessionId,
        adminId: session.adminId,
        refreshHash: newRefreshHash,
        familyId: decoded.familyId,
        ip,
        userAgent,
        expiresAt,
      },
    });

    const accessToken = signAccessToken(
      session.adminId,
      session.admin.role,
      newSession.id,
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Revoke the current session.
   */
  static async logout(sessionId: string, actorId: string) {
    await prisma.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog({ actorId, action: 'admin.logout', entityType: 'AdminSession', entityId: sessionId });
  }

  /**
   * Return the admin's profile and their permission list (used by the frontend
   * to render navigation).
   */
  static async getMe(adminId: string) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!admin) throw Object.assign(new Error('Admin not found'), { status: 404 });

    const permissions: PermissionKey[] = ROLE_PERMISSIONS[admin.role] ?? [];
    return { ...admin, permissions };
  }

  /**
   * Request a password reset email (single-use 30-min token).
   */
  static async requestPasswordReset(email: string) {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) return { message: 'If that email exists, a reset link has been sent.' };

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Reuse the existing PasswordResetToken table
    await prisma.passwordResetToken.upsert({
      where: { email },
      update: { token, expiresAt },
      create: { email, token, expiresAt },
    });

    const resetLink = `${FRONTEND_ADMIN_URL}/reset-password?token=${token}`;
    await sendEmail(
      email,
      'Reset your AVATAR Admin password',
      `Click to reset your password: ${resetLink}. Link expires in 30 minutes.`,
      `<p>Click below to reset your AVATAR Admin password:</p>
       <p><a href="${resetLink}">Reset Password</a></p>
       <p>This link expires in <strong>30 minutes</strong>.</p>`,
    );

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  /**
   * Complete a password reset.
   */
  static async resetPassword(token: string, newPassword: string, ip?: string) {
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.expiresAt < new Date()) {
      await prisma.passwordResetToken.deleteMany({ where: { token } });
      throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.adminUser.update({
      where: { email: record.email },
      data: { passwordHash },
    });

    await prisma.passwordResetToken.delete({ where: { token } });

    const admin = await prisma.adminUser.findUnique({ where: { email: record.email } });
    if (admin) {
      await writeAuditLog({
        actorId: admin.id,
        actorRole: admin.role,
        action: 'admin.password.reset',
        entityType: 'AdminUser',
        entityId: admin.id,
        ip,
      });
    }

    return { message: 'Password reset successfully.' };
  }

  /**
   * List active sessions for an admin (for the "My sessions" screen).
   */
  static async listSessions(adminId: string) {
    return prisma.adminSession.findMany({
      where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
    });
  }

  /**
   * Revoke a specific session (self or Super Admin revoking any session).
   */
  static async revokeSession(sessionId: string, actorId: string) {
    const session = await prisma.adminSession.findUnique({ where: { id: sessionId } });
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });

    await prisma.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      actorId,
      action: 'admin.session.revoke',
      entityType: 'AdminSession',
      entityId: sessionId,
    });
  }
}

// ---------------------------------------------------------------------------
// Admin Staff Management Service
// ---------------------------------------------------------------------------

export class AdminStaffService {
  /**
   * Invite a new admin by email. Creates an INVITED record and sends a link.
   */
  static async inviteAdmin(
    data: { email: string; name: string; role: string },
    actorId: string,
    ip?: string,
  ) {
    const existing = await prisma.adminUser.findUnique({ where: { email: data.email } });
    if (existing) throw Object.assign(new Error('An admin with that email already exists'), { status: 409 });

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const newAdmin = await prisma.adminUser.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role as any,
        status: 'INVITED',
        createdBy: actorId,
      },
    });

    // Store invite token as a password reset token (reuse existing table)
    await prisma.passwordResetToken.create({
      data: { email: data.email, token: inviteToken, expiresAt },
    });

    const inviteLink = `${FRONTEND_ADMIN_URL}/accept-invite?token=${inviteToken}`;
    await sendEmail(
      data.email,
      'You have been invited to AVATAR Admin Console',
      `You have been invited as ${data.role}. Accept here: ${inviteLink}`,
      `<p>You have been invited to AVATAR Admin Console as <strong>${data.role}</strong>.</p>
       <p><a href="${inviteLink}">Accept Invitation</a></p>
       <p>This link expires in ${INVITE_TTL_HOURS} hours.</p>`,
    );

    await writeAuditLog({
      actorId,
      action: 'admin.invite',
      entityType: 'AdminUser',
      entityId: newAdmin.id,
      after: { email: data.email, role: data.role },
      ip,
    });

    return newAdmin;
  }

  /**
   * List all admin users.
   */
  static async listAdmins() {
    return prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Request a role change (maker-checker: SA must approve).
   */
  static async requestRoleChange(
    targetAdminId: string,
    newRole: string,
    reason: string,
    actorId: string,
    ip?: string,
  ) {
    const target = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
    if (!target) throw Object.assign(new Error('Admin not found'), { status: 404 });

    if (targetAdminId === actorId) {
      throw Object.assign(new Error('You cannot change your own role'), { status: 422 });
    }

    // Check last SA guard
    if (target.role === 'SUPER_ADMIN' && (await wouldRemoveLastSuperAdmin(targetAdminId))) {
      throw Object.assign(new Error('Cannot demote the last active Super Admin'), { status: 409 });
    }

    const request = await prisma.approvalRequest.create({
      data: {
        type: 'ADMIN_ROLE_CHANGE',
        payload: JSON.stringify({ targetAdminId, currentRole: target.role, newRole, reason }),
        requestedBy: actorId,
      },
    });

    await writeAuditLog({
      actorId,
      action: 'admin.role_change.requested',
      entityType: 'AdminUser',
      entityId: targetAdminId,
      before: { role: target.role },
      after: { role: newRole },
      reason,
      ip,
    });

    return request;
  }

  /**
   * Request deactivation of an admin (maker-checker: another SA must approve).
   */
  static async requestDeactivation(
    targetAdminId: string,
    reason: string,
    actorId: string,
    ip?: string,
  ) {
    const target = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
    if (!target) throw Object.assign(new Error('Admin not found'), { status: 404 });

    if (targetAdminId === actorId) {
      throw Object.assign(new Error('You cannot deactivate yourself'), { status: 422 });
    }

    if (target.role === 'SUPER_ADMIN' && (await wouldRemoveLastSuperAdmin(targetAdminId))) {
      throw Object.assign(new Error('Cannot deactivate the last active Super Admin'), { status: 409 });
    }

    const request = await prisma.approvalRequest.create({
      data: {
        type: 'ADMIN_DEACTIVATION',
        payload: JSON.stringify({ targetAdminId, reason }),
        requestedBy: actorId,
      },
    });

    await writeAuditLog({
      actorId,
      action: 'admin.deactivation.requested',
      entityType: 'AdminUser',
      entityId: targetAdminId,
      reason,
      ip,
    });

    return request;
  }

  /**
   * Force-reset MFA for an admin (forces re-enrolment on next login).
   */
  static async resetMfa(targetAdminId: string, actorId: string, ip?: string) {
    const target = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
    if (!target) throw Object.assign(new Error('Admin not found'), { status: 404 });

    await prisma.adminUser.update({
      where: { id: targetAdminId },
      data: { mfaSecret: null, mfaEnabled: false },
    });

    await writeAuditLog({
      actorId,
      action: 'admin.mfa.reset',
      entityType: 'AdminUser',
      entityId: targetAdminId,
      ip,
    });

    return { message: 'MFA reset. Admin must re-enrol on next login.' };
  }
}

// ---------------------------------------------------------------------------
// Approval Service
// ---------------------------------------------------------------------------

export class ApprovalService {
  /**
   * Decide on a pending approval request. Executes the side-effect when approved.
   */
  static async decide(
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    decisionReason: string,
    actorId: string,
    ip?: string,
  ) {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw Object.assign(new Error('Approval request not found'), { status: 404 });
    if (request.status !== 'PENDING') throw Object.assign(new Error('Request is already decided'), { status: 409 });

    // Checker must differ from maker
    if (request.requestedBy === actorId) {
      throw Object.assign(new Error('You cannot approve your own request'), { status: 422 });
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const updated = await (tx as any).approvalRequest.update({
        where: { id: requestId },
        data: {
          status: decision,
          decidedBy: actorId,
          decidedAt: new Date(),
          decisionReason,
        },
      });

      if (decision === 'APPROVED') {
        await ApprovalService.executeApproval(request, actorId, tx as any);
      }

      await writeAuditLog(
        {
          actorId,
          action: `approval.${decision.toLowerCase()}`,
          entityType: 'ApprovalRequest',
          entityId: requestId,
          after: { decision, decisionReason },
          reason: decisionReason,
          ip,
        },
        tx as any,
      );

      return updated;
    });

    return updatedRequest;
  }

  private static async executeApproval(
    request: { type: string; payload: string; requestedBy: string },
    actorId: string,
    tx: typeof prisma,
  ) {
    const payload = JSON.parse(request.payload);

    switch (request.type) {
      case 'ADMIN_ROLE_CHANGE': {
        await (tx as any).adminUser.update({
          where: { id: payload.targetAdminId },
          data: { role: payload.newRole },
        });
        // Revoke all existing sessions of the affected admin
        await (tx as any).adminSession.updateMany({
          where: { adminId: payload.targetAdminId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        break;
      }
      case 'ADMIN_DEACTIVATION': {
        await (tx as any).adminUser.update({
          where: { id: payload.targetAdminId },
          data: { status: 'DEACTIVATED' },
        });
        await (tx as any).adminSession.updateMany({
          where: { adminId: payload.targetAdminId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        break;
      }
      // Additional types (REFUND, WALLET_ADJUSTMENT, etc.) handled by their
      // respective services when they call ApprovalService.decide()
      default:
        break;
    }
  }

  /**
   * List pending approvals (Super Admin sees all, others see their own).
   */
  static async listPending(actorId: string, isSuperAdmin: boolean) {
    return prisma.approvalRequest.findMany({
      where: {
        status: 'PENDING',
        ...(isSuperAdmin ? {} : { requestedBy: actorId }),
      },
      include: {
        requester: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
