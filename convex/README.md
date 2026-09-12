# SautiSafe — Convex backend

Production-ready Convex backend for **SautiSafe**, the code-switched voice
reporting assistant for industrial safety incidents. This folder is the
deployment target the owner will cut over to from the live Next.js testing
instance (Prisma + SQLite + `z-ai-web-dev-sdk`); the two are an intentional
1:1 mirror — every Prisma model has a Convex table, every `/api/*` route in
the live app maps to a Convex function. See **[MIGRATION.md](./MIGRATION.md)**
for the full field-level and route-level mapping, deployment steps, env vars,
and the safety-safeguard checklist.

> Do NOT run `npx convex dev` from this Z cloud sandbox — this folder is
> checked in for the owner to deploy later.
