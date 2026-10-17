# LaundryLink — Target Mobile Architecture

## Decision

**Reuse and evolve the existing modular Next.js monolith.** Do not replace production Turso/libSQL with PostgreSQL solely because the frontend changes. The immediate deliverable is an Expo TypeScript client and a stable `/api/v1` JSON boundary. Retain the deployed Next.js site and web Admin experience.

```text
Customer / Vendor / Rider React Native apps
       | Expo Router, role-aware navigation, SecureStore
       v
HTTPS /api/v1  (Next.js App Router route handlers)
       | authentication (mobile bearer or existing web cookie)
       | Zod validation, RBAC, rate limits, audit logs
       v
Domain services: Identity | Marketplace | Pricing | Booking | Orders
                 Vendor | Dispatch | Payment | Notifications | Support
       |
       +-----> Turso/libSQL transactional persistence (initially)
       +-----> private object storage
       +-----> durable queue / worker
       +-----> Paystack, email, SMS, push, maps provider
       ^
Existing Next.js website + Admin console use the SAME domain services.
```

## Source layout — target, introduced incrementally

```text
laundrylink-nextjs/
├── src/app/                # Existing public web and admin (preserve)
├── src/app/api/v1/         # New versioned mobile JSON interface
├── src/server/services/    # Framework-independent application operations
├── src/server/repositories/# Data access (retains @libsql/client)
├── src/lib/                # Existing validated policies, utilities and DB layer
├── apps/mobile/            # Generated React Native Expo app (Android/iOS)
│   ├── app/                # Expo Router: (auth), (customer), (vendor), (rider)
│   ├── src/api/            # Typed fetch wrapper, DTOs and runtime validation
│   ├── src/features/       # auth, marketplace, orders, vendor, rider
│   ├── src/components/     # LaundryLink reusable native UI
│   ├── src/theme/          # Brand tokens
│   └── assets/             # Approved wordmark assets
├── docs/mobile/            # This architecture and API plan
└── scripts/                # Existing migrations + Expo bootstrap
```

Don't move existing `src/lib` or Server Actions in one risky refactor. For each domain operation: (1) add tests around current behavior, (2) extract a pure service, (3) point existing action to it, (4) expose route handler, (5) integration-test both callers.

## Authentication & authorization

- Maintain existing hashed opaque web sessions and HttpOnly cookies for browser flows.
- Add device session issuance for native clients: short-lived opaque bearer access token (example 15 min) held **in memory**, refresh token stored in `expo-secure-store`, refresh-token rotation and reuse detection, server-side hashed storage, device/session revocation and audit. Exact expiry windows are implementation proposals, not existing behavior.
- Never embed web session cookies or payment/Turso/Twilio secrets in mobile JavaScript.
- All API endpoints enforce role and ownership on the server. Mobile navigation guards improve UX but never authorize data.
- Implement Google/Apple sign-in using supported native PKCE or provider SDKs and a backend code exchange; enforce redirect URI allowlists and verify state/nonce. `expo-auth-session` is an option. Browser-only OAuth paths are not automatically suitable for native deep links.
- Current schema has one role string per user. Introduce multi-role membership only if product rules require a user to switch roles; do not make that migration implicitly.
- Phone verification must bind to the exact E.164 number and invalidate previous bindings when numbers change.

## Data model evolution — additive

Keep `users`, `cleaners`, `services`, `orders`, `order_items`, `payments`, `notifications`, etc.

Proposed *new* entities:
- `mobile_sessions` (user, device, hashed refresh token, token family, expiry, revoked_at)
- `api_idempotency_keys` (actor, endpoint, key, request hash, response reference, expiry)
- `rider_profiles`, `rider_verifications`, `rider_vehicles`, `rider_availability`
- `delivery_jobs` with separate pickup and drop-off legs, offer expiry, status
- `delivery_assignments`, `delivery_events`, `delivery_proofs`
- `financial_ledger_entries`, `vendor_settlements`, `rider_payouts`, `payment_webhook_events`, `refunds`
- `mobile_push_devices`, `notification_outbox`, `support_tickets`

Use foreign keys, uniqueness, status checks and ownership constraints. Store **new ledger amounts as integer kobo**; the existing schema uses legacy numeric amounts, so convert at the service boundary and reconcile before any money migration.

## Distinct state machines

- **Order:** pending → accepted → picked_up → in_cleaning → ready → out_for_delivery → completed (with policy-governed cancellation/rejection).
- **Payment:** pending/unpaid → authorized/paid → settled/refunded/failed, following provider events.
- **Trip:** offered → accepted → en_route → collected → handed_over → completed/cancelled.
- **Payout:** accrued → eligible → processing → paid/failed/reversed.

Do not equate an accepted order with a paid order; do not mark a trip complete without the correct handover proof. All transitions require atomic server-side validation, idempotency and audit trails.

## Infrastructure and release

- **Local:** Next.js + local SQLite; Expo simulator/device calls a local network IP, not `localhost` from the phone.
- **Staging:** Separate Vercel preview + separate Turso staging DB + sandbox email/SMS/payment credentials.
- **Production:** Existing Next.js Vercel deployment + Turso production DB; deploy versioned API additively.
- Use a durable job system for notifications, assignment offer expiry, reconciliations and retry. Do not rely on in-memory jobs in Vercel requests.
- Track errors/metrics by request ID, actor role and correlation IDs; exclude raw documents, tokens and sensitive identity data from logs.

## Release strategy

1. Audit and freeze baseline.
2. Expo app and mock API client.
3. Mobile session API and `GET /api/v1/me`.
4. Marketplace read endpoints.
5. Quotes and booking mutations after service extraction.
6. Vendor onboarding and operations.
7. Independent rider dispatch and trip proof.
8. Verified payments, settlements, push notifications.
9. End-to-end QA and staged launch in a controlled Nigerian service area, then nationwide expansion.
