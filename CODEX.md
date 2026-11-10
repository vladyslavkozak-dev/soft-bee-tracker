# Codex Working Rules

## Project context

- Stack: Next.js 16, React 19, TypeScript 6, Supabase, TanStack Query, Zustand 5, and Vitest.
- Use Yarn 4 commands; run unit tests with `yarn test`.
- Keep Supabase reads/writes under `src/lib/api/<entity>/` and export public contracts from that domain's `index.ts`.

## State and data access

- UI components must consume domain TanStack Query hooks and must not call Supabase or `fetch` directly.
- Use TanStack Query for all server data and CRUD; do not use Zustand for CRUD.
- Use Zustand only for ephemeral UI state in `src/features/<name>/store/`.
- Existing Zustand stores under `src/lib/api/**` (`projects`, `project-rates`, `auth` profile) predate this decision: do not add new domain stores or extend them.
- Keep pure reads in `queries.ts`, pure writes in `mutations.ts`, and domain contracts in `types.ts`. Domain types alias generated `Database` types. Add `mappers.ts` only when a value changes at runtime; see `.cursor/rules/lib-services.mdc`.
- Normalize async failures to `ApiError` and preserve the Supabase response status.
- Add or update Vitest coverage for query and mutation helpers: success and failure (normalized `ApiError`).
- Route access is decided by `getRouteAccess` (`src/lib/route-access.ts`) from the verified `user_role` JWT claim; rules live in `src/constants/index.ts`. Every app `page.tsx` calls `requireRouteAccess` (`@/lib/api/auth/server`) at the top. It only applies the rules, so restrict a page by adding it to `ROLE_RESTRICTED_ROUTES`, and classify every new route in `ROUTE_CLASSIFICATION` (`src/lib/route-access.test.ts`); unlisted routes allow every signed-in role, and a missing role fails closed. Never read the role from `user_metadata` or `public.users`.

## Scope filter for frontend conventions

- Apply the coding conventions below only when editing `src/components/**` and `src/app/**/page.tsx`.
- For changes outside those paths, prioritize local file conventions and existing project rules.

## Coding standards

- Follow `.cursor/rules/naming-conventions.mdc` for file and folder paths (`kebab-case` only).
- Use TypeScript and prefer `interface` for object shapes.
- Use PascalCase for components; camelCase for variables/functions.
- Export React components as named functions; avoid default exports and class components.
- For `src/components/**` and `src/app/**/page.tsx`, prefer separate named handler functions over inline lambdas in JSX props.
- When a prop expects `() => void` but work is async, keep async logic in a separate function and call it via a `void`-safe wrapper callback.
- Keep components declarative; move imperative logic to helpers.
- Avoid `any` and `unknown` in project code unless there is a brief inline justification.
- Do not run unrelated refactors or formatting-only sweeps.

## Database / RLS

- Follow `.cursor/rules/supabase-db.mdc` for migrations and RLS.
- Role checks in RLS must use JWT helpers (`private.is_manager_or_admin()`, `private.jwt_role()`), never `select … from public.users` for role.

## Secrets and environments (strict)

- Keep local secrets in `.env` (gitignored by `.env` and `.env.*`); `.example.env` lists variable names only, never values.
- Never commit, log, print, or paste secret values. Agents must not read or echo `.env` values; when debugging, check only whether each variable is set.
- `SUPABASE_SECRET_KEY` is server-only: read it only in `createServiceClient()` in `src/lib/supabase/server.ts`. Never import `lib/supabase/server` from `"use client"` modules or from `lib/supabase/client`.
- Never expose a secret through a `NEXT_PUBLIC_*` variable; only the Supabase URL and anon key are public.
- Each developer works against their own environment (local Supabase via `supabase start` or a personal dev project). Do not run migrations or write SQL against shared or production projects without team agreement.

## Safety

- Ask before changing auth, security-sensitive behavior, or database schema.
- Never commit secrets or credential-like values.
