import { z } from 'zod';

// ── Auth ─────────────────────────────────────────────────────────────────────

export const adminLoginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const adminMfaVerifySchema = z.object({
  body: z.object({
    mfaToken: z.string().min(1, 'MFA token is required'),
    totp: z.string().length(6, 'TOTP must be exactly 6 digits'),
  }),
});

export const adminPasswordResetRequestSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const adminPasswordResetSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    newPassword: z
      .string()
      .min(12, 'Password must be at least 12 characters'),
  }),
});

// ── Staff Management ─────────────────────────────────────────────────────────

export const inviteAdminSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().min(1, 'Name is required'),
    role: z.enum([
      'SUPER_ADMIN',
      'OPS_ADMIN',
      'FINANCE_ADMIN',
      'SUPPORT_ADMIN',
      'MODERATION_ADMIN',
    ]),
  }),
});

export const changeAdminRoleSchema = z.object({
  body: z.object({
    role: z.enum([
      'SUPER_ADMIN',
      'OPS_ADMIN',
      'FINANCE_ADMIN',
      'SUPPORT_ADMIN',
      'MODERATION_ADMIN',
    ]),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const deactivateAdminSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

// ── Users ────────────────────────────────────────────────────────────────────

export const suspendUserSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    until: z.string().datetime().optional(),
  }),
});

export const reactivateUserSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const deleteUserSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

// ── Businesses ───────────────────────────────────────────────────────────────

export const approveBusinessSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }),
});

export const rejectBusinessSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const suspendBusinessSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    permanent: z.boolean().default(false),
  }),
});

// ── Riders ───────────────────────────────────────────────────────────────────

export const approveRiderSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }),
});

export const rejectRiderSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const suspendRiderSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    permanent: z.boolean().default(false),
    until: z.string().datetime().optional(),
  }),
});

// ── Orders ───────────────────────────────────────────────────────────────────

export const cancelOrderSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    reasonCode: z.string().optional(),
  }),
});

export const overrideOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum([
      'PENDING_PAYMENT',
      'PAID',
      'ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
    ]),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

// ── Platform Settings ────────────────────────────────────────────────────────

