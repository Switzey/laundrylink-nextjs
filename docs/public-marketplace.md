# Public marketplace

LaundryLink's public marketplace is guest-accessible. Visitors can search by state, city/LGA, neighbourhood, free text, or browser location; filter by category, price, rating, distance, express service, pickup, delivery, and verification; and sort by recommendation, distance, price, rating, turnaround, or popularity.

## Public routes

- `/` provides the main discovery search, trust information, supported locations, service categories, featured vendors, and launch waitlist.
- `/cleaners` provides list and map views, advanced filters, sorting, and two-to-three-vendor comparison.
- `/cleaners/[id]` provides active services and prices, coverage, opening hours, business media, verified-order reviews, availability, and booking.
- `/services/[category]` and `/laundry/[state]/[city]` provide indexable category and location discovery pages.
- `/waitlist` collects customer and vendor launch interest for unsupported locations.
- `/how-it-works`, `/help`, `/contact`, `/terms`, `/privacy`, `/cancellation`, and `/vendor-registration` provide public support and policy information.
- `/sitemap.xml` and `/robots.txt` expose crawlable marketplace routes.

The browser-location control sends coordinates only through the search URL after the visitor grants permission. The map displays only vendor-supplied coordinates and does not invent approximate pins. OpenStreetMap tiles are loaded directly from `tile.openstreetmap.org` and are permitted by the application Content Security Policy.

## Marketplace eligibility

Only vendors exposed by the centralized `vendor_eligibility` view can appear publicly. Booking is enabled only when the same server-side eligibility policy confirms approved verification, complete business and location data, at least one active valid service, publication, no suspension, and active order acceptance. Hiding a button is never used as authorization.

Featured placement is deterministic and disclosed on the homepage: the vendor must be verified, bookable, rated at least 4.5, and have active services. Paid placement is not inferred from marketplace data.

## Required data

Search quality depends on normalized vendor state, city/LGA, area, latitude, longitude, pickup radius, and delivery radius. Vendor services need a category, positive price, pricing unit, turnaround time, express state, and active state. Missing or invalid vendor media falls back to a branded business-name treatment.

## Release gate

Apply the idempotent marketplace migration to staging first, validate discovery and waitlist submissions there, then apply it to production during an approved release:

```bash
node --env-file=.env.staging.local scripts/migrate-marketplace.mjs
node --env-file=.env.production.local scripts/migrate-marketplace.mjs
```

The migration creates waitlist storage, validation triggers, and marketplace indexes. It does not publish vendors or change existing booking state. Do not deploy marketplace code before the target database has the existing onboarding/eligibility migration and this marketplace migration.
