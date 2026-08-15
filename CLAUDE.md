# SecondCurrent project instructions

## Product

SecondCurrent helps people decide what to do with old electronics. The first paid product is Recovery Check. A customer sends photos and receives a clear item record with a suggested next step.

## Work rules

- Read `docs/architecture.md` before changing system boundaries.
- Work in the phase order in the architecture plan.
- Do not run `git commit`, `git push`, or create a pull request unless the user asks for that exact action.
- Never add a coauthor, generated-by line, session link, or tool attribution.
- Do not change Git identity or Git configuration.
- Do not read `.env`, secret, or credential files.
- Do not put an em dash in any source-controlled text.
- Public UI and README copy must use plain words.
- Do not use vague product claims.
- Do not introduce a new framework or provider without explaining why the current interface cannot support the need.
- Keep provider SDK types inside adapter packages.
- Do not call external providers from React components.
- Do not put long-running work in route handlers.
- Do not wait for human responses inside a running Workflow task.
- Do not mark payments complete from return URLs.
- Do not let model output bypass Zod validation or policy rules.
- Do not expose phone numbers, private media keys, raw provider payloads, or internal notes in public views.

## Required checks

Run these after each meaningful change:

```bash
pnpm format:check
pnpm lint
pnpm check:copy
pnpm typecheck
pnpm test
pnpm build
```

Fix failures before continuing.

## Architecture

- Next.js web service
- Render Workflow service
- Postgres
- Private S3-compatible storage
- Prisma
- Zod
- Provider adapters with mock and live implementations
- Database state is the source of truth
- Webhooks use raw-body verification, durable storage, and idempotent processing

## Copy

Write for a person who does not know how the system works.

Good:

- Send three photos.
- The label is not clear yet.
- We need one close photo of the connector.
- This item should not be listed from the current evidence.

Bad:

- Unlock the power of intelligent recovery.
- Seamlessly transform your sustainability journey.
- Our advanced agent ecosystem delivers smart insights.

Use sentence case. Prefer short labels. Say what happened and what to do next.
