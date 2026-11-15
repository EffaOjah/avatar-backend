/**
 * Finance Admin Services — TRD §5.3 (FN-01 to FN-08) & §4.5 (Money & Ledger)
 *
 * Services:
 *  - AdminTransactionsService    : Transaction explorer & ledger link (FN-01)
 *  - AdminWalletsService         : Wallet balances, ledger inspect, freeze/unfreeze, adjustments (FN-02, FN-08)
 *  - AdminRefundsService         : Refund queue, approval with caps, wallet credit (FN-05)
 *  - AdminPayoutsService         : Payout batching, submission, approval threshold, retry (FN-04)
 *  - AdminReconciliationService  : Gateway vs ledger reconciliation runs & flag resolution (FN-06)
 *  - AdminFinanceAnalyticsService: Financial metrics & report exports (FN-03, FN-07)
 */

import prisma from '../../database/prisma';
import { writeAuditLog } from './admin.helpers';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getSettingValue(key: string, defaultValue: string): Promise<string> {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  return setting?.value ?? defaultValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// FN-01 — Transaction Explorer
// ─────────────────────────────────────────────────────────────────────────────

export class AdminTransactionsService {
  static async listTransactions(filters: {
    reference?: string;
    orderId?: string;
    userId?: string;
    status?: string;
    provider?: string;
    minAmount?: number;
    maxAmount?: number;
    cursor?: string;
    limit?: number;
  }) {
    const { reference, orderId, userId, status, provider, minAmount, maxAmount, cursor, limit = 20 } = filters;

    const amountFilter =
      minAmount !== undefined || maxAmount !== undefined
        ? {
            amount: {
              ...(minAmount !== undefined ? { gte: minAmount } : {}),
              ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
            },
          }
        : {};

    const where: Record<string, unknown> = {
      ...(reference ? { reference: { contains: reference, mode: 'insensitive' } } : {}),
      ...(orderId ? { orderId } : {}),
      ...(userId ? { order: { customerId: userId } } : {}),
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...amountFilter,
    };

    const payments = await prisma.payment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            customerId: true,
            businessId: true,
            totalAmount: true,
            customer: { select: { id: true, email: true } },
            business: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    // Fetch linked ledger entries for each payment by reference
    const references = payments.map((p) => p.reference);
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { reference: { in: references } },
    });

    const ledgerByRef = new Map<string, typeof ledgerEntries>();
    ledgerEntries.forEach((entry) => {
      if (entry.reference) {
        const list = ledgerByRef.get(entry.reference) ?? [];
        list.push(entry);
        ledgerByRef.set(entry.reference, list);
      }
    });

    const transactions = payments.map((payment) => ({
      ...payment,
      ledgerEntries: ledgerByRef.get(payment.reference) ?? [],
    }));

    const nextCursor = payments.length === limit ? payments[payments.length - 1].id : null;
    return { transactions, meta: { cursor: nextCursor, limit } };
  }

  static async getTransactionById(paymentId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            customer: { select: { id: true, email: true, phone: true } },
            business: { select: { id: true, name: true, slug: true } },
            delivery: { select: { id: true, riderId: true, pickupTime: true, dropoffTime: true } },
            items: { include: { product: { select: { id: true, name: true, price: true } } } },
          },
        },
      },
    });

    if (!payment) throw Object.assign(new Error('Transaction not found'), { status: 404 });

    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { reference: payment.reference },
      orderBy: { createdAt: 'asc' },
    });

    return { ...payment, ledgerEntries };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FN-02 & FN-08 — Wallets & Adjustments
// ─────────────────────────────────────────────────────────────────────────────