export const updateSettingSchema = z.object({
  body: z.object({
    value: z.string().min(1, 'Value is required'),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

// ── Approvals ────────────────────────────────────────────────────────────────

export const decideApprovalSchema = z.object({
  body: z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

// ── Audit Log Query ──────────────────────────────────────────────────────────

export const auditLogQuerySchema = z.object({
  query: z.object({
    actorId: z.string().uuid().optional(),
    action: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().uuid().optional(),
    requestId: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// ── Users Query ──────────────────────────────────────────────────────────────

export const usersQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    role: z.enum(['CUSTOMER', 'BUSINESS', 'RIDER', 'ADMIN']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// ── Operations Admin ──────────────────────────────────────────────────────────

export const ordersQuerySchema = z.object({
  query: z.object({
    status: z
      .enum([
        'PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PREPARING',
        'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
      ])
      .optional(),
    businessId: z.string().uuid().optional(),
    riderId: z.string().uuid().optional(),
    zone: z.string().optional(),
    minAgeMinutes: z.coerce.number().int().min(0).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const reassignRiderSchema = z.object({
  body: z
    .object({
      riderId: z.string().uuid().optional(),
      pool: z.boolean().default(false),
      reason: z.string().min(10, 'Reason must be at least 10 characters'),
    })
    .refine((d) => d.riderId || d.pool, {
      message: 'Either riderId or pool=true must be provided',
    }),
});

export const regeneratePinSchema = z.object({
  body: z.object({}).optional(),
});

export const riderDocumentActionSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters').optional(),
  }),
});

export const suspendRiderOpsSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    until: z.string().datetime({ message: 'until must be a valid ISO 8601 datetime' }),
  }),
});

export const permanentSuspendRiderSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const ridersQuerySchema = z.object({
  query: z.object({
    online: z
      .string()
      .optional()
      .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
    zone: z.string().optional(),
    verificationStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const setBusinessStatusSchema = z.object({
  body: z.object({
    status: z.enum(['OPEN', 'CLOSED', 'PAUSED']),
    reason: z.string().optional(),
  }),
});

export const setProductAvailabilitySchema = z.object({
  body: z.object({
    isAvailable: z.boolean(),
    reason: z.string().optional(),
  }),
});

export const sendNotificationSchema = z.object({
  body: z.object({
    templateKey: z.string().min(1, 'Template key is required'),
    orderId: z.string().uuid().optional(),
    message: z.string().min(1, 'Message is required'),
  }),
});

export const logIncidentSchema = z.object({
  body: z.object({
    type: z.enum([
      'LATE_DELIVERY',
      'FAILED_DELIVERY',
      'RIDER_NO_SHOW',
      'ACCIDENT',
      'ITEM_MISSING',
      'SUSPECTED_FRAUD',
    ]),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    orderId: z.string().uuid().optional(),
    riderId: z.string().uuid().optional(),
    businessId: z.string().uuid().optional(),
  }),
});

export const updateIncidentSchema = z.object({
  body: z.object({
    ownerId: z.string().uuid().optional(),
    notes: z.string().optional(),
    status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED']).optional(),
  }),
});

export const incidentsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED']).optional(),
    type: z
      .enum([
        'LATE_DELIVERY', 'FAILED_DELIVERY', 'RIDER_NO_SHOW',
        'ACCIDENT', 'ITEM_MISSING', 'SUSPECTED_FRAUD',
      ])
      .optional(),
    orderId: z.string().uuid().optional(),
    riderId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const openDisputeSchema = z.object({
  body: z.object({
    description: z.string().min(10, 'Description must be at least 10 characters'),
    orderId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
  }),
});

export const updateDisputeSchema = z.object({
  body: z.object({
    ownerId: z.string().uuid().optional(),
    status: z.enum(['OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
    resolution: z.string().optional(),
    escalateTo: z.string().optional(),
    refundAmount: z.number().positive().optional(),
    refundReason: z.string().optional(),
  }),
});

export const disputesQuerySchema = z.object({
  query: z.object({
    status: z.enum(['OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
    orderId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const analyticsQuerySchema = z.object({
  query: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});

// ── Finance Admin ────────────────────────────────────────────────────────────

export const transactionsQuerySchema = z.object({
  query: z.object({
    reference: z.string().optional(),
    orderId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    status: z.string().optional(),
    provider: z.string().optional(),
    minAmount: z.coerce.number().positive().optional(),
    maxAmount: z.coerce.number().positive().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const freezeWalletSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const unfreezeWalletSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const walletAdjustmentSchema = z.object({
  body: z.object({
    walletId: z.string().uuid(),
    direction: z.enum(['CREDIT', 'DEBIT']),
    amount: z.number().positive('Amount must be positive'),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    reference: z.string().optional(),
    idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  }),
});

export const refundsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED']).optional(),
    orderId: z.string().uuid().optional(),
    requestedBy: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const createRefundSchema = z.object({
  body: z.object({
    orderId: z.string().uuid(),
    amount: z.number().positive('Amount must be positive'),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    destination: z.enum(['WALLET', 'ORIGINAL_PAYMENT']).default('WALLET'),
    evidence: z.string().optional(),
    idempotencyKey: z.string().optional(),
  }),
});

export const approveRefundSchema = z.object({
  body: z.object({
    amount: z.number().positive().optional(),
    decisionReason: z.string().min(10, 'Decision reason must be at least 10 characters').optional(),
  }),
});

export const rejectRefundSchema = z.object({
  body: z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
});

export const payoutsQuerySchema = z.object({
  query: z.object({
    batchId: z.string().uuid().optional(),
    status: z.enum(['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED', 'EXCLUDED']).optional(),
    recipientType: z.enum(['BUSINESS', 'RIDER']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const createPayoutBatchSchema = z.object({
  body: z.object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    notes: z.string().optional(),
  }),
});

export const reconciliationRunsQuerySchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const triggerReconciliationSchema = z.object({
  body: z.object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    notes: z.string().optional(),
  }),
});

export const resolveReconciliationFlagSchema = z.object({
  body: z.object({
    note: z.string().min(10, 'Resolution note must be at least 10 characters'),
  }),
});

export const exportFinanceReportSchema = z.object({
  body: z.object({
    type: z.enum(['DAILY_SETTLEMENT', 'COMMISSIONS', 'PAYOUTS', 'REFUNDS', 'WALLET_LIABILITIES']),
    format: z.enum(['CSV', 'XLSX', 'PDF']).default('CSV'),
  }),
});
