# D1 schema for the Chavea migration

This schema is **staged** and intentionally separate from the production PostgreSQL schema.
Do not deploy or import production data without an explicit backup and tested restore.

- The D1 schema uses SQLite, preserves model names and UUID string identifiers.
- SQLite does not have native PostgreSQL arrays: `UserProfile.consoles` and `UserReview.tags` use JSON, defaulting to `[]`. API input/output validation must be updated before cutover.
- Old PostgreSQL migrations are incompatible with D1 and must **never** run against D1.
- Prisma's D1 adapter has different transaction behavior: audit all `$transaction`, `pg_advisory_xact_lock`, `::uuid`, `::int`, `NOW()`, and SQL cast usages before switching API traffic.
- Supabase Auth, existing sessions, image upload storage and password recovery need a D1-native replacement before disabling Supabase.
- `D1_LOCAL_DATABASE_URL=file:./dev.db` is only for schema tooling. Workers use the Cloudflare `DB` binding with `@prisma/adapter-d1` (not a TCP URI).

## Zero-data-loss switch criteria

1. Locate a readable export/backup from the original PostgreSQL/Supabase project. If unavailable, obtain the owner's explicit acknowledgment that historic users, championships and stats cannot be restored.
2. Provision Cloudflare D1 and apply generated migration SQL to an isolated DB.
3. Migrate/authenticate all reachable users and historical records; verify counts and constraints.
4. Replace Supabase auth with native Hono sessions; migrate registered login identities.
5. Replace PostgreSQL-only queries and transaction flows with SQLite-safe/atomic operations.
6. Validate end-to-end auth, bracket, chat, scores, ranking, R2 uploads, permissions, and concurrent writes.
7. Cut over Cloudflare Worker and frontend only after successful staging gates and roll-back plan.

