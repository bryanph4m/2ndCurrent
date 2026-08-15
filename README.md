# SecondCurrent

SecondCurrent helps people decide what to do with old electronics.

Send photos of an item. The app checks the visible evidence and returns a clear item record with a suggested next step.

## What the first version does

- Receives item photos by text
- Checks visible identity and condition
- Requests missing evidence
- Uses a short human review when needed
- Creates a shareable item record
- Suggests resell, donate, repair, or recycle
- Matches approved local items with buyer requests

## Local setup

1. Install Node.js 24, pnpm 11, and Docker Desktop.
2. Copy `.env.example` to `.env` and keep `INTEGRATION_MODE=mock`.
3. Generate separate 32-byte base64 values for `PHONE_LOOKUP_KEY`, `FIELD_ENCRYPTION_KEY`, `SESSION_SECRET`, and `ADMIN_SESSION_SECRET`.
4. Generate `ADMIN_PASSWORD_HASH` with `pnpm admin:hash-password <password>`.
5. Start PostgreSQL and the private MinIO bucket, deploy the migration, and seed the demo data.
6. Start the web app and workflow process.

Generate a base64 secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

```bash
pnpm install
pnpm db:up
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

The app is available at `http://localhost:3000`. The admin login is at `/admin/login`. MinIO is available at `http://localhost:9001`. Uploaded photos are re-encoded as WebP with metadata removed before they enter private storage.

## Mock and live checks

With the local app running, post the checked-in provider fixtures with:

```bash
pnpm mock:linq
pnpm mock:stripe
pnpm mock:terac
```

Live smoke commands are opt-in and are not included in `pnpm test`:

```bash
pnpm smoke:live linq
pnpm smoke:live stripe
pnpm smoke:live terac
pnpm smoke:live render
pnpm smoke:live storage
pnpm smoke:live vision
```

Each live command can create real provider-side test data. Use controlled accounts and the variables documented in `.env.example`.

For Stripe live mode, set `STRIPE_PAYMENT_LINK_URL`, `STRIPE_SECRET_KEY`, and
`STRIPE_WEBHOOK_SECRET`. Register `<APP_BASE_URL>/api/webhooks/stripe` for
`checkout.session.completed` and `checkout.session.async_payment_succeeded`,
and configure the Payment Link's after-payment redirect as
`<APP_BASE_URL>/checkout/return?session_id={CHECKOUT_SESSION_ID}`.

## Deployment

`render.yaml` defines the web service, workflow worker, managed PostgreSQL database, migration step, and health check. Configure a private S3-compatible bucket and all secrets before switching `INTEGRATION_MODE` to `live`. Follow [the operations runbook](docs/operations-runbook.md) for deployment order, smoke tests, incidents, and recovery.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm check:copy
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Limits

This version does not certify electrical safety, erase device data, or process payment for physical goods.
