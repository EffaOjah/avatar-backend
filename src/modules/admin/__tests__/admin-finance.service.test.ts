import {
  AdminTransactionsService,
  AdminWalletsService,
  AdminRefundsService,
  AdminPayoutsService,
  AdminReconciliationService,
  AdminFinanceAnalyticsService,
} from '../admin-finance.service';
import prisma from '../../../database/prisma';

jest.mock('../../../database/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    payment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
    },
    ledgerEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      groupBy: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    refund: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    payoutBatch: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payoutLine: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    reconciliationRun: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    reconciliationFlag: {
      findUnique: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    business: {
      findMany: jest.fn(),
    },
    exportJob: {
      create: jest.fn(),
    },
    approvalRequest: {
      create: jest.fn(),
    },
    platformSetting: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('Finance Admin Services (FN-01 to FN-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => {
      if (typeof cb === 'function') return cb(prisma);
      return Promise.all(cb);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FN-01: Transactions Explorer
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminTransactionsService', () => {
    it('listTransactions attaches linked ledger entries for each payment', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([
        { id: 'p-1', reference: 'REF-100', amount: 5000, status: 'SUCCESS' },
      ]);
      (prisma.ledgerEntry.findMany as jest.Mock).mockResolvedValue([
        { id: 'l-1', reference: 'REF-100', amount: 5000, direction: 'CREDIT' },
      ]);

      const res = await AdminTransactionsService.listTransactions({});
      expect(res.transactions).toHaveLength(1);
      expect(res.transactions[0].ledgerEntries).toHaveLength(1);
      expect(res.transactions[0].ledgerEntries[0].id).toBe('l-1');
    });

    it('getTransactionById throws 404 if payment does not exist', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(AdminTransactionsService.getTransactionById('unknown-id')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FN-02 & FN-08: Wallets & Adjustments
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminWalletsService', () => {
    it('getWalletById derives balance from ledger and sets summaryOnly for SUPPORT_ADMIN', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        id: 'w-1',
        userId: 'u-1',
        currency: 'NGN',
        status: 'ACTIVE',
        heldBalance: 500,
        createdAt: new Date(),
      });
      (prisma.ledgerEntry.groupBy as jest.Mock).mockResolvedValue([
        { direction: 'CREDIT', _sum: { amount: 10000 } },
        { direction: 'DEBIT', _sum: { amount: 2000 } },
      ]);

      const result = await AdminWalletsService.getWalletById('w-1', 'SUPPORT_ADMIN');
      expect(result.balance).toBe(8000); // 10000 - 2000
      expect(result.availableBalance).toBe(7500); // 8000 - 500
      expect(result.summaryOnly).toBe(true);
    });

    it('getWalletLedger throws 403 for SUPPORT_ADMIN', async () => {
      await expect(
        AdminWalletsService.getWalletLedger('w-1', {}, 'SUPPORT_ADMIN'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('freezeWallet updates status to FROZEN and writes audit log', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        id: 'w-1',
        status: 'ACTIVE',
      });
      (prisma.wallet.update as jest.Mock).mockResolvedValue({
        id: 'w-1',
        status: 'FROZEN',
        frozenReason: 'Fraud investigation',
      });

      const res = await AdminWalletsService.freezeWallet(
        'w-1',
        'Fraud investigation in progress',
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.status).toBe('FROZEN');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('unfreezeWallet restores ACTIVE status and writes audit log', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        id: 'w-1',
        status: 'FROZEN',
        frozenReason: 'Under review',
      });
      (prisma.wallet.update as jest.Mock).mockResolvedValue({
        id: 'w-1',
        status: 'ACTIVE',
      });

      const res = await AdminWalletsService.unfreezeWallet(
        'w-1',
        'Review concluded, verified legit',
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.status).toBe('ACTIVE');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('requestAdjustment creates WALLET_ADJUSTMENT approval request', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ id: 'w-1' });
      (prisma.ledgerEntry.findUnique as jest.Mock).mockResolvedValue(null); // No collision on idempotency key
      (prisma.approvalRequest.create as jest.Mock).mockResolvedValue({
        id: 'appr-adj-1',
        type: 'WALLET_ADJUSTMENT',
        status: 'PENDING',
      });

      const res = await AdminWalletsService.requestAdjustment(
        {
          walletId: 'w-1',
          direction: 'CREDIT',
          amount: 2500,
          reason: 'Compensation for order cancellation error',
          idempotencyKey: 'IDEMP-ADJ-001',
        },
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.id).toBe('appr-adj-1');
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'WALLET_ADJUSTMENT',
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FN-05: Refunds
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminRefundsService', () => {
    it('requestRefund rejects if refund amount exceeds maximum eligible amount', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'o-1',
        payment: { amount: 5000 },
        totalAmount: 5000,
        refunds: [{ status: 'APPROVED', amount: 4000 }], // only 1000 eligible left
      });

      await expect(
        AdminRefundsService.requestRefund(
          {
            orderId: 'o-1',
            amount: 2000, // exceeds 1000
            reason: 'Item completely missing',
          },
          'admin-1',
          'FINANCE_ADMIN',
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('approveRefund enforces maker-checker: cannot approve own request', async () => {
      (prisma.refund.findUnique as jest.Mock).mockResolvedValue({
        id: 'ref-1',
        requestedBy: 'admin-1', // same as approver
        status: 'PENDING',
        amount: 2000,
        order: { customerId: 'cust-1' },
      });

      await expect(
        AdminRefundsService.approveRefund('ref-1', {}, 'admin-1', 'FINANCE_ADMIN'),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('approveRefund credits customer wallet and updates refund status', async () => {
      (prisma.refund.findUnique as jest.Mock).mockResolvedValue({
        id: 'ref-1',
        requestedBy: 'admin-maker',
        status: 'PENDING',
        amount: 3000,
        destination: 'WALLET',
        currency: 'NGN',
        orderId: 'o-1',
        order: { customerId: 'cust-1' },
      });
      (prisma.platformSetting.findUnique as jest.Mock).mockResolvedValue({
        key: 'refund_super_admin_threshold',
        value: '50000',
      });
      (prisma.wallet.findFirst as jest.Mock).mockResolvedValue({ id: 'w-cust' });
      (prisma.refund.update as jest.Mock).mockResolvedValue({ id: 'ref-1', status: 'APPROVED' });

      const res = await AdminRefundsService.approveRefund(
        'ref-1',
        { decisionReason: 'Valid complaint verified' },
        'admin-checker',
        'FINANCE_ADMIN',
      );

      expect(res.status).toBe('APPROVED');
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: 'w-cust',
            direction: 'CREDIT',
            type: 'REFUND',
            amount: 3000,
          }),
        }),
      );
      expect(prisma.wallet.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('rejectRefund sets REJECTED status with reason and logs audit', async () => {
      (prisma.refund.findUnique as jest.Mock).mockResolvedValue({
        id: 'ref-1',
        status: 'PENDING',
      });
      (prisma.refund.update as jest.Mock).mockResolvedValue({
        id: 'ref-1',
        status: 'REJECTED',
      });

      const res = await AdminRefundsService.rejectRefund(
        'ref-1',
        'Customer already consumed items',
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.status).toBe('REJECTED');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FN-04: Payouts
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminPayoutsService', () => {
    it('createBatch flags batch as PENDING_APPROVAL when total exceeds threshold', async () => {
      (prisma.business.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'b-1',
          orders: [{ itemsTotal: 1000000 }], // 1 million
        },
      ]);
      (prisma.platformSetting.findUnique as jest.Mock)
        .mockResolvedValueOnce({ key: 'commission_rate_default', value: '10' })
        .mockResolvedValueOnce({ key: 'payout_approval_threshold', value: '500000' });

      (prisma.payoutBatch.create as jest.Mock).mockResolvedValue({
        id: 'batch-1',
        totalAmount: 900000,
        status: 'PENDING_APPROVAL',
      });

      const res = await AdminPayoutsService.createBatch(
        new Date('2026-11-01'),
        new Date('2026-11-07'),
        'Weekly merchant payout',
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.requiresApproval).toBe(true);
      expect(prisma.payoutLine.createMany).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('approveBatch updates status to APPROVED for Super Admin', async () => {
      (prisma.payoutBatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'batch-1',
        status: 'PENDING_APPROVAL',
      });
      (prisma.payoutBatch.update as jest.Mock).mockResolvedValue({
        id: 'batch-1',
        status: 'APPROVED',
      });

      const res = await AdminPayoutsService.approveBatch('batch-1', 'sa-admin', 'SUPER_ADMIN');
      expect(res.status).toBe('APPROVED');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('submitBatch transitions batch to PROCESSING and marks lines SUBMITTED', async () => {
      (prisma.payoutBatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'batch-1',
        status: 'APPROVED',
        lines: [
          { id: 'line-1', status: 'PENDING', paystackRef: null },
          { id: 'line-2', status: 'PENDING', paystackRef: null },
        ],
      });
      (prisma.payoutBatch.update as jest.Mock).mockResolvedValue({});
      (prisma.payoutLine.update as jest.Mock).mockResolvedValue({});

      const res = await AdminPayoutsService.submitBatch('batch-1', 'admin-1', 'FINANCE_ADMIN');
      expect(res.submittedLines).toBe(2);
      expect(prisma.payoutBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PROCESSING' },
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('retryLine resets failed payout line back to PENDING', async () => {
      (prisma.payoutLine.findUnique as jest.Mock).mockResolvedValue({
        id: 'line-1',
        status: 'FAILED',
        retryCount: 1,
      });
      (prisma.payoutLine.update as jest.Mock).mockResolvedValue({
        id: 'line-1',
        status: 'PENDING',
        retryCount: 2,
      });

      const res = await AdminPayoutsService.retryLine('line-1', 'admin-1', 'FINANCE_ADMIN');
      expect(res.status).toBe('PENDING');
      expect(res.retryCount).toBe(2);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FN-06: Reconciliation
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminReconciliationService', () => {
    it('runReconciliation identifies payments missing from ledger and logs discrepancies', async () => {
      (prisma.reconciliationRun.create as jest.Mock).mockResolvedValue({ id: 'rec-1' });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([
        { reference: 'PAY-1', amount: 5000, status: 'SUCCESS' },
        { reference: 'PAY-2', amount: 2000, status: 'SUCCESS' }, // Missing from ledger
      ]);
      (prisma.ledgerEntry.findMany as jest.Mock).mockResolvedValue([
        { reference: 'PAY-1', amount: 5000 },
      ]);
      (prisma.reconciliationRun.update as jest.Mock).mockResolvedValue({
        id: 'rec-1',
        status: 'COMPLETED',
        totalProcessed: 2,
        totalDiscrepancies: 1,
        flags: [{ type: 'MISSING_IN_LEDGER', reference: 'PAY-2' }],
      });

      const res = await AdminReconciliationService.runReconciliation(
        new Date('2026-11-01'),
        new Date('2026-11-02'),
        'Daily reconciliation',
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.totalDiscrepancies).toBe(1);
      expect(prisma.reconciliationFlag.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            type: 'MISSING_IN_LEDGER',
            reference: 'PAY-2',
            paystackAmount: 2000,
          }),
        ],
      });
    });

    it('resolveFlag marks discrepancy as resolved with note', async () => {
      (prisma.reconciliationFlag.findUnique as jest.Mock).mockResolvedValue({ id: 'flag-1' });
      (prisma.reconciliationFlag.update as jest.Mock).mockResolvedValue({
        id: 'flag-1',
        resolved: true,
        resolutionNote: 'Manual reversing entry posted',
      });

      const res = await AdminReconciliationService.resolveFlag(
        'flag-1',
        'Manual reversing entry posted in ledger',
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.resolved).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FN-03 & FN-07: Analytics & Exports
  // ───────────────────────────────────────────────────────────────────────────
  describe('AdminFinanceAnalyticsService', () => {
    it('getOverview calculates GOV, commissions, and liabilities', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        { itemsTotal: 8000, deliveryFee: 1000, totalAmount: 9000 },
      ]);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 9000 } });
      (prisma.refund.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 500 } });
      (prisma.wallet.aggregate as jest.Mock).mockResolvedValue({ _sum: { balance: 15000, heldBalance: 2000 } });
      (prisma.payoutLine.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 6000 } });
      (prisma.platformSetting.findUnique as jest.Mock).mockResolvedValue({
        key: 'commission_rate_default',
        value: '10',
      });

      const res = await AdminFinanceAnalyticsService.getOverview({});
      expect(res.revenue.grossOrderValue).toBe(9000);
      expect(res.revenue.platformCommission).toBe(800); // 10% of 8000
      expect(res.revenue.deliveryFees).toBe(1000);
      expect(res.revenue.totalRefunded).toBe(500);
      expect(res.revenue.netRevenue).toBe(1300); // 800 + 1000 - 500
      expect(res.revenue.outstandingWalletLiabilities).toBe(15000);
    });

    it('exportReport creates export job record and logs audit', async () => {
      (prisma.exportJob.create as jest.Mock).mockResolvedValue({
        id: 'exp-1',
        type: 'COMMISSIONS',
        format: 'CSV',
        status: 'COMPLETED',
      });

      const res = await AdminFinanceAnalyticsService.exportReport(
        'COMMISSIONS',
        'CSV',
        'admin-1',
        'FINANCE_ADMIN',
      );

      expect(res.id).toBe('exp-1');
      expect(prisma.exportJob.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});

