# LaundryLink Production QA Report

**Target:** `https://www.laundrylink.com.ng`  
**Date:** 2026-10-15  
**Tooling:** Playwright 1.64.1, Chromium, desktop 1440x900, Pixel 7 emulation, axe-core 4.14.0  
**Safety mode:** Read-only and negative-path testing. No payment, order submission, vendor mutation, admin mutation, email delivery, or SMS delivery was triggered.

## Executive summary

The public site rendered successfully on desktop and mobile without horizontal overflow, browser console errors, or uncaught page errors. Public navigation, cleaner profiles, required-field validation, anonymous authentication guards, Google OAuth initiation, security headers, and production-safe 404 behavior were verified with real browser interactions.

Four distinct product/deployment findings were confirmed: the expected health endpoint is absent, Apple sign-in is unavailable, verified-cleaner labels have insufficient contrast, and the cleaner sort control has no accessible name. Authenticated customer, vendor, and administrator workflows remain unverified on production because no dedicated QA credentials are configured; the repository's local demo password was rejected for all three seeded email addresses.

The final automated run executed 58 desktop/mobile checks: 33 passed, 17 were safely skipped, and eight failed. The eight failures represent the four confirmed findings repeated across desktop and mobile. Screenshots, videos, traces, axe details, and an HTML report were retained for failed checks.

## Findings

### QA-001: Live deployment is missing the expected health endpoint

- **Severity:** High
- **Status:** Confirmed
- **Area:** Deployment / observability / API

**Reproduction steps**

1. Open `https://www.laundrylink.com.ng/api/health`.
2. Inspect the HTTP status and response body.

**Expected**

The route implemented at `src/app/api/health/route.ts` returns a successful health response suitable for deployment verification and monitoring.

**Actual**

The live site returns HTTP `404` with the HTML not-found page.

**Suggested fix**

Confirm the Vercel production branch and deployed commit, reconcile production with the reviewed branch, and add an external uptime check for `/api/health`. Do not deploy solely to satisfy this test until the production-branch mismatch is reviewed.

### QA-002: Apple authentication is unavailable

- **Severity:** Medium
- **Status:** Confirmed
- **Area:** Authentication

**Reproduction steps**

1. Open `https://www.laundrylink.com.ng/login`.
2. Select **Continue with Apple**.

**Expected**

The browser reaches Apple's authorization flow or the UI clearly identifies the provider as unavailable before interaction.

**Actual**

The browser returns to `/login?error=Apple+sign-in+is+temporarily+unavailable.`

**Suggested fix**

Configure and validate the Apple service ID, secret, return URL, domain association, and production environment variables. Hide or disable the control with an accessible unavailable state until configuration is complete.

### QA-003: Authenticated production coverage is blocked by missing QA accounts

- **Severity:** Test blocker
- **Status:** Blocked, not a product failure
- **Area:** Test data / environments

**Reproduction steps**

1. Attempt one login each with the repository's local demo identities and local-only demo password.
2. Observe the generic invalid-credentials response.

**Expected**

Dedicated, least-privilege production QA accounts exist for `CUSTOMER`, `VENDOR_OWNER`, and `ADMIN`, with an isolated QA vendor and non-chargeable test services.

**Actual**

The local demo password is rejected for all seeded identities, which is correct for production security. No `E2E_LIVE_*` credentials are configured for safe authenticated testing.

**Impact**

The following production workflows have not been claimed as passing: completed registration and email verification, password-reset delivery and consumption, profile updates, vendor onboarding, authenticated cart and checkout submission, order tracking, vendor dashboard processing, administrator approval, and cross-role authorization after login.

**Suggested fix**

Provision dedicated QA identities and an isolated QA vendor. Store credentials only in local/CI secrets using the documented `E2E_LIVE_*` variables. Route QA email and SMS to sandbox providers, mark services non-chargeable, and ensure production-safe tests cannot submit payments or destructive mutations.

### QA-004: Cleaner sort control has no accessible name

- **Severity:** High
- **Status:** Confirmed on desktop and mobile
- **Area:** Accessibility / cleaner discovery

**Reproduction steps**

1. Open `https://www.laundrylink.com.ng/cleaners`.
2. Inspect the sort `<select>` with a screen reader or run axe-core using WCAG 2 A/AA rules.

**Expected**

The sort control has a persistent programmatic name, such as a visible `<label>` associated through `htmlFor` and `id`.

**Actual**

axe-core reports the critical `select-name` violation. The control at `src/app/cleaners/page.tsx` has no associated label or ARIA name, so assistive-technology users cannot determine its purpose.

**Suggested fix**

Add a visible `Sort cleaners` label associated with the select. Retest keyboard navigation and screen-reader announcement after the change.

### QA-005: Verified-cleaner labels do not meet text contrast requirements

- **Severity:** Medium
- **Status:** Confirmed on desktop and mobile
- **Area:** Accessibility / visual design

**Reproduction steps**

1. Open `https://www.laundrylink.com.ng/`.
2. Inspect the `Verified cleaner` labels in the featured-cleaner cards with axe-core using WCAG 2 A/AA rules.

**Expected**

The 12px label text meets WCAG AA's 4.5:1 contrast threshold against its background.

**Actual**

axe-core reports the serious `color-contrast` violation on both featured-cleaner labels using `text-brand-teal` in `src/components/cleaner-card.tsx`.

**Suggested fix**

Use a darker text token that reaches at least 4.5:1 on white, while retaining the current teal for non-text decoration. Validate the final computed color with axe and a contrast analyzer.

## Verified behavior

| Area | Result | Evidence |
| --- | --- | --- |
| Home, cleaner search, login, registration, password recovery | Pass | HTTP 200 on desktop and mobile |
| Responsive overflow | Pass | No horizontal overflow on tested public pages at 1440x900 or iPhone 15 viewport |
| Browser runtime health | Pass | No console errors or uncaught page errors on tested public pages |
| Public links | Pass | Seven discovered same-origin public links returned HTTP 200 |
| Cleaner profiles | Pass | Cleaner IDs 1 and 2 returned HTTP 200 and displayed booking controls |
| Required-field validation | Pass | Login, registration, and password recovery prevented empty submission with browser validation messages |
| Invalid login handling | Pass in baseline | Generic error shown; no stack trace or account enumeration detail exposed; repeat execution is opt-in to protect rate limits |
| Anonymous access control | Pass | Customer, vendor, and admin dashboards redirected to login with a local `returnTo` value |
| Google OAuth start | Partial pass | Browser reached `accounts.google.com`; callback and account creation were not tested |
| Apple OAuth start | Fail | Provider reported temporarily unavailable; see QA-002 |
| Security headers | Pass | HSTS, CSP, `nosniff`, `DENY`, and strict-origin referrer policy present |
| Unknown API route | Pass | HTTP 404 without stack trace or sensitive runtime details |
| `/api/health` | Fail | HTTP 404; see QA-001 |
| Automated accessibility | Fail | Two unique serious/critical issues; see QA-004 and QA-005 |

## Test limitations

- Automated accessibility checks cannot replace manual keyboard, screen-reader, cognitive, and inclusive usability testing.
- External Google and Apple provider completion requires controlled provider identities and cannot be inferred from reaching an authorization page.
- Email and SMS delivery require sandbox credentials or deterministic provider mocks; no production message was sent during this audit.
- No payment attempt was made and no production order, vendor, profile, or administrator record was changed.
