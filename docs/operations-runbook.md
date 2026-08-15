# SecondCurrent operations runbook

## Deploy

1. Provision PostgreSQL and a private S3-compatible bucket.
2. Configure every variable in `.env.example`; live mode fails validation when a provider or storage secret is missing.
3. Run `pnpm db:migrate:deploy` as the controlled pre-deploy step.
4. Deploy the web service, then the workflow worker from `render.yaml`.
5. Confirm `/api/health` returns `200` before registering provider webhooks.
6. Run each `pnpm smoke:live <provider>` command separately with controlled test accounts.

## Webhook incident

Check `WebhookEvent` for signature failures, duplicate provider IDs, attempt count, and last error. Do not replay an event by changing its provider ID. Fix the underlying dependency, then replay through the provider or an audited operator tool so the existing idempotency guards remain effective.

Webhook deliveries are claimed atomically. A failed event can be claimed again on provider redelivery up to five processing attempts. After the fifth failure it remains `FAILED`, receives a dead-letter audit event, and appears in the admin `Needs attention` section.

## Workflow incident

Check `WorkflowRun` by idempotency key and inspect its linked item. A failed run may be retried with the same business input; do not invent a new key merely to bypass a running or succeeded record. Verify the outbox independently because provider delivery occurs outside the database transaction.

Failed outbox sends wait 5 seconds, 30 seconds, 2 minutes, and 10 minutes between retries. The fifth failed send becomes `FAILED`, receives a dead-letter audit event, and appears in `Needs attention` instead of retrying forever.

## Storage incident

Keep the bucket private. Confirm anonymous reads fail, then run the storage smoke test to exercise a signed read. Rotate access keys if a credential is exposed. Uploaded images are re-encoded before storage, and public pages must never emit an object key.

## Database recovery

Use managed PostgreSQL point-in-time recovery or a verified encrypted backup. Restore into a new database first, run `prisma migrate status`, and verify counts for contacts, orders, studies, webhooks, outbox rows, and audit events before switching traffic. Never run `demo:reset` against a shared or production database.

## Provider rollback

Set `INTEGRATION_MODE=mock` only for an isolated demo deployment. For production incidents, disable the affected provider webhook, preserve received payloads and audit records, resolve queued outbox messages, and restore the provider after its smoke test passes.
