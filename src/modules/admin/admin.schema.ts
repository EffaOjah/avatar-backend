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

export const setBusinessStatusSchema = z.object({
  body: z.object({
    status: z.enum(['OPEN', 'CLOSED', 'PAUSED']),
    reason: z.string().optional(),
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

export const reassignRiderSchema = z.object({
  body: z.object({
    riderId: z.string().uuid().optional(),
    pool: z.boolean().default(false),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
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
