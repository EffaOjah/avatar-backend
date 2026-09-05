# AVATAR Backend Milestones

## Milestone 1: Foundation & Project Setup
- [x] Project scaffolding (Express, TypeScript, ESLint, Prettier, Jest)
- [x] Database setup (PostgreSQL, Prisma schema generation)
- [x] Global Error Handling Middleware
- [x] Global Logging & Audit Logger setup
- [x] Security middlewares (Helmet, CORS, Rate Limiting)
- [x] CI/CD pipeline setup (Lint, Test, Build)
- [x] OpenAPI (Swagger) foundation

## Milestone 2: Authentication & User Management
- [x] JWT & Cookie Session Management
- [x] Customer, Business, Rider, Admin Registration & Login
- [x] OTP Verification Flow
- [x] Session validation & Token refresh
- [x] Role-based Authorization Middleware
- [x] User Profile Management (Customers, Businesses, Riders)
- [ ] Business Slug generation & uniqueness enforcement
- [ ] Rider online/offline status & location tracking

## Milestone 3: Core Commerce & Cart
- [ ] Product Module (CRUD, Pricing, Images, Ownership)
- [ ] Public SEO endpoints (Server-side rendering support for Businesses & Products)
- [ ] Guest Cart management (add, update, remove items, expire)
- [ ] Authenticated Cart management
- [ ] Guest Cart to Authenticated Cart Merging
- [ ] Cart Cleanup background job (BullMQ/Redis)

## Milestone 4: Orders & Checkout
- [ ] Order Creation Transaction (Validate cart, prices, calculate delivery fee)
- [ ] Order State Machine Enforcement (PENDING_PAYMENT -> PAID -> ACCEPTED -> ...)
- [ ] Order details & history retrieval
- [ ] Force cancellation by Admin

## Milestone 5: Payments
- [ ] Paystack Integration (Initialize Payment)
- [ ] Paystack Webhooks (Idempotent processing)
- [ ] Payment Verification process
- [ ] Delivery PIN generation (Hash storage only)

## Milestone 6: Delivery & Logistics
- [ ] Rider Claim Atomic Transaction (Race condition handling)
- [ ] Claimable Orders radius filtering (using Platform Settings)
- [ ] Order Pickup confirmation
- [ ] Delivery Completion (PIN verification, Retry limit, Fraud flag)
- [ ] Unclaimed Orders background flagging job

## Milestone 7: Finance (Ledger, Wallets, Withdrawals)
- [ ] Ledger Module (Immutable double-entry or credit/debit logs for commissions & earnings)
- [ ] Wallet Module (Balances derived from ledger)
- [ ] Financial flow on Delivery Completion (Atomic commission/earning calculation)
- [ ] Withdrawals (Requests, Limits validation, Admin approval flow)

## Milestone 8: Verifications & Storage
- [ ] S3 Storage Integration for Verification Documents & Images
- [ ] Verification Module (Business & Rider ID/Selfie uploads)
- [ ] Admin Review for Verifications (Approve/Reject)
- [ ] File upload validation (MIME, size, auth)

## Milestone 9: Notifications & Admin Operations
- [ ] Email Integration (Transactional emails via BullMQ)
- [ ] In-app Notifications (Pull-based list for events like Order ready, claimed, etc.)
- [ ] Platform Settings management (Claim radius, fees, etc.)
- [ ] Admin Dashboard Endpoints (Verifications, Orders, Withdrawals, Force Assignment)
- [ ] Health and Readiness checks endpoints (`/health`, `/ready`)
