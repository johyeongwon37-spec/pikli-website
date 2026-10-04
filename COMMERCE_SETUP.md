# PIKLI commerce — launch checkpoint

## What this commit does

Keeps the last approved homepage source (`index.html`), colour palette, logo and carousel assets. The build uses that source to generate the deployed homepage; it replaces the old localStorage-only product modal/cart script with a shared storefront runtime. The existing logo assets are not modified.

Adds `/shop.html`, `/product.html?id=tee`, `/cart.html`, `/checkout.html`, `/order.html` and `/policies.html`. Vietnamese is the default, English remains available. Guest checkout avoids an unnecessary account barrier. Colour/size variants, grouped cart quantities, server quotes, address/review steps, and token-protected order lookup are implemented. Placeholder product drawings remain until approved photography exists.

**This is NOT a live payment launch.** Draft prices/images are not approved. Shipping, merchant identity, final policies and the payment provider are not confirmed. Checkout is closed by default. No fake receipts or localStorage-only email signup confirmations are generated. Preview contact details stay in page memory, not persistent browser storage and not the server.

## Deployment

The Vercel project reads `vercel.json`: `npm run build`, output `public`, framework `null`, Node 22. Source assets live in `storefront/`; no frontend credentials. `/api/store` is a single Vercel Node function. Do not publish this repository directory directly as a static folder: use the `public` output and the server function.

`npm test`: isolated server validation tests.
`npm run dev`: local preview API/static server (test mode). Local UI harness screenshots are not evidence of live payment acceptance.

## Backend connection still required

1. Obtain approval to create a NEW PIKLI Supabase project in the user's chosen organization. Do not use SPARTERS.
2. Review/apply `database/001_store.sql`, then `002_draft_catalog.sql` to that new project. These files have NOT been applied automatically. All stock starts at zero and all products start unapproved.
3. Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) only in server environment settings. Never commit keys. The connector currently cannot access the Vercel workspace: reauthorize it or enter env values securely in its dashboard.
4. Configure the verified merchant, confirmed VND shipping fee, delivery promise and legally reviewed policies in `pikli_settings`. Set a policy version. Confirm stock, final prices and `approved=true` only for real sellable products. Add real product media and measured sizing in the product data.
5. Choose a payment provider based on where the merchant is registered and receives payouts. No Stripe/MoMo/VNPay merchant is assumed. Card/wallet checkout and signed webhooks are NOT implemented in this commit: they require the selected provider's contract and credentials.

## Optional cash-on-delivery path (not enabled)

The server + SQL contain a COD order-intake path. It still requires explicit merchant/operator approval, a COD-capable carrier, real stocked variants and a non-null shipping fee. `PIKLI_LIVE_APPROVED=true`, a configured `SITE_URL`, 32+ character `PIKLI_RATE_LIMIT_SALT`, and DB `checkout_enabled` + `cod_enabled` are all required. Do not enable these flags merely to bypass a closed checkout.

COD intake validates cart/price/options on the server and again in the database transaction, locks inventory, decrements stock, and uses idempotency keys. It records `pending_confirmation` and `unpaid`, NOT `paid`. It is not part of the first 300 paid preorders. Cancel/restock, fulfillment notifications, refunds, admin UI and carrier integration must be connected/reviewed before operating COD at scale. No payment changes should be made from a client redirect.

## Privacy and safety

All new database tables enable RLS and revoke anonymous/authenticated direct grants. Only a server service role can call the commerce RPCs. Customer data is never returned by catalogue or order-status endpoints. Status lookup requires UUID + 256-bit private token; only its hash is stored in the database. No public email-only order lookup. API errors and logs do not expose PII or secret values. Card details are never collected by PIKLI; a future provider must host/tokenize that input.

## Acceptance gates remaining

- Verify the production build and all navigation against the real deployed page.
- Apply and test migration/RLS, concurrent stock exhaustion and idempotent retry in the dedicated DB.
- Select and contract the gateway; test approved, cancelled, declined, repeated and delayed webhook flows.
- Confirm inventory, taxes/currency display, shipping dates, tracking, exchange/return/refund policy and customer support contact.
- Implement administration, order/receipt emails, cancellation/restock and fulfillment support before opening to customers.
- Confirm commercial hosting eligibility. Vercel Hobby is restricted to personal non-commercial use; Pro or another commercial-eligible host is required for a shop.

Official references:
https://vercel.com/docs/limits/fair-use-guidelines
https://vercel.com/docs/functions/runtimes/node-js
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/database/functions
