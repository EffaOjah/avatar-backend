/**
 * Permission Catalogue — mirrors Appendix A of the Admin Console TRD.
 * Every route must declare one of these. Deny-by-default: if a route
 * has no permission attached, the guard rejects the request.
 */

export const PERMISSIONS = {
  // ── Users / Customers ───────────────────────────────────────────────────
  'users:read': 'View users and customers',
  'users:manage': 'Suspend, reactivate, force-logout users',
  'users:delete': 'Soft-delete a user (Super Admin only)',

  // ── Businesses ──────────────────────────────────────────────────────────
  'businesses:read': 'View business profiles',
  'businesses:manage': 'Edit business, set status',
  'businesses:approve': 'Approve or reject business onboarding',
  'businesses:suspend': 'Suspend a business (permanent needs approval)',

  // ── Riders ──────────────────────────────────────────────────────────────
  'riders:read': 'View rider profiles and performance',
  'riders:manage': 'Edit rider, suspend/reactivate',
  'riders:approve': 'Approve or reject rider KYC',

  // ── Orders & Deliveries ─────────────────────────────────────────────────
  'orders:read': 'View orders and delivery details',
  'orders:manage': 'Cancel, reassign, regenerate PIN',
  'orders:override': 'Force-override order status (Super Admin only)',

  // ── Transactions & Wallets ──────────────────────────────────────────────
  'transactions:read': 'View payment transactions and ledger entries',
  'wallets:read': 'View wallet balances and ledgers',
  'wallets:freeze': 'Freeze or unfreeze a wallet',
  'wallets:adjust:request': 'Create wallet credit/debit adjustment requests',

  // ── Payouts ─────────────────────────────────────────────────────────────
  'payouts:read': 'View payout lines and batches',
  'payouts:manage': 'Build payout batches, submit to Paystack, retry failures',
  'payouts:approve': 'Approve a payout batch (Super Admin above threshold)',

  // ── Refunds, Disputes, Incidents ────────────────────────────────────────
  'refunds:read': 'View refund requests',
  'refunds:request': 'Raise a refund request',
  'refunds:decide': 'Approve or reject a refund',
  'disputes:read': 'View disputes',
  'disputes:manage': 'Open, update and resolve disputes',
  'incidents:manage': 'Log and manage operational incidents',

  // ── Support Tickets ─────────────────────────────────────────────────────
  'tickets:read': 'View support tickets',
  'tickets:manage': 'Create, reply, update and close tickets',

  // ── Content Moderation ──────────────────────────────────────────────────
  'content:read': 'View feed, stories and comments',
  'content:moderate': 'Hide, remove, restore content and manage appeals',
  'reviews:read': 'View reviews and ratings',
  'reviews:moderate': 'Hide, remove or restore reviews',
  'abuse_reports:read': 'View abuse report queue',
  'abuse_reports:manage': 'Resolve or escalate abuse reports',

  // ── Notifications ────────────────────────────────────────────────────────
  'notifications:read': 'View notification history and templates',
  'notifications:send:targeted': 'Send a template message to one user',
  'notifications:send:broadcast': 'Send broadcast to a segment (Super Admin only)',

  // ── Analytics ────────────────────────────────────────────────────────────
  'analytics:read': 'View analytics — scope limited by role for non-SA',
  'analytics:read:operations': 'Operations-scoped analytics',
  'analytics:read:finance': 'Finance-scoped analytics',
  'analytics:read:support': 'Support-scoped analytics',
  'analytics:read:moderation': 'Moderation-scoped analytics',

  // ── Platform Settings ────────────────────────────────────────────────────
  'settings:read': 'Read platform settings',
  'settings:write': 'Write / update platform settings (Super Admin only)',

  // ── Reconciliation ───────────────────────────────────────────────────────
  'reconciliation:read': 'View and resolve reconciliation runs',

  // ── Finance Reports ──────────────────────────────────────────────────────
  'finance_reports:export': 'Export financial reports (CSV/XLSX/PDF)',

  // ── Admin / Staff Management ─────────────────────────────────────────────
  'admins:manage': 'Invite admins, assign roles, deactivate, reset MFA',

  // ── Audit ────────────────────────────────────────────────────────────────
  'audit:read': 'View audit logs (Super Admin sees all; others see own)',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

/**
 * Role → permission mapping (fixed in v1).
 * Super Admin has every permission. Other roles have a curated subset.
 */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SUPER_ADMIN: Object.keys(PERMISSIONS) as PermissionKey[],

  OPS_ADMIN: [
    'users:read',
    'users:manage',
    'businesses:read',
    'businesses:manage',
    'riders:read',
    'riders:manage',
    'riders:approve',
    'orders:read',
    'orders:manage',
    'transactions:read',
    'refunds:request',
    'disputes:manage',
    'incidents:manage',
    'tickets:read',
    'notifications:send:targeted',
    'analytics:read:operations',
    'audit:read',
  ],

  FINANCE_ADMIN: [
    'transactions:read',
    'wallets:read',
    'wallets:freeze',
    'wallets:adjust:request',
    'payouts:read',
    'payouts:manage',
    'payouts:approve',
    'refunds:read',
    'refunds:decide',
    'disputes:read',
    'finance_reports:export',
    'reconciliation:read',
    'analytics:read:finance',
    'notifications:send:targeted',
    'audit:read',
  ],

  SUPPORT_ADMIN: [
    'users:read',
    'users:manage',
    'businesses:read',
    'riders:read',
    'wallets:read',
    'refunds:request',
    'disputes:manage',
    'tickets:read',
    'tickets:manage',
    'abuse_reports:manage',
    'notifications:send:targeted',
    'analytics:read:support',
    'audit:read',
  ],

  MODERATION_ADMIN: [
    'users:read',
    'businesses:read',
    'content:read',
    'content:moderate',
    'reviews:read',
    'reviews:moderate',
    'abuse_reports:read',
    'abuse_reports:manage',
    'notifications:send:targeted',
    'analytics:read:moderation',
    'audit:read',
  ],
};
