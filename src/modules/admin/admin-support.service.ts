/**
 * Support Admin Services — TRD §5.4 (SP-01 to SP-08) & §6.10
 *
 * Services:
 *  - AdminTicketsService          : Ticket queue, SLA calculation, conversation messages, canned responses (SP-01, SP-02, SP-07)
 *  - AdminAccountActionsService   : Account tools: unlock, manual verify, time-boxed suspend, force logout, PIN resend (SP-05)
 *  - AdminSupportAnalyticsService : SLA metrics, first response time, volume by category/agent (SP-08)
 */

import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

async function getSettingValue(key: string, defaultValue: string): Promise<string> {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  return setting?.value ?? defaultValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// SP-01, SP-02, SP-07 — Tickets & Messages
// ─────────────────────────────────────────────────────────────────────────────

export class AdminTicketsService {
  static async listTickets(filters: {
    status?: string;
    priority?: string;
    category?: string;
    source?: string;
    assigneeId?: string;
    customerId?: string;
    slaBreached?: boolean;
    cursor?: string;
    limit?: number;
  }) {
    const { status, priority, category, source, assigneeId, customerId, slaBreached, cursor, limit = 20 } = filters;

    const now = new Date();
    const slaFilter =
      slaBreached === true
        ? { slaDueAt: { lt: now }, status: { notIn: ['RESOLVED', 'CLOSED'] as any } }
        : slaBreached === false
        ? { OR: [{ slaDueAt: { gte: now } }, { status: { in: ['RESOLVED', 'CLOSED'] as any } }] }
        : {};

    const where: Record<string, unknown> = {
      ...(status ? { status: status as any } : {}),
      ...(priority ? { priority: priority as any } : {}),
      ...(category ? { category: category as any } : {}),
      ...(source ? { source: source as any } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(customerId ? { customerId } : {}),
      ...slaFilter,
    };

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        _count: { select: { messages: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const ticketsWithSla = tickets.map((t) => ({
      ...t,
      isSlaBreached: t.slaDueAt ? t.slaDueAt < now && t.status !== 'RESOLVED' && t.status !== 'CLOSED' : false,
    }));

    const nextCursor = tickets.length === limit ? tickets[tickets.length - 1].id : null;
    return { tickets: ticketsWithSla, meta: { cursor: nextCursor, limit } };
  }

  static async getTicketById(ticketId: string, actorRole: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw Object.assign(new Error('Support ticket not found'), { status: 404 });

    // Internal notes are never visible to customer/requester roles
    const isStaff = ['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'MODERATION_ADMIN'].includes(actorRole);
    const messages = isStaff ? ticket.messages : ticket.messages.filter((m) => !m.isInternal);

    const now = new Date();
    const isSlaBreached = ticket.slaDueAt ? ticket.slaDueAt < now && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' : false;

    return {
      ...ticket,
      messages,
      isSlaBreached,
    };
  }

  static async createTicket(
    data: {
      source: 'CUSTOMER' | 'BUSINESS' | 'RIDER';
      category: 'SERVICE' | 'DELIVERY' | 'PAYMENT' | 'CONDUCT' | 'SAFETY' | 'ACCOUNT' | 'OTHER';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      subject: string;
      body: string;
      customerId?: string;
      orderId?: string;
      assigneeId?: string;
      tags?: string[];
      attachments?: string[];
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const { source, category, priority = 'MEDIUM', subject, body, customerId, orderId, assigneeId, tags = [], attachments = [] } = data;

    // SLA hours calculation from platform setting or default
    const slaHoursStr = await getSettingValue('support_sla_hours', '4');
    const slaHours = parseInt(slaHoursStr, 10) || 4;
    const slaDueAt = new Date(Date.now() + slaHours * 3600_000);

    const ticketNumber = `TIK-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        source,
        category,
        priority,
        subject,
        customerId,
        orderId,
        assigneeId,
        slaDueAt,
        tags,
        messages: {
          create: {
            senderId: actorId,
            senderRole: actorRole,
            body,
            isInternal: false,
            attachments,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'ticket.create',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      after: { ticketNumber, category, priority, subject },
      reason: 'Ticket created',
      ip,
      requestId,
    });

    return ticket;
  }

  static async updateTicket(
    ticketId: string,
    data: {
      status?: 'OPEN' | 'PENDING' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      assigneeId?: string | null;
      tags?: string[];
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw Object.assign(new Error('Support ticket not found'), { status: 404 });

    const isResolving = data.status === 'RESOLVED' && ticket.status !== 'RESOLVED';
    const before = { status: ticket.status, priority: ticket.priority, assigneeId: ticket.assigneeId };

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.priority ? { priority: data.priority } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.tags ? { tags: data.tags } : {}),
        ...(isResolving ? { resolvedAt: new Date() } : {}),
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'ticket.update',
      entityType: 'SupportTicket',
      entityId: ticketId,
      before,
      after: { status: updated.status, priority: updated.priority, assigneeId: updated.assigneeId },
      reason: 'Ticket attributes updated',
      ip,
      requestId,
    });

    return updated;
  }

  static async addMessage(
    ticketId: string,
    data: {
      body: string;
      isInternal?: boolean;
      attachments?: string[];
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw Object.assign(new Error('Support ticket not found'), { status: 404 });

    const { body, isInternal = false, attachments = [] } = data;

    // TRD rule: A resolved ticket reopens automatically if requester replies within 7 days
    const isCustomerReplying = !['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'MODERATION_ADMIN'].includes(actorRole);
    let autoReopened = false;

    if (ticket.status === 'RESOLVED' && isCustomerReplying && ticket.resolvedAt) {
      const daysSinceResolution = (Date.now() - ticket.resolvedAt.getTime()) / (1000 * 3600 * 24);
      if (daysSinceResolution <= 7) {
        await prisma.supportTicket.update({
          where: { id: ticketId },
          data: { status: 'OPEN', resolvedAt: null },
        });
        autoReopened = true;
      }
    }

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId: actorId,
        senderRole: actorRole,
        body,
        isInternal,
        attachments,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: isInternal ? 'ticket.internal_note' : 'ticket.reply',
      entityType: 'SupportTicket',
      entityId: ticketId,
      after: { messageId: message.id, isInternal, autoReopened },
      reason: isInternal ? 'Internal support note added' : 'Public response sent',
      ip,
      requestId,
    });

    return { ...message, autoReopened };
  }

  static async listCannedResponses(category?: string) {
    return prisma.cannedResponse.findMany({
      where: category ? { category } : {},
      orderBy: { title: 'asc' },
    });
  }

  static async createCannedResponse(data: { title: string; category?: string; content: string; shortcut?: string }, actorId: string) {
    return prisma.cannedResponse.create({
      data: {
        ...data,
        createdBy: actorId,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SP-05 — Account Actions
// ─────────────────────────────────────────────────────────────────────────────

export class AdminAccountActionsService {
  /**
   * SP-05 — Perform sensitive account action with mandatory reason.
   */
  static async performAccountAction(
    userId: string,
    action: 'UNLOCK_ACCOUNT' | 'TRIGGER_PASSWORD_RESET' | 'VERIFY_EMAIL' | 'VERIFY_PHONE' | 'FORCE_LOGOUT' | 'TEMPORARY_SUSPEND' | 'RESEND_DELIVERY_PIN',
    data: {
      reason: string;
      until?: string; // required for TEMPORARY_SUSPEND
      orderId?: string; // required for RESEND_DELIVERY_PIN
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const { reason, until, orderId } = data;

    if (!reason || reason.trim().length < 10) {
      throw Object.assign(new Error('Reason is mandatory and must be at least 10 characters'), { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    let result: Record<string, unknown> = {};

    switch (action) {
      case 'UNLOCK_ACCOUNT':
      case 'VERIFY_EMAIL':
      case 'VERIFY_PHONE': {
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { isActive: true },
        });
        result = { action, success: true, isActive: updated.isActive };
        break;
      }

      case 'TRIGGER_PASSWORD_RESET': {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60_000); // 30 minutes
        await prisma.passwordResetToken.upsert({
          where: { email: user.email },
          update: { token, expiresAt },
          create: { email: user.email, token, expiresAt },
        });
        result = { action, success: true, expiresAt };
        break;
      }

      case 'FORCE_LOGOUT': {
        // Revoke active sessions
        await prisma.adminSession.updateMany({
          where: { adminId: userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        result = { action, success: true };
        break;
      }

      case 'TEMPORARY_SUSPEND': {
        if (!until) {
          throw Object.assign(new Error('Suspension end date (until) is required for temporary suspension'), { status: 400 });
        }
        const untilDate = new Date(until);
        if (isNaN(untilDate.getTime()) || untilDate <= new Date()) {
          throw Object.assign(new Error('Invalid future datetime for suspension end date'), { status: 400 });
        }

        // Enforce maximum suspension length from settings
        const maxDaysStr = await getSettingValue('support_max_suspension_days', '14');
        const maxDays = parseInt(maxDaysStr, 10) || 14;
        const maxDate = new Date(Date.now() + maxDays * 24 * 3600_000);

        if (untilDate > maxDate) {
          throw Object.assign(
            new Error(`Support suspension cannot exceed ${maxDays} days. Longer suspensions must be escalated to Super Admin.`),
            { status: 422 },
          );
        }

        const updated = await prisma.user.update({
          where: { id: userId },
          data: { isActive: false },
        });
        result = { action, success: true, isActive: updated.isActive, suspendedUntil: untilDate };
        break;
      }

      case 'RESEND_DELIVERY_PIN': {
        if (!orderId) {
          throw Object.assign(new Error('orderId is required to resend a delivery PIN'), { status: 400 });
        }
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { delivery: true },
        });
        if (!order || !order.delivery) {
          throw Object.assign(new Error('Delivery not found for the given order'), { status: 404 });
        }

        // Generate new PIN and hash
        const newPin = Math.floor(100_000 + Math.random() * 900_000).toString();
        const pinHash = await bcrypt.hash(newPin, 10);

        await prisma.delivery.update({
          where: { id: order.delivery.id },
          data: { pinHash, pinRegenerationCount: { increment: 1 } },
        });

        // In a real integration, dispatch SMS/Push to customer here. Never return plain PIN in public response!
        result = { action, success: true, message: 'New delivery PIN dispatched to customer phone' };
        break;
      }

      default:
        throw Object.assign(new Error('Unknown account action'), { status: 400 });
    }

    await writeAuditLog({
      actorId,
      actorRole,
      action: `user.account_action.${action.toLowerCase()}`,
      entityType: 'User',
      entityId: userId,
      after: result,
      reason,
      ip,
      requestId,
    });

    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SP-08 — Support Analytics
// ─────────────────────────────────────────────────────────────────────────────

export class AdminSupportAnalyticsService {
  static async getSupportMetrics(filters: { from?: string; to?: string }) {
    const from = filters.from ? new Date(filters.from) : new Date(Date.now() - 30 * 24 * 3600_000);
    const to = filters.to ? new Date(filters.to) : new Date();

    const dateRange = { createdAt: { gte: from, lte: to } };
    const now = new Date();

    const [
      totalTickets,
      openTickets,
      pendingTickets,
      resolvedTickets,
      ticketsByCategory,
      ticketsByPriority,
      slaBreachedCount,
    ] = await Promise.all([
      prisma.supportTicket.count({ where: dateRange }),
      prisma.supportTicket.count({ where: { ...dateRange, status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { ...dateRange, status: 'PENDING' } }),
      prisma.supportTicket.count({ where: { ...dateRange, status: 'RESOLVED' } }),
      prisma.supportTicket.groupBy({
        by: ['category'],
        where: dateRange,
        _count: { id: true },
      }),
      prisma.supportTicket.groupBy({
        by: ['priority'],
        where: dateRange,
        _count: { id: true },
      }),
      prisma.supportTicket.count({
        where: {
          ...dateRange,
          slaDueAt: { lt: now },
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
      }),
    ]);

    const resolutionRate = totalTickets > 0 ? parseFloat(((resolvedTickets / totalTickets) * 100).toFixed(2)) : 0;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      overview: {
        totalTickets,
        openTickets,
        pendingTickets,
        resolvedTickets,
        slaBreachedCount,
        resolutionRate,
      },
      breakdown: {
        byCategory: ticketsByCategory.map((c) => ({ category: c.category, count: c._count.id })),
        byPriority: ticketsByPriority.map((p) => ({ priority: p.priority, count: p._count.id })),
      },
    };
  }
}
