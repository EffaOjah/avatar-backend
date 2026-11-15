import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

export const adminSwaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AVATAR Admin Console API Documentation',
      version: '1.0.0',
      description:
        'Technical Requirements Document (TRD) compliant API documentation for the AVATAR Admin Console. Enforces Role-Based Access Control (RBAC) across Super Admin, Operations, Finance, Support, and Moderation.',
      contact: {
        name: 'AVATAR Platform Engineering',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1/admin',
        description: 'Local Development Server (Base: /api/v1/admin)',
      },
    ],
    components: {
      securitySchemes: {
        adminBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '15-minute Admin JWT Access Token passed in the Authorization header.',
        },
        adminCookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'adminAccessToken',
          description: '15-minute Admin JWT Access Token stored in httpOnly, Secure cookie.',
        },
        adminRefreshToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-refresh-token',
          description: '7-day Admin Refresh Token used for token rotation.',
        },
      },
      schemas: {
        StandardSuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            meta: { type: 'object' },
          },
        },
        StandardErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'FORBIDDEN' },
                message: { type: 'string', example: 'Missing required permission' },
              },
            },
            requestId: { type: 'string', example: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6' },
          },
        },
        AdminUser: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: {
              type: 'string',
              enum: ['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'MODERATION_ADMIN'],
            },
            status: { type: 'string', enum: ['INVITED', 'ACTIVE', 'DEACTIVATED'] },
            mfaEnabled: { type: 'boolean' },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApprovalRequest: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: {
              type: 'string',
              enum: [
                'REFUND',
                'WALLET_ADJUSTMENT',
                'PAYOUT_BATCH',
                'ADMIN_ROLE_CHANGE',
                'ADMIN_DEACTIVATION',
                'RIDER_PERMANENT_SUSPENSION',
                'BUSINESS_PERMANENT_SUSPENSION',
                'ORDER_STATUS_OVERRIDE',
              ],
            },
            payload: { type: 'string', description: 'JSON stringified context for checkers' },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
            requestedBy: { type: 'string', format: 'uuid' },
            decidedBy: { type: 'string', format: 'uuid', nullable: true },
            decidedAt: { type: 'string', format: 'date-time', nullable: true },
            decisionReason: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PlatformSetting: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            key: { type: 'string', example: 'commission_rate_default' },
            value: { type: 'string', example: '0.10' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            action: { type: 'string', example: 'user.suspend' },
            actorId: { type: 'string', format: 'uuid' },
            actorRole: { type: 'string', example: 'SUPER_ADMIN' },
            entityType: { type: 'string', example: 'User' },
            entityId: { type: 'string', format: 'uuid' },
            before: { type: 'string', description: 'Redacted JSON snapshot before mutation' },
            after: { type: 'string', description: 'Redacted JSON snapshot after mutation' },
            reason: { type: 'string' },
            ip: { type: 'string' },
            requestId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        LedgerEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            walletId: { type: 'string', format: 'uuid', nullable: true },
            direction: { type: 'string', enum: ['CREDIT', 'DEBIT'] },
            type: { type: 'string', example: 'ORDER_DELIVERY_CREDIT' },
            amount: { type: 'number', example: 5000 },
            currency: { type: 'string', example: 'NGN' },
            reference: { type: 'string', example: 'PAY-100234' },
            description: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            balance: { type: 'number', example: 25000 },
            heldBalance: { type: 'number', example: 0 },
            availableBalance: { type: 'number', example: 25000 },
            currency: { type: 'string', example: 'NGN' },
            status: { type: 'string', enum: ['ACTIVE', 'FROZEN'] },
            frozenReason: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Refund: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            orderId: { type: 'string', format: 'uuid' },
            amount: { type: 'number', example: 3500 },
            currency: { type: 'string', example: 'NGN' },
            reason: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED'] },
            destination: { type: 'string', enum: ['WALLET', 'ORIGINAL_PAYMENT'] },
            requestedBy: { type: 'string', format: 'uuid' },
            decidedBy: { type: 'string', format: 'uuid', nullable: true },
            decisionReason: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PayoutBatch: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            periodStart: { type: 'string', format: 'date-time' },
            periodEnd: { type: 'string', format: 'date-time' },
            totalAmount: { type: 'number', example: 850000 },
            currency: { type: 'string', example: 'NGN' },
            status: { type: 'string', enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED'] },
            approvedBy: { type: 'string', format: 'uuid', nullable: true },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Admin Auth', description: 'Admin authentication, 2-step TOTP MFA, session rotation, and password management' },
      { name: 'Admin Staff Management', description: 'Staff invitation, role assignments, maker-checker requests, and MFA resets' },
      { name: 'Admin Approvals', description: 'Maker-checker approval engine for sensitive cross-platform actions' },
      { name: 'Admin Users', description: 'Platform customer and user oversight with role-aware PII masking and soft-deletes' },
      { name: 'Admin Businesses', description: 'Business onboarding verification, operational status, and suspension' },
      { name: 'Admin Riders', description: 'Rider KYC review, roster status, and operational actions' },
      { name: 'Admin Orders', description: 'Live order tracking, cancellations, and Super Admin status overrides' },
      { name: 'Admin Platform Settings', description: 'Versioned system settings and operational parameters (Super Admin only)' },
      { name: 'Admin Audit Logs', description: 'Append-only audit trail search and security compliance inspector' },
      { name: 'Admin Dashboard', description: 'High-level real-time operational and platform KPIs' },
      { name: 'Admin Operations', description: 'Real-time order tracking, rider reassignment, delivery PIN regeneration, incidents, disputes, and operational analytics' },
      { name: 'Admin Finance', description: 'Financial transactions, ledger entries, wallet management, maker-checker adjustments, refund queue, payout batches, reconciliation, and revenue analytics' },
    ],
    paths: {
      '/auth/login': {
        post: {
          summary: 'Admin Login Step 1 (Password validation)',
          description: 'Validates staff email and password. Returns an MFA challenge token required for Step 2.',
          tags: ['Admin Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email', example: 'superadmin@avatar.com' },
                    password: { type: 'string', example: 'SuperAdmin@Avatar2026!' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Credentials valid, MFA challenge issued',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          mfaRequired: { type: 'boolean', example: true },
                          mfaToken: { type: 'string', description: 'Short-lived challenge token' },
                          mfaEnabled: { type: 'boolean', example: false },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Invalid credentials' },
            '403': { description: 'Account deactivated' },
          },
        },
      },
      '/auth/mfa/verify': {
        post: {
          summary: 'Admin Login Step 2 (TOTP Verification & Session Issuance)',
          description: 'Verifies 6-digit TOTP code and issues 15-minute access token and rotating 7-day refresh token in httpOnly cookies.',
          tags: ['Admin Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['mfaToken', 'totp'],
                  properties: {
                    mfaToken: { type: 'string', description: 'Challenge token from Step 1' },
                    totp: { type: 'string', example: '123456', minLength: 6, maxLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successfully authenticated',
              headers: {
                'Set-Cookie': {
                  description: 'adminAccessToken and adminRefreshToken cookies',
                  schema: { type: 'string' },
                },
              },
            },
            '401': { description: 'Invalid or expired TOTP / MFA token' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          summary: 'Rotate Refresh Token',
          description: 'Rotates the refresh token and issues a new access token. If reuse is detected, revokes the entire session family.',
          tags: ['Admin Auth'],
          parameters: [
            { in: 'header', name: 'x-refresh-token', schema: { type: 'string' }, description: 'Optional header if not using cookie' },
          ],
          responses: {
            '200': { description: 'Token rotated successfully' },
            '401': { description: 'Invalid, expired, or reused token' },
          },
        },
      },
      '/auth/logout': {
        post: {
          summary: 'Logout Admin',
          description: 'Revokes the active admin session and clears cookies.',
          tags: ['Admin Auth'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          responses: {
            '200': { description: 'Logged out successfully' },
          },
        },
      },
      '/auth/me': {
        get: {
          summary: 'Get Authenticated Admin Profile & Permission Matrix',
          description: 'Returns profile details and the complete array of permissions assigned to this admin role for dynamic UI rendering.',
          tags: ['Admin Auth'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          responses: {
            '200': {
              description: 'Admin profile with permissions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        allOf: [
                          { $ref: '#/components/schemas/AdminUser' },
                          {
                            type: 'object',
                            properties: {
                              permissions: {
                                type: 'array',
                                items: { type: 'string' },
                                example: ['users:read', 'users:manage', 'admins:manage', 'settings:write'],
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthenticated' },
          },
        },
      },
      '/auth/sessions': {
        get: {
          summary: 'List Active Admin Sessions',
          tags: ['Admin Auth'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          responses: {
            '200': { description: 'List of active sessions' },
          },
        },
      },
      '/auth/sessions/{sessionId}': {
        delete: {
          summary: 'Revoke Specific Session',
          tags: ['Admin Auth'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'sessionId', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Session revoked' },
            '404': { description: 'Session not found' },
          },
        },
      },
      '/auth/password/reset-request': {
        post: {
          summary: 'Request Admin Password Reset',
          tags: ['Admin Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
              },
            },
          },
          responses: {
            '200': { description: 'Reset link dispatched' },
          },
        },
      },
      '/auth/password/reset': {
        post: {
          summary: 'Complete Admin Password Reset',
          tags: ['Admin Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'newPassword'],
                  properties: {
                    token: { type: 'string' },
                    newPassword: { type: 'string', minLength: 12 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Password reset completed' },
            '400': { description: 'Invalid or expired token' },
          },
        },
      },
      '/dashboard': {
        get: {
          summary: 'Get Platform KPIs & Overview Metrics',
          tags: ['Admin Dashboard'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          responses: {
            '200': {
              description: 'Dashboard aggregated counts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          ordersToday: { type: 'integer', example: 42 },
                          activeRiders: { type: 'integer', example: 18 },
                          pendingVerifications: { type: 'integer', example: 5 },
                          newSignupsToday: { type: 'integer', example: 64 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '403': { description: 'Forbidden - requires analytics:read' },
          },
        },
      },
      '/admins': {
        get: {
          summary: 'List Admin & Staff Accounts',
          tags: ['Admin Staff Management'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          responses: {
            '200': {
              description: 'List of admin users',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
                    },
                  },
                },
              },
            },
            '403': { description: 'Forbidden - requires admins:manage' },
          },
        },
      },
      '/admins/invitations': {
        post: {
          summary: 'Invite Staff Member',
          description: 'Generates an invitation token (48h expiry) and dispatches an invitation link.',
          tags: ['Admin Staff Management'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'name', 'role'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    name: { type: 'string' },
                    role: {
                      type: 'string',
                      enum: ['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'MODERATION_ADMIN'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Invitation sent' },
            '409': { description: 'Admin email already exists' },
          },
        },
      },
      '/admins/{id}/role': {
        patch: {
          summary: 'Request Admin Role Change (Maker-Checker)',
          description: 'Creates a pending approval request. Demoting the last active Super Admin is prohibited.',
          tags: ['Admin Staff Management'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['role', 'reason'],
                  properties: {
                    role: { type: 'string', enum: ['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'MODERATION_ADMIN'] },
                    reason: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            '202': { description: 'Role change request submitted for checker approval' },
            '409': { description: 'Cannot demote the last Super Admin' },
            '422': { description: 'Cannot change your own role' },
          },
        },
      },
      '/admins/{id}/deactivate': {
        post: {
          summary: 'Request Admin Deactivation (Maker-Checker)',
          description: 'Creates a pending deactivation approval request. Deactivating the last active Super Admin is prohibited.',
          tags: ['Admin Staff Management'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '202': { description: 'Deactivation request submitted for checker approval' },
            '409': { description: 'Cannot deactivate the last Super Admin' },
            '422': { description: 'Cannot deactivate yourself' },
          },
        },
      },
      '/admins/{id}/reset-mfa': {
        post: {
          summary: 'Force MFA Reset for Staff Member',
          tags: ['Admin Staff Management'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'MFA reset; user must re-enroll on next login' },
          },
        },
      },
      '/approvals': {
        get: {
          summary: 'List Pending Approval Requests',
          description: 'Super Admin sees all requests across platform; other staff see requests they initiated.',
          tags: ['Admin Approvals'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          responses: {
            '200': {
              description: 'Pending approvals',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { type: 'array', items: { $ref: '#/components/schemas/ApprovalRequest' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/approvals/{id}/decide': {
        post: {
          summary: 'Decide on Approval Request (Maker-Checker Enforcement)',
          description: 'Approves or rejects a request. The checker must differ from the maker who created the request.',
          tags: ['Admin Approvals'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['decision', 'reason'],
                  properties: {
                    decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
                    reason: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Approval decision recorded and executed' },
            '409': { description: 'Request is already decided' },
            '422': { description: 'Maker cannot approve their own request' },
          },
        },
      },
      '/users': {
        get: {
          summary: 'List / Search Platform Users',
          description: 'Filters users by query, status, and role. Phone and email are automatically masked for Support and Moderation admins.',
          tags: ['Admin Users'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Search name, email, phone' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['active', 'inactive'] } },
            { in: 'query', name: 'role', schema: { type: 'string', enum: ['CUSTOMER', 'BUSINESS', 'RIDER', 'ADMIN'] } },
            { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Paginated user list' },
          },
        },
      },
      '/users/{id}': {
        get: {
          summary: 'Get Detailed User Profile',
          tags: ['Admin Users'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'User profile with order, wallet, and business/rider links' },
            '404': { description: 'User not found' },
          },
        },
        delete: {
          summary: 'Soft-Delete User (Super Admin only)',
          description: 'Anonymises personal data and deactivates account while retaining ledger and transaction integrity for legal retention.',
          tags: ['Admin Users'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'User soft-deleted' },
            '403': { description: 'Forbidden - requires users:delete' },
          },
        },
      },
      '/users/{id}/suspend': {
        post: {
          summary: 'Suspend User Account',
          tags: ['Admin Users'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: {
                    reason: { type: 'string', minLength: 10 },
                    until: { type: 'string', format: 'date-time', description: 'Optional end date for temporary suspension' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'User suspended' },
          },
        },
      },
      '/users/{id}/reactivate': {
        post: {
          summary: 'Reactivate Suspended User Account',
          tags: ['Admin Users'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'User reactivated' },
          },
        },
      },
      '/users/{id}/force-logout': {
        post: {
          summary: 'Force Logout Platform User',
          tags: ['Admin Users'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'User sessions invalidated' },
          },
        },
      },
      '/businesses': {
        get: {
          summary: 'List Businesses',
          tags: ['Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'q', schema: { type: 'string' } },
            { in: 'query', name: 'verificationStatus', schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] } },
            { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'List of businesses' },
          },
        },
      },
      '/businesses/{id}': {
        get: {
          summary: 'Get Business Details & Verification Profile',
          tags: ['Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Business details' },
          },
        },
      },
      '/businesses/{id}/approve': {
        post: {
          summary: 'Approve Business Onboarding / KYC',
          tags: ['Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Business approved' },
          },
        },
      },
      '/businesses/{id}/reject': {
        post: {
          summary: 'Reject Business Onboarding',
          tags: ['Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Business rejected' },
          },
        },
      },
      '/businesses/{id}/suspend': {
        post: {
          summary: 'Suspend Business',
          tags: ['Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: {
                    reason: { type: 'string', minLength: 10 },
                    permanent: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Business suspended' },
          },
        },
      },
      '/businesses/{id}/reactivate': {
        post: {
          summary: 'Reactivate Business',
          tags: ['Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Business reactivated' },
          },
        },
      },
      '/riders': {
        get: {
          summary: 'List Riders',
          tags: ['Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'q', schema: { type: 'string' } },
            { in: 'query', name: 'onlineStatus', schema: { type: 'string', enum: ['ONLINE', 'OFFLINE'] } },
            { in: 'query', name: 'verificationStatus', schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] } },
            { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'List of riders' },
          },
        },
      },
      '/riders/{id}': {
        get: {
          summary: 'Get Rider Profile & Performance History',
          tags: ['Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Rider details' },
          },
        },
      },
      '/riders/{id}/approve': {
        post: {
          summary: 'Approve Rider KYC',
          tags: ['Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Rider KYC approved' },
          },
        },
      },
      '/riders/{id}/reject': {
        post: {
          summary: 'Reject Rider KYC',
          tags: ['Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Rider KYC rejected' },
          },
        },
      },
      '/riders/{id}/suspend': {
        post: {
          summary: 'Suspend Rider Account',
          tags: ['Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: {
                    reason: { type: 'string', minLength: 10 },
                    permanent: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Rider suspended' },
          },
        },
      },
      '/riders/{id}/reactivate': {
        post: {
          summary: 'Reactivate Rider Account',
          tags: ['Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Rider reactivated' },
          },
        },
      },
      '/orders': {
        get: {
          summary: 'List Orders',
          tags: ['Admin Orders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'businessId', schema: { type: 'string' } },
            { in: 'query', name: 'riderId', schema: { type: 'string' } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Orders list with cursor pagination' },
          },
        },
      },
      '/orders/{id}': {
        get: {
          summary: 'Get Order Detail & Full Audit Timeline',
          tags: ['Admin Orders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Order details' },
          },
        },
      },
      '/orders/{id}/cancel': {
        post: {
          summary: 'Cancel Order',
          description: 'Cancels order before pickup. Operations admin cannot cancel orders past pickup time.',
          tags: ['Admin Orders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Order cancelled' },
            '422': { description: 'Order already picked up' },
          },
        },
      },
      '/orders/{id}/override-status': {
        post: {
          summary: 'Override Order Status (Super Admin Only)',
          description: 'Force-updates order status with mandatory reason and immutable audit log entry.',
          tags: ['Admin Orders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status', 'reason'],
                  properties: {
                    status: {
                      type: 'string',
                      enum: [
                        'PENDING_PAYMENT',
                        'PAID',
                        'ACCEPTED',
                        'PREPARING',
                        'READY_FOR_PICKUP',
                        'OUT_FOR_DELIVERY',
                        'DELIVERED',
                        'CANCELLED',
                      ],
                    },
                    reason: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Order status overridden' },
            '403': { description: 'Forbidden - requires orders:override' },
          },
        },
      },
      '/orders/stream': {
        get: {
          summary: 'Live Orders Stream (SSE)',
          description: 'Server-Sent Events connection streaming real-time order board updates with 15-second heartbeat/polling fallback.',
          tags: ['Admin Operations', 'Admin Orders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'zone', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'text/event-stream order stream' },
          },
        },
      },
      '/orders/{id}/reassign': {
        post: {
          summary: 'Atomic Rider Reassignment (OP-03)',
          description: 'Reassigns order by releasing the current claim and assigning a named rider or returning to the pool. Atomic locking prevents race conditions.',
          tags: ['Admin Operations', 'Admin Orders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: {
                    riderId: { type: 'string', format: 'uuid' },
                    pool: { type: 'boolean', default: false },
                    reason: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Rider reassigned' },
            '409': { description: 'Conflict - concurrent reassignment or lock active' },
            '422': { description: 'Order status does not permit reassignment' },
          },
        },
      },
      '/orders/{id}/pin/regenerate': {
        post: {
          summary: 'Regenerate Delivery PIN (OP-03)',
          description: 'Generates a new 6-digit delivery PIN. Max 3 per order. Only active during transit/pickup. PIN is returned to admin to relay but never stored in plaintext.',
          tags: ['Admin Operations', 'Admin Orders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'New delivery PIN issued' },
            '422': { description: 'Max regenerations exceeded or invalid order state' },
          },
        },
      },
      '/ops/riders': {
        get: {
          summary: 'Operations Rider Roster (OP-04)',
          description: 'Query riders with active claims count, online state, and operational filters.',
          tags: ['Admin Operations', 'Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'online', schema: { type: 'boolean' } },
            { in: 'query', name: 'zone', schema: { type: 'string' } },
            { in: 'query', name: 'verificationStatus', schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Roster of riders' },
          },
        },
      },
      '/ops/riders/{id}/documents/{documentId}/approve': {
        post: {
          summary: 'Approve Rider Verification Document (OP-04)',
          tags: ['Admin Operations', 'Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
            { in: 'path', name: 'documentId', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Document approved' },
          },
        },
      },
      '/ops/riders/{id}/documents/{documentId}/reject': {
        post: {
          summary: 'Reject Rider Verification Document (OP-04)',
          tags: ['Admin Operations', 'Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
            { in: 'path', name: 'documentId', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Document rejected' },
          },
        },
      },
      '/ops/riders/{id}/suspend': {
        post: {
          summary: 'Temporarily Suspend Rider (OP-04)',
          description: 'Time-boxed suspension within configured maximum limit. Blocks if rider holds active deliveries.',
          tags: ['Admin Operations', 'Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason', 'until'],
                  properties: {
                    reason: { type: 'string', minLength: 10 },
                    until: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Rider suspended temporarily' },
            '422': { description: 'Active orders must be reassigned first or suspension exceeds limit' },
          },
        },
      },
      '/ops/riders/{id}/request-permanent-suspension': {
        post: {
          summary: 'Request Permanent Rider Suspension (Maker-Checker OP-04)',
          tags: ['Admin Operations', 'Admin Riders'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '202': { description: 'Permanent suspension approval request created' },
          },
        },
      },
      '/ops/businesses/{id}/status': {
        patch: {
          summary: 'Set Business Operational Status (OP-05)',
          description: 'Open, close, or pause business. Tagged "changed by platform" in business portal.',
          tags: ['Admin Operations', 'Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['OPEN', 'CLOSED', 'PAUSED'] },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Status updated' },
          },
        },
      },
      '/ops/businesses/{id}/products/{productId}/availability': {
        patch: {
          summary: 'Pause/Resume Product Menu Item (OP-05)',
          tags: ['Admin Operations', 'Admin Businesses'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
            { in: 'path', name: 'productId', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['isAvailable'],
                  properties: {
                    isAvailable: { type: 'boolean' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Product availability changed' },
          },
        },
      },
      '/lookup': {
        get: {
          summary: 'Unified Customer, Business, and Rider Search (OP-06, SP-03)',
          description: 'Cross-entity global search. PII masked according to caller role.',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'q', required: true, schema: { type: 'string', minLength: 2 } },
          ],
          responses: {
            '200': { description: 'Unified search results' },
          },
        },
      },
      '/users/{id}/notify': {
        post: {
          summary: 'Send Targeted In-App Notification (OP-06)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['templateKey', 'message'],
                  properties: {
                    templateKey: { type: 'string' },
                    orderId: { type: 'string', format: 'uuid' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Notification sent' },
          },
        },
      },
      '/incidents': {
        get: {
          summary: 'List Operational Incidents (OP-07)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['OPEN', 'ASSIGNED', 'RESOLVED'] } },
            { in: 'query', name: 'type', schema: { type: 'string' } },
            { in: 'query', name: 'orderId', schema: { type: 'string' } },
            { in: 'query', name: 'riderId', schema: { type: 'string' } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Incidents list' },
          },
        },
        post: {
          summary: 'Log Operational Incident (OP-07)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type', 'description'],
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['LATE_DELIVERY', 'FAILED_DELIVERY', 'RIDER_NO_SHOW', 'ACCIDENT', 'ITEM_MISSING', 'SUSPECTED_FRAUD'],
                    },
                    description: { type: 'string', minLength: 10 },
                    orderId: { type: 'string', format: 'uuid' },
                    riderId: { type: 'string', format: 'uuid' },
                    businessId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Incident logged' },
          },
        },
      },
      '/incidents/{id}': {
        get: {
          summary: 'Get Incident Details (OP-07)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Incident details' },
          },
        },
        patch: {
          summary: 'Assign / Resolve Incident (OP-07)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ownerId: { type: 'string', format: 'uuid' },
                    notes: { type: 'string' },
                    status: { type: 'string', enum: ['OPEN', 'ASSIGNED', 'RESOLVED'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Incident updated' },
          },
        },
      },
      '/disputes': {
        get: {
          summary: 'List Disputes (OP-07)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED'] } },
            { in: 'query', name: 'orderId', schema: { type: 'string' } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Disputes list' },
          },
        },
        post: {
          summary: 'Open a Dispute (OP-07)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['description'],
                  properties: {
                    description: { type: 'string', minLength: 10 },
                    orderId: { type: 'string', format: 'uuid' },
                    customerId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Dispute opened' },
          },
        },
      },
      '/disputes/{id}': {
        get: {
          summary: 'Get Dispute Details (OP-07)',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Dispute details' },
          },
        },
        patch: {
          summary: 'Resolve / Escalate Dispute (OP-07)',
          description: 'Updates dispute status or assigns owner. If refundAmount is specified, automatically raises a refund approval request in Finance.',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ownerId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED'] },
                    resolution: { type: 'string' },
                    escalateTo: { type: 'string' },
                    refundAmount: { type: 'number', minimum: 1 },
                    refundReason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Dispute updated' },
          },
        },
      },
      '/analytics/operations': {
        get: {
          summary: 'Operational Analytics (OP-08)',
          description: 'Delivery turnaround, avg claim/delivery times, rider utilisation %, cancellation by reason, and zone distribution.',
          tags: ['Admin Operations'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
            { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': { description: 'Operational KPI analytics' },
          },
        },
      },
      '/transactions': {
        get: {
          summary: 'Transaction Explorer (FN-01)',
          description: 'Search payment transactions and attached ledger entries with filters.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'reference', schema: { type: 'string' } },
            { in: 'query', name: 'orderId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'userId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'minAmount', schema: { type: 'number' } },
            { in: 'query', name: 'maxAmount', schema: { type: 'number' } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Transactions list with ledger entries' },
          },
        },
      },
      '/transactions/{id}': {
        get: {
          summary: 'Get Transaction Details & Linked Ledger (FN-01)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Transaction details' },
            '404': { description: 'Transaction not found' },
          },
        },
      },
      '/wallets/{id}': {
        get: {
          summary: 'Get Wallet Balance & Status (FN-02)',
          description: 'Derived balance from immutable ledger. Support role receives safe summary view.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Wallet balance details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Wallet' } } } },
            '404': { description: 'Wallet not found' },
          },
        },
      },
      '/wallets/{id}/ledger': {
        get: {
          summary: 'View Full Immutable Wallet Ledger (FN-02)',
          description: 'Chronological double-entry ledger. Forbidden for Support Admin.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Wallet ledger entries' },
            '403': { description: 'Forbidden for Support role' },
          },
        },
      },
      '/wallets/{id}/freeze': {
        post: {
          summary: 'Freeze Wallet (FN-02)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Wallet frozen' },
            '409': { description: 'Wallet is already frozen' },
          },
        },
      },
      '/wallets/{id}/unfreeze': {
        post: {
          summary: 'Unfreeze Wallet (FN-02)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Wallet restored to active' },
            '409': { description: 'Wallet is not frozen' },
          },
        },
      },
      '/wallets/adjustments': {
        post: {
          summary: 'Request Wallet Credit/Debit Adjustment (Maker-Checker FN-08)',
          description: 'Requires Super Admin approval before ledger entry posts.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletId', 'direction', 'amount', 'reason', 'idempotencyKey'],
                  properties: {
                    walletId: { type: 'string', format: 'uuid' },
                    direction: { type: 'string', enum: ['CREDIT', 'DEBIT'] },
                    amount: { type: 'number', minimum: 1 },
                    reason: { type: 'string', minLength: 10 },
                    reference: { type: 'string' },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '202': { description: 'Adjustment request submitted for Super Admin review' },
          },
        },
      },
      '/refunds': {
        get: {
          summary: 'Refund Queue (FN-05)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED'] } },
            { in: 'query', name: 'orderId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Refund queue list' },
          },
        },
        post: {
          summary: 'Raise Refund Request (FN-05)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['orderId', 'amount', 'reason'],
                  properties: {
                    orderId: { type: 'string', format: 'uuid' },
                    amount: { type: 'number', minimum: 1 },
                    reason: { type: 'string', minLength: 10 },
                    destination: { type: 'string', enum: ['WALLET', 'ORIGINAL_PAYMENT'], default: 'WALLET' },
                    evidence: { type: 'string' },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Refund request created' },
            '422': { description: 'Refund exceeds maximum eligible order balance' },
          },
        },
      },
      '/refunds/{id}': {
        get: {
          summary: 'Get Refund Detail (FN-05)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Refund record' },
          },
        },
      },
      '/refunds/{id}/approve': {
        post: {
          summary: 'Approve Refund (Maker-Checker FN-05)',
          description: 'Approver must differ from requester. If above threshold, Super Admin approval required.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    amount: { type: 'number', minimum: 1 },
                    decisionReason: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Refund approved and wallet credited' },
            '422': { description: 'Maker-checker violation: cannot approve own request' },
            '403': { description: 'Exceeds threshold, requires Super Admin' },
          },
        },
      },
      '/refunds/{id}/reject': {
        post: {
          summary: 'Reject Refund (FN-05)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Refund rejected' },
          },
        },
      },
      '/payouts': {
        get: {
          summary: 'List Payout Lines (FN-04)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'batchId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED', 'EXCLUDED'] } },
            { in: 'query', name: 'recipientType', schema: { type: 'string', enum: ['BUSINESS', 'RIDER'] } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Payout lines' },
          },
        },
      },
      '/payouts/batches': {
        post: {
          summary: 'Generate Payout Batch (FN-04)',
          description: 'Builds batch from eligible delivered undisputed orders for merchants & riders.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['periodStart', 'periodEnd'],
                  properties: {
                    periodStart: { type: 'string', format: 'date-time' },
                    periodEnd: { type: 'string', format: 'date-time' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Payout batch created' },
          },
        },
      },
      '/payouts/batches/{id}': {
        get: {
          summary: 'Get Payout Batch Detail (FN-04)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Batch details with line items' },
          },
        },
      },
      '/payouts/batches/{id}/approve': {
        post: {
          summary: 'Approve Payout Batch Above Threshold (Super Admin FN-04)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Batch approved for submission' },
          },
        },
      },
      '/payouts/batches/{id}/submit': {
        post: {
          summary: 'Submit Payout Batch to Gateway (FN-04)',
          description: 'Idempotent per-line submission to Paystack transfer service.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Batch submitted' },
          },
        },
      },
      '/payouts/{id}/retry': {
        post: {
          summary: 'Retry Failed Payout Line (FN-04)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Line re-queued for submission' },
          },
        },
      },
      '/reconciliation/runs': {
        get: {
          summary: 'Reconciliation Run History (FN-06)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Reconciliation runs' },
          },
        },
        post: {
          summary: 'Trigger Daily Reconciliation Run (FN-06)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['periodStart', 'periodEnd'],
                  properties: {
                    periodStart: { type: 'string', format: 'date-time' },
                    periodEnd: { type: 'string', format: 'date-time' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Reconciliation run completed with flagged discrepancies' },
          },
        },
      },
      '/reconciliation/runs/{id}': {
        get: {
          summary: 'Get Reconciliation Run Detail (FN-06)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Reconciliation run details with flags' },
          },
        },
      },
      '/reconciliation/flags/{id}/resolve': {
        post: {
          summary: 'Resolve Reconciliation Discrepancy (FN-06)',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['note'],
                  properties: { note: { type: 'string', minLength: 10 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Discrepancy flag resolved' },
          },
        },
      },
      '/analytics/finance': {
        get: {
          summary: 'Finance Revenue Dashboard (FN-03)',
          description: 'Gross order value, commissions, delivery fees, refunds, and wallet liabilities.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
            { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': { description: 'Financial overview' },
          },
        },
      },
      '/exports/finance': {
        post: {
          summary: 'Export Financial Reports (FN-07)',
          description: 'Settlement, commissions, payouts, refunds, and tax summaries in CSV/XLSX/PDF.',
          tags: ['Admin Finance'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type'],
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['DAILY_SETTLEMENT', 'COMMISSIONS', 'PAYOUTS', 'REFUNDS', 'WALLET_LIABILITIES'],
                    },
                    format: { type: 'string', enum: ['CSV', 'XLSX', 'PDF'], default: 'CSV' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Export job initiated' },
          },
        },
      },
      '/settings': {
        get: {
          summary: 'List Platform Settings (Super Admin Only)',
          tags: ['Admin Platform Settings'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          responses: {
            '200': {
              description: 'List of platform settings',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { type: 'array', items: { $ref: '#/components/schemas/PlatformSetting' } },
                    },
                  },
                },
              },
            },
            '403': { description: 'Forbidden - requires settings:read' },
          },
        },
      },
      '/settings/{key}': {
        get: {
          summary: 'Get Platform Setting by Key',
          tags: ['Admin Platform Settings'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Setting value' },
            '404': { description: 'Setting not found' },
          },
        },
        put: {
          summary: 'Update Platform Setting (Super Admin Only)',
          description: 'Updates configuration key with schema validation and records audit log.',
          tags: ['Admin Platform Settings'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['value', 'reason'],
                  properties: {
                    value: { type: 'string', minLength: 1 },
                    reason: { type: 'string', minLength: 10 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Setting updated' },
            '400': { description: 'Unrecognised setting key' },
            '403': { description: 'Forbidden - requires settings:write' },
          },
        },
      },
      '/audit-logs': {
        get: {
          summary: 'Query Audit Logs',
          description: 'Search append-only audit trail. Super Admin sees all logs; other roles see only their own actions.',
          tags: ['Admin Audit Logs'],
          security: [{ adminBearerAuth: [] }, { adminCookieAuth: [] }],
          parameters: [
            { in: 'query', name: 'actorId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'action', schema: { type: 'string' } },
            { in: 'query', name: 'entityType', schema: { type: 'string' } },
            { in: 'query', name: 'entityId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'requestId', schema: { type: 'string' } },
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': {
              description: 'Audit logs',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          logs: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                          meta: { type: 'object' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '403': { description: 'Forbidden - requires audit:read' },
          },
        },
      },
    },
  },
  apis: ['./src/modules/admin/*.routes.ts'],
};

export const adminSwaggerSpec = swaggerJSDoc(adminSwaggerOptions);

/**
 * Setup Admin-specific Swagger documentation.
 * Serves UI at both `/api-docs/admin` and `/api/v1/admin/docs`.
 */
export const setupAdminSwagger = (app: Application) => {
  const customCss = `
    .swagger-ui .topbar { background-color: #0b2545; }
    .swagger-ui .topbar .topbar-wrapper .link { content: url('https://placeholder.svg'); }
    .swagger-ui .info .title { color: #0b2545; }
  `;

  const uiOptions = {
    customCss,
    customSiteTitle: 'AVATAR Admin Console API Docs',
  };

  app.use('/api-docs/admin', swaggerUi.serveFiles(adminSwaggerSpec, uiOptions), swaggerUi.setup(adminSwaggerSpec, uiOptions));
  app.use('/api/v1/admin/docs', swaggerUi.serveFiles(adminSwaggerSpec, uiOptions), swaggerUi.setup(adminSwaggerSpec, uiOptions));
  app.get('/api/v1/admin/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(adminSwaggerSpec);
  });
};
