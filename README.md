# SastoKinBech connected COD marketplace

This version connects the frontend to Supabase Auth, Postgres and image storage.
It includes login and registration, account recovery, profiles, retailer shop creation,
seller listings and variants, compressed photo uploads, cart, server-validated COD
checkout, order history and fulfilment, favourites, in-app inquiries, purchased-item
reviews, support/return/account-deletion requests and an expanded protected admin dashboard, payment adapters and private WebRTC signaling.
Light mode is retained. Seller content is displayed in its original language.

## Local setup

Use Node.js 24 and run `npm install`, then `npm run build` and `npm start`.
The preview listens on `http://127.0.0.1:4181/#market`.
Create ignored `config.local.json` with only these public values:

```json
{"url":"https://PROJECT.supabase.co","publishableKey":"YOUR_PUBLIC_PUBLISHABLE_KEY"}
```

Never place a service-role key, database password or merchant secret in this file,
in the `public` directory, or in browser code.

## Database

For a new Supabase project run migrations 001 through 008 in order. They are already
applied to the connected `sastokinbech-marketplace` project. Do not re-run CREATE TABLE
migrations on that project. Migration 004 replaces a function corrected by live tests.
Vercel's Query screen accepts one statement; use Supabase's SQL editor for a whole file,
or an atomic DO block with EXECUTE for each multi-statement migration.

The `product-images` bucket limits uploads to JPEG/PNG/WebP, 3 MB after compression,
and paths owned by the signed-in seller and an owned product. Input images are limited
to 10 MB each by the frontend. SVG and executable uploads are not accepted.

## Vercel deployment

The existing project is `sasto-kin-bech-`, repository `pasmanjitukumar-bit/sasto-kin-bech-`.
`vercel.json` builds the bundle and serves `public` plus the `/api/config` function.
Supabase integration provides `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The config endpoint exposes only these public
values. RLS enforces ownership even if a user bypasses the interface.

Set Supabase Auth Site URL to the production domain and allow confirmation/recovery
redirect URLs. Configure an authenticated transactional email service for production.
Email confirmation and recovery delivery depend on that configuration.

An administrator is created by registering the intended owner account, verifying
the email, then inserting its UUID into `public.admins` using the private SQL editor.
Never let users grant their own admin role. No production admin has been assigned.

## Verification

Live tests use generated, confirmed synthetic accounts and remove their fixtures.
Use an ignored `.env.test.local` containing SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY, then run:

`node --env-file=.env.test.local tests/live.mjs`

Database tests passed: shop, image upload, published offer, anonymous browsing,
variant checkout, trusted delivery total, price-mismatch rollback, stock decrement,
seller fulfilment, order history, individual classified listing, ownership restrictions
and admin self-escalation prevention. Browser tests passed the retailer-to-buyer COD
flow, English switching and non-admin access denial. Additional community tests
checked favourites, inquiries, purchase-only reviews and a temporary admin role.

## Practical limits and launch work

- Checkout currently supports one seller per order; delivery uses the highest configured
  item charge for that seller, disclosed before purchase. Multi-seller split checkout is not implemented.
- Admin now supports account suspension, listing moderation, reviewed shop verification,
  categories, banners, order transitions, requests and audit records. Commissions, automated
  settlement/refunds, irreversible deletion and delegated support staff are not implemented.
- Store cover/logo editing, map locations, existing-photo reordering, advanced price/location
  filtering, coupons and automated refunds need further work.
- Return and deletion requests are recorded for manual admin handling; no automatic refund
  or irreversible account deletion runs from the frontend.
- eSewa and Khalti server adapters and private WebRTC audio signaling are implemented,
  but live merchant accounts, credentials and TURN infrastructure are not configured.
  Other Nepal gateways are unavailable pending their official merchant APIs. See
  [activation and onboarding guide](backend/MERCHANT_SETUP.md). SMS OTP and production
  email are not configured. No real online payment or audio call has been claimed tested.
- Basic bilingual policy notices exist; review final operating policies before launch.
  Richer shop profiles and SEO for individual products need further work.
- This code has not yet been pushed to production. The public domain still serves the old preview.
- The existing Vercel Hobby plan is for non-commercial personal use. Select suitable
  commercial hosting before a business launch; this task has not bought a paid plan.

Support telephone: `tel:+9779807605076`; carrier charges may apply.
WhatsApp: `https://wa.me/9779761658442`.

## Payment, calls and extended admin verification

Read [MERCHANT_SETUP.md](backend/MERCHANT_SETUP.md) for required server secrets,
merchant-owner steps, provider support, TURN hosting and remaining operational limits.
Run `node --test tests/providers.cjs` and, with the ignored test environment,
`node --env-file=.env.test.local tests/services-live.mjs`. Mocked provider tests are
not a real gateway sandbox test. Live database tests restore service flags and delete
synthetic fixtures. User confirmation remains necessary for merchant financial
account creation and contractual acceptance.
