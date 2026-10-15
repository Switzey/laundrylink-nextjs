# LaundryLink automated testing

## Test layers

- `npm run test:unit` runs Vitest unit and SQLite integration tests.
- `npm run test:e2e` runs the critical Chromium journeys with Playwright.
- `npm run check` runs generated route types, TypeScript, ESLint, unit/integration tests, the production dependency audit, and a production build.
- `npm run check:all` adds the browser suite to the full local check.

The browser harness always starts LaundryLink on `http://127.0.0.1:3100` with a newly seeded `data/e2e.sqlite` database and dedicated demo password. It does not read the production database, invoke production OAuth, or target a deployed URL. Do not change the E2E server to use production credentials or production data.

## Coverage map

Vitest covers authentication and onboarding validation, role authorization, return URL safety, phone verification, vendor eligibility, marketplace filtering and sorting, waitlist constraints, cart quantity and price rules, checkout validation, order lifecycle policy, account/order ownership, document permissions, session expiry, database constraints, audit records, and preservation of existing orders during suspension.

Playwright covers customer login/logout and cookie security, session expiration, unauthorized admin access, guest marketplace filters, list/map switching, vendor comparison, waitlist conversion, cleaner discovery, service selection, checkout intent restoration, order creation, vendor processing, customer tracking, admin vendor approval, and anonymous denial for restricted vendor documents. Automated WCAG A/AA checks cover the homepage, directory, cleaner profile, waitlist, and how-it-works page.

Google and Apple are deliberately not contacted by CI. Local validation and provider-independent auth behavior are tested, but passing tests do not prove that live OAuth client IDs, secrets, redirect URIs, consent-screen settings, or provider availability are correct.

## Dependency audit note

`npm audit --omit=dev --audit-level=moderate` reports zero production vulnerabilities. The full development audit currently reports the `GHSA-vfj7-8cjw-p6xm` advisory in `braces` through `eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch`. The registry has no patched `braces` release above 3.0.3, and npm's proposed remediation downgrades `eslint-config-next` from 16.x to 14.2.35, which would break alignment with Next.js 16. The affected chain is used for local/CI lint glob processing and is not included in the production runtime. Recheck this advisory during dependency updates and remove this note once the upstream chain publishes a compatible fix.

## Local commands

Install Chromium once:

```powershell
npx playwright install chromium
```

Run one layer:

```powershell
npm run test:unit
npm run test:e2e
```

Open an interactive browser while debugging:

```powershell
npm run test:e2e:headed
```

Playwright traces, screenshots, and video are retained only for failures and ignored by Git.

## Read-only live production QA

The separate live harness is hard-locked to `https://www.laundrylink.com.ng` and runs desktop Chromium plus Pixel 7 emulation. Its default mode covers public pages, navigation, responsive overflow, required-field validation, authentication guards, OAuth initiation, security headers, API error safety, cart intent preservation, and automated WCAG A/AA checks. It does not create accounts, send messages, submit orders, change profiles, approve vendors, or attempt payments.

```powershell
npm run test:e2e:live
npm run test:e2e:live:headed
npm run test:e2e:live:report
```

Authenticated checks require dedicated least-privilege accounts through `E2E_LIVE_CUSTOMER_*`, `E2E_LIVE_VENDOR_*`, and `E2E_LIVE_ADMIN_*`. Registration and password-recovery delivery remain skipped unless their explicit opt-in flags and sandbox identities are configured. Never use personal accounts or local demo credentials against production.

The manual-only `live-qa.yml` workflow stores credentials in the `production-qa` GitHub environment and uploads reports, screenshots, video, and traces even when findings fail the run. It is intentionally not scheduled and does not run on pull requests.

## Playwright AI test agents

Planner, generator, and healer agent profiles live in `.codex/agents`, with their safety contract and seed plan under `specs`. Regenerate the official profiles when Playwright changes:

```powershell
npm run playwright:agents
```

Agent-generated tests must preserve the live suite's read-only defaults. A generated test is not accepted until its selectors, assertions, test data, and production safety have been reviewed and the test passes repeatably.
