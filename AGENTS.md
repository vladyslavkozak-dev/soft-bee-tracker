<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project context and commands

- Stack: Next.js 16, React 19, TypeScript 6, Supabase, TanStack Query, Zustand 5, and Vitest.
- Package manager: Yarn 4.
- Run unit tests with `yarn test`.
- Run targeted ESLint for touched files before broader validation; the repository may contain unrelated legacy formatting findings.

## Data and state architecture

- Keep Supabase access in `src/lib/api/<entity>/queries.ts` and `mutations.ts`; UI code must not call Supabase directly.
- Export each domain's public contract through `src/lib/api/<entity>/index.ts`.
- Use TanStack Query for all server data and CRUD (`useQuery` reads, `useMutation` writes with cache invalidation). Do not use Zustand for CRUD.
- Use Zustand only for ephemeral UI state in `src/features/<name>/store/`; never put server data in it.
- Existing Zustand stores under `src/lib/api/**` (`projects`, `project-rates`, `auth` profile) predate this decision: do not add new domain stores or extend them.
- Keep entities separate: `projects` and `project-rates` must not share query keys, hooks or domain types.
- Domain types alias generated `Database` types. Add `mappers.ts` only when a value changes at runtime. See `.cursor/rules/lib-services.mdc`.
- Route access is decided by `getRouteAccess` (`src/lib/route-access.ts`) from the verified `user_role` JWT claim; rules live in `src/constants/index.ts`. Every app `page.tsx` calls `requireRouteAccess` (`@/lib/api/auth/server`) at the top. It only applies the rules, so restrict a page by adding it to `ROLE_RESTRICTED_ROUTES`, and classify every new route in `ROUTE_CLASSIFICATION` (`src/lib/route-access.test.ts`); unlisted routes allow every signed-in role, and a missing role fails closed. Never read the role from `user_metadata` or `public.users`.

## Database / RLS

- Follow `.cursor/rules/supabase-db.mdc` for migrations and RLS.
- Role checks in RLS must use JWT helpers (`private.is_manager_or_admin()`, `private.jwt_role()`), never `select … from public.users` for role.

## Secrets and environments (strict)

- Keep local secrets in `.env` (gitignored by `.env` and `.env.*`); `.example.env` lists variable names only, never values.
- Never commit, log, print, or paste secret values. Agents must not read or echo `.env` values; when debugging, check only whether each variable is set.
- `SUPABASE_SECRET_KEY` is server-only: read it only in `createServiceClient()` in `src/lib/supabase/server.ts`. Never import `lib/supabase/server` from `"use client"` modules or from `lib/supabase/client`.
- Never expose a secret through a `NEXT_PUBLIC_*` variable; only the Supabase URL and anon key are public.
- Each developer works against their own environment (local Supabase via `supabase start` or a personal dev project). Do not run migrations or write SQL against shared or production projects without team agreement.
- Ask before changing auth, security-sensitive behavior, or database schema.

## Scope filter for frontend conventions

- Apply the function conventions below only when editing `src/components/**` and `src/app/**/page.tsx`.
- For changes outside those paths, prioritize local file conventions and existing project rules.

## Function conventions for scoped files

- Follow `.cursor/rules/naming-conventions.mdc` for file and folder paths (`kebab-case` only).
- Prefer named function declarations and extracted handler functions over inline JSX lambdas.
- For callbacks that must return `void`, keep async work in a separate function and invoke it via a `void`-safe wrapper.
