# Payment and calling activation — SastoKinBech

## Current, honest status

eSewa ePay v2 and Khalti Web Checkout adapters, server-side verification, payment
reservations, fulfilment guards and verified-failure stock restoration are implemented.
No live merchant credentials have been supplied. No merchant financial account has
been opened, no real money was charged and no live payment is enabled.

connectIPS, Fonepay, NEPALPAY QR, bank cards and other wallets are listed as unavailable.
Their provider-specific integrations are **not implemented**. They must not be called
connected merely because their names appear in checkout. Official merchant API
specifications, issuing/acquiring bank agreements and credentials are required first.

Broad wallet/mobile-banking coverage should use official interoperable merchant QR
or gateway services after the acquiring bank confirms supported instruments. This
does not guarantee every Nepal payment service works with every QR network.

## Merchant application preparation

The owner must supply the legal registered business name, business registration/PAN
status, business email and acquiring/settlement bank name. The provider determines
the exact KYC documents. Do not send citizenship scans, passwords, OTPs, merchant
secrets or banking credentials in chat. Submit those directly to the official provider.

Business display name: SastoKinBech / सस्तो किनबेच

Public website: https://www.sastokinbech.com/

Business location: Pipra Rural Municipality–5, Mahottari District, Nepal

Public support: +977 9807605076; WhatsApp: +977 9761658442

Business model: multi-vendor marketplace with retailer checkout and individual
contact-seller listings. Obtain explicit provider approval for collecting payments
for multiple sellers and agree settlement, refunds, fees and reconciliation first.
Seller payouts and automated provider refunds are not implemented in this version.

Official starting points:

- eSewa merchant: https://merchant.esewa.com.np/
- eSewa ePay API: https://developer.esewa.com.np/pages/Epay
- Khalti merchant: https://admin.khalti.com/
- Khalti sandbox merchant: https://test-admin.khalti.com/
- Khalti API: https://docs.khalti.com/khalti-epayment/
- connectIPS: https://connectips.com/
- NEPALPAY QR / acquiring-bank onboarding: https://nchl.com.np/nepalpay-qr/
- Fonepay: https://www.fonepay.com/

During this task eSewa's Register Business page opened, but its embedded Google
application form returned HTTP 401. No application or personal documents were
submitted. The owner should use the official portal in their normal signed-in browser.
The owner completes financial account creation, identity verification and contractual
acceptance. After merchant approval the application integration can be configured.

## Server-only environment variables

```
NEXT_PUBLIC_SUPABASE_URL=<existing Supabase URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing public key>
SUPABASE_SERVICE_ROLE_KEY=<private server key>
APP_ORIGIN=https://www.sastokinbech.com
PAYMENT_ENV=sandbox
PAYMENTS_ENABLED=false
MERCHANT_MARKETPLACE_APPROVED=false
ESEWA_PRODUCT_CODE=<provider-issued merchant code>
ESEWA_SECRET_KEY=<provider-issued secret>
KHALTI_SECRET_KEY=<provider-issued secret>
CALLING_ENABLED=false
TURN_URLS=<comma-separated turn:/turns: endpoints>
TURN_SHARED_SECRET=<private coturn REST shared secret>
```

Keep private values in hosting secret environment variables. Never put them in
config.local.json, public files, Git, browser JavaScript or screenshots. Public payment
availability contains names/booleans only. The calling endpoint returns short-lived
TURN credentials to authenticated users, never the shared secret.

Admin enables online_payments_enabled only after approval/configuration. Set
PAYMENTS_ENABLED and MERCHANT_MARKETPLACE_APPROVED true only when appropriate.
Use sandbox merchant credentials first. The UI labels sandbox methods TEST.
The environment must explicitly be sandbox or production; live origin requires HTTPS.

Gateway redirects are untrusted hints: the buyer signs in and presses Check payment
status. Server lookup checks provider reference, currency-unit amount and successful
status before the private confirmation RPC marks an order paid. It is idempotent.
Provider-confirmed terminal failure cancels the order and restores reserved stock once.
Timeouts/unknown/pending statuses retain the reservation for reconciliation rather than
invent success or release possibly paid stock. Failed initiation may leave a pending
order; review it before another payment attempt. There is no automatic retry/cron
reconciliation job or automated refund/payout. Online cancellation needs reconciliation
and is not available through seller/admin fulfilment buttons.

## Internet calling

The application implements authenticated private Supabase signaling and WebRTC audio.
A real support administrator opens #market/call and selects Available. Presence expires
after 45 seconds without a heartbeat. Calls assign an available agent, with accept,
reject, mute, end and browser microphone permission. Data charges may apply.

Provide a reachable coturn server with REST shared-secret authentication, public IP,
valid TLS certificate, TURN UDP/TCP/TLS ports and its relay port range. Vercel serverless
functions do not host TURN's UDP relay. Use an appropriate VM or managed TURN provider;
none has been purchased/provisioned. TURN URLs must match the configured service.
Secure HTTPS is required for production microphone access.

Set CALLING_ENABLED=true, configure TURN_URLS/TURN_SHARED_SECRET, and enable calls_enabled
in admin. Without both settings the UI honestly offers telephone/WhatsApp instead.
Calling signs in only; no phone number is dialled through WebRTC. Support agents are
currently administrators; separate delegated support-agent roles remain future work.
Leaving the calling page ends microphone capture. Signaling uses 2.5-second authenticated
polling. Review database capacity for scale and configure retention cleanup for ended
call signals. Test real audio across Wi-Fi/mobile networks, permission rejection,
agent disconnect and TURN relay before advertising availability.

## Verification performed

- Nine provider-adapter tests passed using mocked official response shapes (not a real
  merchant gateway sandbox session).
- Live Supabase tests passed for moderation, suspension, reviewed verification, banners,
  unpaid-order fulfilment blocking, service-only confirmation, amount validation,
  payment idempotency, stock restoration and private call assignment/signals.
- Existing COD live flow passed after these changes.
- All synthetic accounts, listings, payment records and calls used by automated tests
  were removed, and service flags restored.
- Actual merchant gateway checkout, payouts/refunds and two-device audio remain unverified
  until external services and real owner accounts are configured.

## Deployment

Run migrations 001–008 in order for a new Supabase project. They have already been
applied to the connected project. Build with npm run build; copy api, server, public
and package manifests together. Local preview supports these API handlers on port 4181.
For configured local integration use an ignored server environment file and map the
NEXT_PUBLIC_* variable names as above. Never run the preview with test service keys
against unrelated data.

Select hosting appropriate for commercial use before publication. The existing Vercel
Hobby account has not been upgraded. This version has not been pushed to production.
