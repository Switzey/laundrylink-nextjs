# LaundryLink Mobile Development — Acceptance Checklist

## Sprint 0: baseline and environments

- [ ] Confirm Vercel production branch and deployed SHA; compare to reviewed GitHub main.
- [ ] Preserve current web workflows; document rollback and back up hosted Turso database.
- [ ] Verify staging database, separate credentials and email/SMS/payment sandboxes.
- [ ] Run `npm ci`, `npm run check`, migration compatibility and read-only readiness checks with proper local secrets (never print them).
- [ ] Review existing documented production QA findings and run a new non-destructive staging smoke test.

## Sprint 1: Expo foundation

- [ ] Run `node scripts/bootstrap-expo-mobile.mjs` with Node LTS compatible with selected SDK.
- [ ] Set `app.json` app name, native scheme, Android/iOS identifiers, splash/icons and approved LaundryLink wordmark.
- [ ] Add typed theme tokens: blue #2563EB, light blue #60A5FA, teal #14B8A6, mint #A7F3D0; separate accessible text colors.
- [ ] Establish Expo Router auth/customer/vendor/rider groups; gate navigation by server-provided role.
- [ ] Add `EXPO_PUBLIC_API_BASE_URL` to a local example file with a **staging-only** value.
- [ ] Implement typed JSON API client, request timeout, 401 handling, idempotency headers, retry only safe reads, and error mapping.
- [ ] Add a staging-only demo shell that launches on Android and iOS without reaching production.

## Sprint 2: native identity and mobile API

- [ ] Extract auth logic into services shared by browser actions and JSON routes.
- [ ] Implement opaque mobile session/refresh rotation, hashed DB values, SecureStore, revocation and provider redirects.
- [ ] Build sign-in, registration, verification, reset-password, account, sign-out and 401-expiry flows.
- [ ] Test disabled email/SMS integrations and offline/network failures; no secret in Expo bundle.
- [ ] Validate actual password policy: existing server requires strong passwords (see `src/lib/validation-fields.ts`), even if UI mockups show other text.

## Sprint 3: customer booking

- [ ] Marketplace list, vendor detail, services, availability, address management.
- [ ] Extract pricing and order service; server quote, order idempotency, booking reserve/expiry.
- [ ] Order list/detail, activity timeline, reschedule/cancel and reviews.
- [ ] Integrate staging backend tests and validate parity with web customer flows.

## Sprint 4: vendor and rider

- [ ] Vendor identity, onboarding, documents, verification, services, orders, earnings.
- [ ] Model independent riders and verified onboarding.
- [ ] Dispatch offer/accept, assignment expiry, pickup/delivery proof and handover.
- [ ] Confirm no unassigned rider can update a trip or read another user's private data.

## Sprint 5: money and production-readiness

- [ ] Paystack provider-compliant collection, secure webhooks, refund paths, idempotency and ledger reconciliation.
- [ ] Rider/vendor payout process with reviewable immutable accounting.
- [ ] Durable notification and dispatch jobs; observability, load and resilience tests.
- [ ] Device QA, WCAG/accessibility audit, Android/iOS beta distribution.
- [ ] Production deploy only after approval, migration gates, QA sign-off and rollback verification.