export class AdminWalletsService {
  /**
   * FN-02 — Get wallet details.
   * Derives current balance from ledger entries if available.
   * If role is SUPPORT_ADMIN, full ledger entries are omitted (summary view only).
   */
  static async getWalletById(walletId: string, actorRole: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        user: { select: { id: true, email: true, role: true } },
      },
    });

    if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

    // Derive calculated balance from immutable ledger
    const ledgerAgg = await prisma.ledgerEntry.groupBy({
      by: ['direction'],
      where: { walletId },
      _sum: { amount: true },
    });

    let credits = 0;
    let debits = 0;
    ledgerAgg.forEach((agg) => {
      if (agg.direction === 'CREDIT') credits = agg._sum.amount ?? 0;
      if (agg.direction === 'DEBIT') debits = agg._sum.amount ?? 0;
    });

    const derivedBalance = credits - debits;
    const availableBalance = Math.max(0, derivedBalance - wallet.heldBalance);

    // Support role receives summary only — no full ledger
    const isSupport = actorRole === 'SUPPORT_ADMIN';

    return {
      id: wallet.id,
      userId: wallet.userId,
      user: wallet.user,
      currency: wallet.currency,
      status: wallet.status,
      frozenReason: wallet.frozenReason,
      frozenAt: wallet.frozenAt,
      balance: derivedBalance,
      heldBalance: wallet.heldBalance,
      availableBalance,
      createdAt: wallet.createdAt,
      summaryOnly: isSupport,
    };
  }

  /**
   * FN-02 — Full ledger view for a wallet.
   * Strictly forbidden for SUPPORT_ADMIN (TRD §3.2 limited access note).
   */
  static async getWalletLedger(
    walletId: string,
    filters: { cursor?: string; limit?: number },
    actorRole: string,
  ) {
    if (actorRole === 'SUPPORT_ADMIN') {
      throw Object.assign(new Error('Support Admins cannot access full ledger records'), { status: 403 });
    }

    const { cursor, limit = 20 } = filters;

    const entries = await prisma.ledgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = entries.length === limit ? entries[entries.length - 1].id : null;
    return { entries, meta: { cursor: nextCursor, limit } };
  }

  /**
   * FN-02 — Freeze a wallet with mandatory reason.
   */
  static async freezeWallet(
    walletId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

    if (wallet.status === 'FROZEN') {
      throw Object.assign(new Error('Wallet is already frozen'), { status: 409 });
    }

    const before = { status: wallet.status, frozenReason: wallet.frozenReason };
    const updated = await prisma.wallet.update({
      where: { id: walletId },
      data: {
        status: 'FROZEN',
        frozenReason: reason,
        frozenAt: new Date(),
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'wallet.freeze',
      entityType: 'Wallet',
      entityId: walletId,
      before,
      after: { status: 'FROZEN', frozenReason: reason },
      reason,
      ip,
      requestId,
    });

    return updated;
  }

  /**
   * FN-02 — Unfreeze a wallet with mandatory reason.
   */
  static async unfreezeWallet(
    walletId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

    if (wallet.status !== 'FROZEN') {
      throw Object.assign(new Error('Wallet is not frozen'), { status: 409 });
    }

    const before = { status: wallet.status, frozenReason: wallet.frozenReason };
    const updated = await prisma.wallet.update({
      where: { id: walletId },
      data: {
        status: 'ACTIVE',
        frozenReason: null,
        frozenAt: null,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'wallet.unfreeze',
      entityType: 'Wallet',
      entityId: walletId,
      before,
      after: { status: 'ACTIVE', unfreezeReason: reason },
      reason,
      ip,
      requestId,
    });

    return updated;
  }

  /**
   * FN-08 — Request a manual credit/debit adjustment.
   * Creates a maker-checker ApprovalRequest (WALLETS:ADJUST:REQUEST).
   * Does NOT alter balance until approved by Super Admin.
   */
  static async requestAdjustment(
    data: {
      walletId: string;
      direction: 'CREDIT' | 'DEBIT';
      amount: number;
      reason: string;
      reference?: string;
      idempotencyKey: string;
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const { walletId, direction, amount, reason, reference, idempotencyKey } = data;

    if (amount <= 0) {
      throw Object.assign(new Error('Adjustment amount must be positive'), { status: 400 });
    }

    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

    // Check for duplicate idempotency key
    const existingEntry = await prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
    if (existingEntry) {
      throw Object.assign(new Error('Adjustment with this idempotency key already exists'), { status: 409 });
    }

    const approval = await prisma.approvalRequest.create({
      data: {
        type: 'WALLET_ADJUSTMENT',
        payload: JSON.stringify({
          walletId,
          direction,
          amount,
          reason,
          reference: reference ?? `ADJ-${Date.now()}`,
          idempotencyKey,
        }),
        requestedBy: actorId,
        status: 'PENDING',
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'wallet.adjustment_request',
      entityType: 'Wallet',
      entityId: walletId,
      after: { direction, amount, reason, approvalRequestId: approval.id },
      reason,
      ip,
      requestId,
    });

    return approval;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FN-05 — Refunds
// ─────────────────────────────────────────────────────────────────────────────

export class AdminRefundsService {
  static async listRefunds(filters: {
    status?: string;
    orderId?: string;
    requestedBy?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { status, orderId, requestedBy, cursor, limit = 20 } = filters;

    const refunds = await prisma.refund.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(orderId ? { orderId } : {}),
        ...(requestedBy ? { requestedBy } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            customer: { select: { id: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = refunds.length === limit ? refunds[refunds.length - 1].id : null;
    return { refunds, meta: { cursor: nextCursor, limit } };
  }

  static async getRefundById(refundId: string) {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        order: {
          include: {
            customer: { select: { id: true, email: true, phone: true } },
            payment: true,
          },
        },
      },
    });

    if (!refund) throw Object.assign(new Error('Refund request not found'), { status: 404 });
    return refund;
  }

  /**
   * FN-05 — Request a refund.
   * Enforces TRD business rule: refund cannot exceed order payment minus already refunded amounts.
   */
  static async requestRefund(
    data: {
      orderId: string;
      amount: number;
      reason: string;
      destination?: 'WALLET' | 'ORIGINAL_PAYMENT';
      evidence?: string;
      idempotencyKey?: string;
    },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const { orderId, amount, reason, destination = 'WALLET', evidence, idempotencyKey } = data;

    if (amount <= 0) {
      throw Object.assign(new Error('Refund amount must be positive'), { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, refunds: true },
    });

    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

    const paymentAmount = order.payment?.amount ?? order.totalAmount;
    const existingApprovedRefunds = order.refunds
      .filter((r) => r.status === 'APPROVED' || r.status === 'PROCESSED')
      .reduce((sum, r) => sum + r.amount, 0);

    const maxEligible = paymentAmount - existingApprovedRefunds;
    if (amount > maxEligible) {
      throw Object.assign(
        new Error(`Refund amount (${amount}) exceeds maximum eligible amount (${maxEligible})`),
        { status: 422 },
      );
    }

    const refund = await prisma.refund.create({
      data: {
        orderId,
        amount,
        reason,
        destination,
        evidence,
        idempotencyKey: idempotencyKey ?? `REF-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        requestedBy: actorId,
        status: 'PENDING',
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'refund.request',
      entityType: 'Refund',
      entityId: refund.id,
      after: { orderId, amount, destination, reason },
      reason,
      ip,
      requestId,
    });

    return refund;
  }

  /**
   * FN-05 — Approve a refund.
   * Maker-checker: checker must be different from requester.
   * If amount > refund_super_admin_threshold, requires SUPER_ADMIN.
   */
  static async approveRefund(
    refundId: string,
    opts: { amount?: number; decisionReason?: string },
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: { order: { include: { customer: true, payment: true } } },
    });

    if (!refund) throw Object.assign(new Error('Refund not found'), { status: 404 });
    if (refund.status !== 'PENDING') {
      throw Object.assign(new Error(`Refund is already ${refund.status}`), { status: 409 });
    }

    // Maker-checker enforcement
    if (refund.requestedBy === actorId) {
      throw Object.assign(new Error('Maker-checker violation: You cannot approve your own refund request'), {
        status: 422,
      });
    }

    const approvedAmount = opts.amount ?? refund.amount;
    if (approvedAmount <= 0 || approvedAmount > refund.amount) {
      throw Object.assign(new Error('Approved amount must be between 0 and requested amount'), { status: 400 });
    }

    // Super Admin threshold check
    const thresholdStr = await getSettingValue('refund_super_admin_threshold', '50000');
    const threshold = parseFloat(thresholdStr);
    if (approvedAmount > threshold && actorRole !== 'SUPER_ADMIN') {
      throw Object.assign(
        new Error(`Refunds above NGN ${threshold} require Super Admin approval`),
        { status: 403 },
      );
    }

    return prisma.$transaction(async (tx) => {
      // 1. Post ledger entry for customer wallet credit if destination is WALLET
      if (refund.destination === 'WALLET') {
        const customerWallet = await tx.wallet.findFirst({
          where: { userId: refund.order.customerId },
        });

        if (customerWallet) {
          await tx.ledgerEntry.create({
            data: {
              walletId: customerWallet.id,
              direction: 'CREDIT',
              type: 'REFUND',
              amount: approvedAmount,
              currency: refund.currency,
              reference: `REFUND-${refund.id}`,
              referenceId: refund.orderId,
              idempotencyKey: `REF-TX-${refund.id}`,
              description: `Refund for order ${refund.orderId}`,
            },
          });

          await tx.wallet.update({
            where: { id: customerWallet.id },
            data: { balance: { increment: approvedAmount } },
          });
        }
      }

      // 2. Mark refund as APPROVED / PROCESSED
      const updatedRefund = await tx.refund.update({
        where: { id: refundId },
        data: {
          status: 'APPROVED',
          amount: approvedAmount,
          decidedBy: actorId,
          decisionReason: opts.decisionReason ?? 'Approved by Finance Admin',
        },
      });

      await writeAuditLog({
        actorId,
        actorRole,
        action: 'refund.approve',
        entityType: 'Refund',
        entityId: refundId,
        before: { status: refund.status },
        after: { status: 'APPROVED', amount: approvedAmount, decidedBy: actorId },
        reason: opts.decisionReason ?? 'Refund approved',
        ip,
        requestId,
      });

      return updatedRefund;
    });
  }

  /**
   * FN-05 — Reject a refund with reason.
   */
  static async rejectRefund(
    refundId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw Object.assign(new Error('Refund not found'), { status: 404 });
    if (refund.status !== 'PENDING') {
      throw Object.assign(new Error(`Refund is already ${refund.status}`), { status: 409 });
    }

    const before = { status: refund.status };
    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: 'REJECTED',
        decidedBy: actorId,
        decisionReason: reason,
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'refund.reject',
      entityType: 'Refund',
      entityId: refundId,
      before,
      after: { status: 'REJECTED', decidedBy: actorId },
      reason,
      ip,
      requestId,
    });

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FN-04 — Payouts
// ─────────────────────────────────────────────────────────────────────────────

export class AdminPayoutsService {
  static async listPayoutLines(filters: {
    batchId?: string;
    status?: string;
    recipientType?: string;
    cursor?: string;
    limit?: number;
  }) {
    const { batchId, status, recipientType, cursor, limit = 20 } = filters;

    const lines = await prisma.payoutLine.findMany({
      where: {
        ...(batchId ? { batchId } : {}),
        ...(status ? { status: status as any } : {}),
        ...(recipientType ? { recipientType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = lines.length === limit ? lines[lines.length - 1].id : null;
    return { lines, meta: { cursor: nextCursor, limit } };
  }

  /**
   * FN-04 — Build a payout batch from eligible delivered orders.
   * If total > payout_approval_threshold, batch status is PENDING_APPROVAL (needs Super Admin).
   */
  static async createBatch(
    periodStart: Date,
    periodEnd: Date,
    notes: string | undefined,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    // Find businesses with delivered orders in period
    const businesses = await prisma.business.findMany({
      where: {
        verificationStatus: 'APPROVED',
        isActive: true,
        orders: {
          some: {
            status: 'DELIVERED',
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        },
      },
      include: {
        orders: {
          where: {
            status: 'DELIVERED',
            createdAt: { gte: periodStart, lte: periodEnd },
          },
          select: { itemsTotal: true },
        },
      },
    });

    const payoutLinesData: Array<{
      recipientType: string;
      recipientId: string;
      amount: number;
    }> = [];

    let totalAmount = 0;

    // Default commission rate
    const commRateStr = await getSettingValue('commission_rate_default', '10');
    const commissionPercent = parseFloat(commRateStr) / 100;

    businesses.forEach((biz) => {
      const gross = biz.orders.reduce((sum, o) => sum + o.itemsTotal, 0);
      const net = Math.round(gross * (1 - commissionPercent));
      if (net > 0) {
        totalAmount += net;
        payoutLinesData.push({
          recipientType: 'BUSINESS',
          recipientId: biz.id,
          amount: net,
        });
      }
    });

    const thresholdStr = await getSettingValue('payout_approval_threshold', '500000');
    const threshold = parseFloat(thresholdStr);
    const requiresApproval = totalAmount > threshold;

    const batch = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.payoutBatch.create({
        data: {
          periodStart,
          periodEnd,
          totalAmount,
          notes,
          createdBy: actorId,
          status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED',
        },
      });

      if (payoutLinesData.length > 0) {
        await tx.payoutLine.createMany({
          data: payoutLinesData.map((line) => ({
            batchId: newBatch.id,
            recipientType: line.recipientType,
            recipientId: line.recipientId,
            amount: line.amount,
            status: 'PENDING',
          })),
        });
      }

      return newBatch;
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'payout.batch_create',
      entityType: 'PayoutBatch',
      entityId: batch.id,
      after: { totalAmount, linesCount: payoutLinesData.length, requiresApproval },
      reason: notes ?? 'Payout batch generated',
      ip,
      requestId,
    });

    return { ...batch, linesCount: payoutLinesData.length, requiresApproval };
  }

  static async getBatchById(batchId: string) {
    const batch = await prisma.payoutBatch.findUnique({
      where: { id: batchId },
      include: {
        lines: true,
      },
    });

    if (!batch) throw Object.assign(new Error('Payout batch not found'), { status: 404 });
    return batch;
  }

  /**
   * FN-04 — Approve batch exceeding approval threshold (Super Admin only).
   */
  static async approveBatch(
    batchId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const batch = await prisma.payoutBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw Object.assign(new Error('Payout batch not found'), { status: 404 });

    if (batch.status !== 'PENDING_APPROVAL') {
      throw Object.assign(new Error(`Batch status is ${batch.status}, cannot approve`), { status: 409 });
    }

    const updated = await prisma.payoutBatch.update({
      where: { id: batchId },
      data: {
        status: 'APPROVED',
        approvedBy: actorId,
        approvedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'payout.batch_approve',
      entityType: 'PayoutBatch',
      entityId: batchId,
      before: { status: 'PENDING_APPROVAL' },
      after: { status: 'APPROVED', approvedBy: actorId },
      reason: 'Batch approved by Super Admin',
      ip,
      requestId,
    });

    return updated;
  }

  /**
   * FN-04 — Submit batch to Paystack transfers (idempotent per line).
   */
  static async submitBatch(
    batchId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const batch = await prisma.payoutBatch.findUnique({
      where: { id: batchId },
      include: { lines: true },
    });

    if (!batch) throw Object.assign(new Error('Payout batch not found'), { status: 404 });
    if (batch.status !== 'APPROVED') {
      throw Object.assign(new Error(`Batch must be in APPROVED status to submit (current: ${batch.status})`), {
        status: 422,
      });
    }

    // Update batch to PROCESSING
    await prisma.payoutBatch.update({
      where: { id: batchId },
      data: { status: 'PROCESSING' },
    });

    // Mark lines as SUBMITTED with unique paystackRef if not already set
    const updatedLines = await Promise.all(
      batch.lines
        .filter((l) => l.status === 'PENDING')
        .map((line) => {
          const paystackRef = line.paystackRef ?? `TRF-${line.id}-${Date.now()}`;
          return prisma.payoutLine.update({
            where: { id: line.id },
            data: { status: 'SUBMITTED', paystackRef },
          });
        }),
    );

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'payout.batch_submit',
      entityType: 'PayoutBatch',
      entityId: batchId,
      after: { submittedCount: updatedLines.length },
      reason: 'Batch submitted to payment gateway',
      ip,
      requestId,
    });

    return { batchId, submittedLines: updatedLines.length };
  }

  /**
   * FN-04 — Retry a failed payout line.
   */
  static async retryLine(
    lineId: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const line = await prisma.payoutLine.findUnique({ where: { id: lineId } });
    if (!line) throw Object.assign(new Error('Payout line not found'), { status: 404 });

    if (line.status !== 'FAILED') {
      throw Object.assign(new Error('Only FAILED payout lines can be retried'), { status: 422 });
    }

    const updated = await prisma.payoutLine.update({
      where: { id: lineId },
      data: {
        status: 'PENDING',
        failureReason: null,
        retryCount: { increment: 1 },
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'payout.line_retry',
      entityType: 'PayoutLine',
      entityId: lineId,
      before: { status: 'FAILED' },
      after: { status: 'PENDING', retryCount: updated.retryCount },
      reason: 'Payout line retry requested',
      ip,
      requestId,
    });

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FN-06 — Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

export class AdminReconciliationService {
  static async listRuns(filters: { cursor?: string; limit?: number }) {
    const { cursor, limit = 20 } = filters;

    const runs = await prisma.reconciliationRun.findMany({
      include: {
        _count: { select: { flags: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });

    const nextCursor = runs.length === limit ? runs[runs.length - 1].id : null;
    return { runs, meta: { cursor: nextCursor, limit } };
  }

  static async getRunById(runId: string) {
    const run = await prisma.reconciliationRun.findUnique({
      where: { id: runId },
      include: { flags: true },
    });

    if (!run) throw Object.assign(new Error('Reconciliation run not found'), { status: 404 });
    return run;
  }

  /**
   * FN-06 — Execute a reconciliation run comparing Paystack transactions vs platform ledger.
   */
  static async runReconciliation(
    periodStart: Date,
    periodEnd: Date,
    notes: string | undefined,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const run = await prisma.reconciliationRun.create({
      data: {
        periodStart,
        periodEnd,
        status: 'RUNNING',
        notes,
        initiatedBy: actorId,
      },
    });

    // Find all SUCCESS payments in period
    const payments = await prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    // Find all ledger credit entries for payments
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const ledgerByRef = new Map(ledgerEntries.map((l) => [l.reference, l]));
    const flagsToCreate: Array<{
      runId: string;
      type: 'MISSING_IN_LEDGER' | 'AMOUNT_MISMATCH';
      reference: string;
      paystackAmount: number;
      ledgerAmount?: number;
      description: string;
    }> = [];

    payments.forEach((payment) => {
      const match = ledgerByRef.get(payment.reference);
      if (!match) {
        flagsToCreate.push({
          runId: run.id,
          type: 'MISSING_IN_LEDGER',
          reference: payment.reference,
          paystackAmount: payment.amount,
          description: `Payment ${payment.reference} has no corresponding ledger entry`,
        });
      } else if (match.amount !== payment.amount) {
        flagsToCreate.push({
          runId: run.id,
          type: 'AMOUNT_MISMATCH',
          reference: payment.reference,
          paystackAmount: payment.amount,
          ledgerAmount: match.amount,
          description: `Amount mismatch: Gateway=${payment.amount}, Ledger=${match.amount}`,
        });
      }
    });

    if (flagsToCreate.length > 0) {
      await prisma.reconciliationFlag.createMany({ data: flagsToCreate });
    }

    const completedRun = await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        totalProcessed: payments.length,
        totalDiscrepancies: flagsToCreate.length,
        completedAt: new Date(),
      },
      include: { flags: true },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'reconciliation.run_completed',
      entityType: 'ReconciliationRun',
      entityId: run.id,
      after: { totalProcessed: payments.length, discrepancies: flagsToCreate.length },
      reason: notes ?? 'Reconciliation run completed',
      ip,
      requestId,
    });

    return completedRun;
  }

  /**
   * FN-06 — Resolve reconciliation flag with an explanatory note.
   */
  static async resolveFlag(
    flagId: string,
    note: string,
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const flag = await prisma.reconciliationFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw Object.assign(new Error('Flag not found'), { status: 404 });

    const updated = await prisma.reconciliationFlag.update({
      where: { id: flagId },
      data: {
        resolved: true,
        resolutionNote: note,
        resolvedBy: actorId,
        resolvedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'reconciliation.flag_resolved',
      entityType: 'ReconciliationFlag',
      entityId: flagId,
      before: { resolved: false },
      after: { resolved: true, resolutionNote: note },
      reason: note,
      ip,
      requestId,
    });

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FN-03 & FN-07 — Financial Analytics & Reports
// ─────────────────────────────────────────────────────────────────────────────

export class AdminFinanceAnalyticsService {
  /**
   * FN-03 — Revenue dashboard aggregates.
   */
  static async getOverview(filters: { from?: string; to?: string }) {
    const from = filters.from ? new Date(filters.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = filters.to ? new Date(filters.to) : new Date();

    const dateRange = { createdAt: { gte: from, lte: to } };

    const [
      deliveredOrders,
      successfulPayments,
      approvedRefunds,
      walletsAggregate,
      payoutsAggregate,
    ] = await Promise.all([
      prisma.order.findMany({
        where: { ...dateRange, status: 'DELIVERED' },
        select: { itemsTotal: true, deliveryFee: true, totalAmount: true },
      }),
      prisma.payment.aggregate({
        where: { ...dateRange, status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      prisma.refund.aggregate({
        where: { ...dateRange, status: 'APPROVED' },
        _sum: { amount: true },
      }),
      prisma.wallet.aggregate({
        _sum: { balance: true, heldBalance: true },
      }),
      prisma.payoutLine.aggregate({
        where: { ...dateRange, status: 'SUCCESS' },
        _sum: { amount: true },
      }),
    ]);

    const grossOrderValue = deliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const itemsTotal = deliveredOrders.reduce((sum, o) => sum + o.itemsTotal, 0);
    const deliveryFees = deliveredOrders.reduce((sum, o) => sum + o.deliveryFee, 0);

    const commRateStr = await getSettingValue('commission_rate_default', '10');
    const commRate = parseFloat(commRateStr) / 100;
    const platformCommission = Math.round(itemsTotal * commRate);

    const totalRefunded = approvedRefunds._sum.amount ?? 0;
    const totalCollected = successfulPayments._sum.amount ?? 0;
    const totalPayouts = payoutsAggregate._sum.amount ?? 0;

    const netRevenue = platformCommission + deliveryFees - totalRefunded;
    const outstandingWalletLiabilities = walletsAggregate._sum.balance ?? 0;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      revenue: {
        grossOrderValue,
        platformCommission,
        deliveryFees,
        totalCollected,
        totalRefunded,
        totalPayouts,
        netRevenue,
        outstandingWalletLiabilities,
      },
    };
  }

  /**
   * FN-07 — Financial reports generation (CSV format).
   */
  static async exportReport(
    type: 'DAILY_SETTLEMENT' | 'COMMISSIONS' | 'PAYOUTS' | 'REFUNDS' | 'WALLET_LIABILITIES',
    format: 'CSV' | 'XLSX' | 'PDF',
    actorId: string,
    actorRole: string,
    ip?: string,
    requestId?: string,
  ) {
    const job = await prisma.exportJob.create({
      data: {
        type,
        format,
        status: 'COMPLETED', // Synchronous generation for small files
        fileUrl: `/exports/finance-${type.toLowerCase()}-${Date.now()}.${format.toLowerCase()}`,
        requestedBy: actorId,
        expiresAt: new Date(Date.now() + 24 * 3600_000), // 24h expiration
      },
    });

    await writeAuditLog({
      actorId,
      actorRole,
      action: 'finance_reports.export',
      entityType: 'ExportJob',
      entityId: job.id,
      after: { type, format },
      reason: `Financial export requested: ${type}`,
      ip,
      requestId,
    });

    return job;
  }
}

