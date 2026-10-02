# AVATAR Backend — Milestones

Node.js + Express + TypeScript. Sequenced by dependency, not dates.

## Phase 0 — Foundations
- [x] Project scaffolding (Express, TypeScript, ESLint, Prettier, Jest, domain-module folder structure)
- [ ] Docker Compose (Postgres + Redis + API) + GitHub Actions CI / pipeline setup (Lint, Test, Build)
- [x] Database setup (PostgreSQL, Prisma schema generation)
- [x] Core app shell (Global Error Handling Middleware, Pino/Audit Logging, OpenAPI skeleton)
- [x] Security middlewares (Helmet, CORS, Rate Limiting)
- [x] Auth foundation (User model, signup/login, JWT issue/refresh, Cookie Session, OTP Verification, RBAC middleware)

## Phase 1 — MVP Core Marketplace
- [x] 1.1 Auth & profiles (all 4 roles): registration, login, OTP, profile CRUD (Customers, Businesses, Riders), password reset
- [ ] 1.2 Business & product catalog: business profile, categories, products (CRUD, Pricing, Images, Ownership), variants, inventory, image upload, business slug uniqueness
- [ ] 1.3 Discovery & search: list/filter/sort, Postgres full-text search, public SEO endpoints
- [ ] 1.4 Cart & checkout: guest & authenticated cart service, address book, price/fee calculation, order creation transaction, guest to authenticated cart merging, cart cleanup background job
- [ ] 1.5 Order lifecycle: state machine enforcement (created → paid → preparing → rider_accepted → on_the_way → delivered/cancelled), status history, admin force cancellation
- [ ] 1.6 Payments: Paystack gateway integration, webhook handler (idempotent), payment verification, delivery PIN generation (hash storage)
- [ ] 1.7 Wallet & Finance: customer & business wallet, append-only ledger (double-entry logging for commissions), manual-approval withdrawals (limits validation, admin approval flow)
- [ ] 1.8 Rider & Delivery module: auth/profile, online/offline status, available/active deliveries (claimable orders radius filtering), claim atomic transaction, accept/pickup, delivery completion (PIN verification, retry limit), unclaimed orders job
- [ ] 1.9 Order messaging: order-scoped chat, server-enforced 2-message cap, rider auto-join/leave
- [ ] 1.10 Notifications & Settings: in-app records (pull-based list) + push adapter, transactional emails via BullMQ, platform settings management
- [ ] 1.11 Reviews (basic): post-delivery product/business review
- [ ] 1.12 Admin foundations: read-only users/businesses/orders views, dashboard endpoints, verification approve/reject, health/readiness endpoints (`/health`, `/ready`)
- [ ] 1.13 Support channel: separate ticket + chat from order chat
- [ ] 1.14 Storage & Verifications: S3 Storage Integration for Verification Documents/Images (Business & Rider ID/Selfies), file upload validation (MIME, size, auth)

**MVP done when:** a customer can discover a product, pay for it, the business fulfills it, a rider delivers it with live status + chat, both wallets update, and admin can see and moderate the whole flow.

## Phase 2 — Social Commerce & Growth Loops
- [ ] Feed & Stories (business-only posting, like/comment/share/save, shoppable posts)
- [ ] Rewards & referrals (point accrual, referral codes/links, reward ledger)
- [ ] Coupons & promotions
- [ ] Wishlist
- [ ] Personalization (popular near you, recently viewed)

## Phase 3 — Business & Admin Depth
- [ ] Full Store Management (open/closed, holiday mode, hours, delivery radius, min order, scheduled orders)
- [ ] Verification depth (ID, store, location workflows with document review)
- [ ] Business staff & roles (scoped permissions)
- [ ] Admin depth (reports, security review, payments oversight, full 2FA)

## Phase 4 — AVATAR AI & V2 Groundwork
- [ ] AVATAR AI endpoints (AI-assisted discovery and support)
- [ ] Business analytics/insights
- [ ] Live-streaming groundwork (data-model/API extensibility only — live streaming itself is V2)
