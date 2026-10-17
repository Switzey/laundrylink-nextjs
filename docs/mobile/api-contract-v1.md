# LaundryLink — Draft Mobile API v1 Contract

**Base:** `https://<staging-host>/api/v1` during development. Version every public mobile contract independently from the web UI. These endpoints are **proposed** and must be implemented; existing `/api/account` or Server Actions do not magically become native APIs.

## Conventions

- HTTPS only; JSON with request `Content-Type: application/json` and `Accept: application/json`.
- Protected requests use `Authorization: Bearer <access-token>` once the mobile session service is implemented. The web client continues using protected HttpOnly cookies. Require consistent RBAC and ownership checks.
- Successful payload shape: `{ "data": ..., "meta": { "requestId": "..." } }`
- Error payload shape: `{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "fields": {}, "requestId": "..." } }`
- Expected HTTP statuses: 200/201/202, 400, 401, 403, 404, 409, 422, 429, 500.
- Require `Idempotency-Key` on order creation, payment initiation, assignment accept and state-changing trip completions.
- Money is returned in integer minor units and `currency: "NGN"` for **new** v1 DTOs. Existing backend data must be translated and verified for consistent units.
- Represent timestamps as ISO 8601 with offsets/UTC; include geographic timezone where local booking dates apply.
- Paginate all list endpoints with bounded cursor or limit. Never leak full user, document, bank or verification records.

## Identity

| Method | Path | Roles | Result |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Create customer or vendor owner; verification may be required |
| POST | `/auth/login` | Public | Create device-scoped session |
| POST | `/auth/refresh` | Device refresh | Rotate refresh token |
| POST | `/auth/logout` | Signed in | Revoke device session |
| POST | `/auth/password/forgot` | Public | Generic confirmation, never user enumeration |
| POST | `/auth/password/reset` | Reset token | Validate one-time token and revoke sessions |
| POST | `/auth/phone/send` | Signed in | Send E.164-bound verification |
| POST | `/auth/phone/verify` | Signed in | Verify phone challenge |
| POST | `/auth/oauth/exchange` | Valid auth code | Backend exchange for approved native provider |
| GET | `/me` | Any authenticated | User identity, verified role, capabilities |
| GET/PATCH | `/me/addresses` | Customer | Saved address management |

## Discovery, quote and booking

| Method | Path | Roles | Result |
| --- | --- | --- | --- |
| GET | `/vendors` | Public | Filter by area, category, eligibility, cursor |
| GET | `/vendors/:id` | Public | Approved/published vendor detail |
| GET | `/vendors/:id/services` | Public | Active service catalogue |
| GET | `/vendors/:id/availability?pickupDate=...` | Public | Bookable slots |
| POST | `/orders/quotes` | Customer | Server-computed line items, fees and expiry |
| POST | `/orders` | Customer | Idempotent order creation after eligibility and quote check |
| GET | `/orders` | Customer / Vendor / Admin | Authorized filtered list |
| GET | `/orders/:id` | Owner / Assigned / Admin | Details and separate statuses |
| GET | `/orders/:id/events` | Authorized | Redacted audit/activity timeline |
| POST | `/orders/:id/reschedule` | Customer | Validated new date/window |
| POST | `/orders/:id/cancel` | Eligible actor | Policy-driven cancellation |
| POST | `/orders/:id/reviews` | Customer | Eligible completed-order review |

Example quote response:
```json
{
  "data": {
    "quoteId": "q_123",
    "currency": "NGN",
    "items": [{ "serviceId": 25, "quantity": 2, "unit": "per_kg", "lineTotalMinor": 300000 }],
    "deliveryFeeMinor": 0,
    "platformFeeMinor": 50000,
    "totalMinor": 350000,
    "expiresAt": "2026-10-17T18:15:00Z",
    "pricingStatus": "estimate"
  }
}
```
Amounts are illustrative, not current LaundryLink prices.

## Vendor

| Method | Path | Roles |
| --- | --- | --- |
| GET/PATCH | `/vendor/profile` | Vendor owner/manager |
| POST | `/vendor/onboarding/submit` | Vendor owner |
| POST | `/vendor/files` | Authorized vendor roles |
| GET/POST/PATCH | `/vendor/services` | Authorized vendor roles |
| GET | `/vendor/orders` | Vendor member |
| POST | `/vendor/orders/:id/status` | Vendor member per permission |
| GET | `/vendor/earnings` | Vendor owner/manager |

## Rider & logistics

| Method | Path | Roles |
| --- | --- | --- |
| POST | `/rider/apply` | Eligible account |
| GET/PATCH | `/rider/profile` | Rider |
| POST | `/rider/availability` | Verified Rider |
| GET | `/rider/offers` | Available Rider |
| POST | `/rider/offers/:id/accept` | Available Rider |
| GET | `/rider/trips` | Rider |
| POST | `/rider/trips/:id/pickup` | Assigned rider |
| POST | `/rider/trips/:id/handover` | Assigned rider |
| GET | `/rider/earnings` | Rider |
| GET | `/rider/payouts` | Rider |

Customer may observe redacted trip status, never another rider's precise location or personal documents.

## Payments and admin

| Method | Path | Roles |
| --- | --- | --- |
| POST | `/payments/initialize` | Customer |
| GET | `/payments/:reference` | Payment owner/admin |
| POST | `/webhooks/paystack` | Provider-signed webhook (not bearer auth) |
| GET | `/admin/verifications` | Admin |
| POST | `/admin/verifications/:id/decision` | Authorized admin |
| GET | `/admin/dispatch` | Operations/admin |
| POST | `/admin/dispatch/:id/assign` | Operations/admin |
| GET | `/admin/finance/ledger` | Finance/admin |
| GET/POST | `/support/tickets` | Authenticated with ownership |

On payment webhook: validate authenticity against raw body; dedupe provider event reference, verify amount/currency/recipient, atomically settle internal state, then publish events from an outbox. Do not treat client checkout success as proof of payment.

## Implementation contract gate

Before claiming any v1 endpoint works: add Zod request and response schemas, verify role/ownership, add success and negative-path tests, document pagination and error codes, measure rate limits, and check mobile staging against real backend behavior.
