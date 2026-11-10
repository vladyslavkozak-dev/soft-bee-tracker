# Soft Bee Tracker

Production Next.js application for crew time tracking, project management, and reporting. Built with Supabase for auth and data, TanStack Query for server state, Zustand for UI state, and shadcn/ui for the interface.

## Tech stack

| Layer | Tools |
|-------|-------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com/) |
| Database & auth | [Supabase](https://supabase.com/) (Postgres, RLS, SSR cookies) |
| State management | [TanStack Query](https://tanstack.com/query) (server data), [Zustand 5](https://zustand.docs.pmnd.rs/) (UI state) |
| Auth flows | Supabase Auth, TanStack Query mutations in `lib/api/auth` |
| Forms & validation | React Hook Form, Zod |
| Notifications | [Sonner](https://sonner.emilkowal.ski/) |

## Prerequisites

- Node.js 20+
- Yarn 4 (`corepack enable`; version pinned in `package.json`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker (for local DB and type generation)

## Getting started

```bash
# Install dependencies
yarn install

# Start local Supabase and apply all migrations + seeds
yarn sb:start
yarn sb:reset

# Copy the local env template, then paste "Publishable key" and "Secret key" from `yarn sb:status`
cp .example.env .env.local

# Start the dev server (Turbopack)
yarn dev
```

Restart `yarn dev` after editing `.env.local`: env files are read at startup.

Open [http://localhost:3000](http://localhost:3000) and sign in with one of the [test accounts](#test-accounts).

### Environments

Local/test and production settings never share a file.

| Environment | Template | Where values live | Supabase |
|-------------|----------|-------------------|----------|
| Local development | `.example.env` | `.env.local` (gitignored) | Local stack, `http://127.0.0.1:54321` |
| Automated tests (Vitest, Playwright, CI) | `.example.env` (`PLAYWRIGHT_*` section) | `vitest.setup.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` — placeholder keys only | Local only — non-local URLs are rejected (`src/lib/supabase/env-safeguards.ts`) |
| Production | Same variable names as `.example.env` | Hosting provider env settings, never in the repo | Production project (Settings → API Keys) |

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL, exactly `https://<project-ref>.supabase.co` (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key (browser + server client) |
| `SUPABASE_SECRET_KEY` | Secret / service role key — **server-only**, bypasses RLS, read only by `createServiceClient()` in `src/lib/supabase/server.ts`; never `NEXT_PUBLIC_` |

All `.env` and `.env.*` files are gitignored; only the `.example.env` template (no secrets) is committed.

### Test accounts

Created by `supabase/seeds/01_users.sql` on every `yarn sb:reset`. Local only — seeds are never applied to production.

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@softbee.dev` | `Password1` |
| Manager | `manager@softbee.dev` | `Password1` |
| Staff (`worker` role) | `worker@softbee.dev` | `Password1` |

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start development server |
| `yarn build` | Production build |
| `yarn start` | Serve production build |
| `yarn lint` | Run ESLint |
| `yarn lint:fix` | Auto-fix ESLint issues |
| `yarn test` | Run the Vitest test suite |
| `yarn test:e2e` / `yarn test:e2e:ui` | Run Playwright E2E tests (headless / UI mode) |
| `yarn sb:start` / `yarn sb:stop` | Start / stop the local Supabase stack (Docker) |
| `yarn sb:status` | Show local URLs and keys |
| `yarn sb:reset` | Recreate the local DB: apply all migrations, then seeds |
| `yarn sb:test` | Run pgTAP database tests from `supabase/tests/` against the local DB |
| `yarn sb:db:types` | Regenerate `src/types/supabase-schema.ts` from local Supabase |

## Project structure

```text
src/
├── app/                  # Next.js App Router (pages, layouts, globals)
│   └── lib/              # App-scoped utilities (supabase clients, legacy api)
├── components/
│   └── ui/               # shadcn/ui primitives
├── constants/            # Routes, route-access rules, shared constants
├── features/             # Feature UI modules
├── lib/
│   ├── api/              # Domain data access (TanStack Query hooks)
│   ├── route-access.ts   # Route guard decisions (public, login, role)
│   └── utils.ts          # Shared helpers (cn, etc.)
├── providers/            # React context providers (QueryClient)
└── types/                # Shared TypeScript types (Database, ApiError)

supabase/
├── config.toml           # Local Supabase configuration
├── migrations/           # SQL migrations (YYYYMMDDHHmmss_description.sql)
└── tests/database/       # pgTAP tests (`yarn sb:test`)

epics/                    # Feature epics and task specifications
.cursor/rules/            # AI agent coding standards
```

## Architecture

### Data access (`lib/api`)

Each domain gets a folder under `src/lib/api/<feature>/`:

```text
src/lib/api/users/
  index.ts       # Public barrel — components import from here only
  queries.ts     # Read helpers
  mutations.ts   # Write helpers
  types.ts       # Optional aliases and Pick/Omit of generated database types
  mappers.ts     # Only when a value changes at runtime
```

Components import hooks from `@/lib/api/<feature>`. They must not call Supabase, `fetch`, or Axios directly. Domain types alias generated database types. A mapper exists only when a value changes at runtime. See `.cursor/rules/lib-services.mdc`.

### Route protection

`src/proxy.ts` runs `updateSession` (`src/lib/supabase/session.ts`) on every request. It refreshes the Supabase session, reads the verified `user_role` JWT claim (the same claim RLS checks), and asks `getRouteAccess` in `src/lib/route-access.ts` what to do:

| Result | Response |
|--------|----------|
| No session on a protected route | Redirect to `/login?next=<requested page>`; after sign-in the user lands back there |
| Signed in on `/login` | Redirect to a safe `next` path, else `/tracker` |
| Role not allowed | Rewrite to `/access-denied` (the URL stays the same): status 403 on a page load, 200 on an in-app navigation so the router renders it in place |

Every app page calls `requireRouteAccess(ROUTES.X)` from `@/lib/api/auth/server` at the top of `page.tsx`. It re-runs the proxy's `getRouteAccess` decision with the role from the same verified `user_role` claim, then loads the profile: `getUser()` asks the Auth server (catching revoked sessions that a locally verified JWT can't), and a revoked session or one without a profile row is sent to `/auth/sign-out`, which clears the cookies and returns to `/login`. A blocked user goes through the same route and lands on `/blocked`, which says why. No session redirects to `/login`, and a wrong role redirects to `/access-denied`. A session with no role is offered "Sign in again" there, since only a new token carries a new claim.

The sidebar (`src/components/layout/app-sidebar/app-sidebar.tsx`) uses the same rules and the same claim to hide links a role can't open.

The access rules live in `src/constants/index.ts`: `PUBLIC_ROUTES_LIST`, `GUEST_ONLY_ROUTES_LIST` and `ROLE_RESTRICTED_ROUTES`. `requireRouteAccess` does not restrict anything by itself: a route missing from `ROLE_RESTRICTED_ROUTES` is open to every signed-in role. To add a page, add it to `ROUTES`, classify it in `ROUTE_CLASSIFICATION` in `src/lib/route-access.test.ts` (typecheck fails until you do), add it to `ROLE_RESTRICTED_ROUTES` if it is role-restricted, and call `requireRouteAccess` in its `page.tsx`. The proxy, page checks and sidebar all read the role from the `user_role` claim (`getRouteSessionFromClaim`), never from `public.users`, so they can't disagree. A missing or unknown role is denied. Hiding a page is not data security: RLS still decides what each request can read or write.

#### Verify route protection

1. `yarn test` runs the route matrix (`src/lib/route-access.test.ts`), the proxy responses and cookie handling (`src/lib/supabase/session.test.ts`), and the page check (`src/lib/api/auth/server.test.ts`).
2. With `yarn dev` and the seeded [test accounts](#test-accounts): signed out, every app route redirects to `/login`. As `worker@softbee.dev`, `/crew` and `/reports` show the access-denied page with status 403, and the sidebar shows only Tracker and Projects. As `manager@softbee.dev` or `admin@softbee.dev`, every route opens and the sidebar adds Crew and Reports. `/terms` and `/blocked` open signed out, and a signed-in user can open `/register` (the invite flow). Signed out, open `/tracker?tab=week`, sign in, and you land back on it.
3. Direct API requests ignore the UI. Sign in through `POST /auth/v1/token?grant_type=password`, then call `/rest/v1/users` with the access token. Each user, any role, sees only their own row, and the anon key sees none.

### State management

| Concern | Where |
|---------|-------|
| Server data and CRUD | TanStack Query hooks in `lib/api/**` |
| Ephemeral UI state | Zustand stores in `features/<name>/store/` |
| Auth mutations | `useSignIn`, `useSignUp`, `useSignOut` in `lib/api/auth` |

Do not use Zustand for CRUD. Existing Zustand stores under `src/lib/api/**` (`projects`, `project-rates`, `auth` profile) predate this decision: do not add new domain stores or extend them.

See `.cursor/rules/state-manager.mdc` for full patterns.

### UI components

- shadcn/ui primitives live in `src/components/ui/`
- Compose with Tailwind utilities and the `cn()` helper from `@/lib/utils`
- Add new primitives: `npx shadcn@latest add <component>`

## Supabase

```bash
# Start local Supabase (requires Docker)
yarn sb:start

# Apply migrations + seeds to the local DB (drops local data)
yarn sb:reset

# Apply migrations to the local database
supabase db push

# Apply migrations to the linked hosted project (asks for confirmation)
supabase db push --remote

# Regenerate TypeScript types after schema changes
yarn sb:db:types
```

### Production migrations

> **Warning:** `supabase db push` targets the **local** database. The linked hosted project needs `supabase db push --remote`, and the CLI asks for confirmation.

Production migrations are deployed **manually only**: after the migrations are merged to `main`, the person responsible for the release opens **Actions → Deploy database migrations → Run workflow** with the `main` branch selected (other branches are skipped). Nothing deploys automatically on merge.

1. `validate-db.yml` runs first: all migrations + seeds on a clean database, schema lint, pgTAP tests (`supabase/tests`), DB types.
2. The `deploy` job waits for approval in the `production` GitHub Environment, prints the pending migrations (`db push --dry-run`) and applies them. Seeds are never applied to production.

Repository setup (owner, one time): create the `production` environment under **Settings → Environments**, add required reviewers, and add the `SUPABASE_DB_URL` secret (production connection string) to it.

Manual fallback, by the person responsible for the release:

```bash
supabase link --project-ref <production-project-ref>
supabase db push --remote --dry-run   # review pending migrations
supabase db push --remote             # applies migrations only; asks for confirmation. Seeds are not applied
```

Migrations use 14-digit UTC timestamps: `YYYYMMDDHHmmss_description.sql`. All tables must have RLS enabled. See `.cursor/rules/supabase-db.mdc` for policy conventions.

## Code quality

- **ESLint** + **Prettier** — run `yarn lint` before committing
- **Husky** pre-commit hooks via lint-staged
- **CI** (`.github/workflows/ci.yml`) — lint, unit tests, build, secret-leak scan and Playwright safeguards on every PR, plus `validate-db.yml` in parallel: all migrations + seeds on a clean database, `supabase db lint`, pgTAP tests (`yarn sb:test`: seeded test accounts, RLS on every public table), and a check that `src/types/supabase-schema.ts` is up to date
- **DB deploy** (`.github/workflows/deploy-db.yml`) — manually triggered, validated, approval-gated `supabase db push` to production from `main`
- Path alias: `@/*` → `src/*`

## AI agent setup

Each team member configures their own AI tool. Every tool reads the same project rules (structure, commands, style, data access, and secrets) from its own instruction file:

| Tool | Instruction files |
|------|-------------------|
| Claude Code | `CLAUDE.md` |
| Codex and other `AGENTS.md`-aware agents | `AGENTS.md`, `CODEX.md` |
| Cursor | `.cursor/rules/*.mdc` |
| Windsurf | `.windsurfrules` |

Detailed Cursor rules, referenced by the other files:

| File | Purpose |
|------|---------|
| `.cursor/rules/ai-standing-orders.mdc` | Global coding standards |
| `.cursor/rules/state-manager.mdc` | TanStack Query + Zustand patterns |
| `.cursor/rules/lib-services.mdc` | `lib/api` module layout |
| `.cursor/rules/components-ui.mdc` | Component and UI conventions |
| `.cursor/rules/app-nextjs.mdc` | App Router page conventions |
| `.cursor/rules/supabase-db.mdc` | Migrations, RLS, and Postgres functions |
| `.cursor/rules/naming-conventions.mdc` | File and folder naming (`kebab-case`) |
| `epics/` | Feature epics (auth, tracker, workspace layout) |

When you change a shared rule, update every instruction file that states it so the tools stay in agreement.

### Verify your setup

1. `yarn install && yarn test` passes.
2. `yarn dev` starts and `/login` loads without a Supabase env error.
3. `git status` does not list `.env`.
4. Ask your agent: *"What are this repo's rules for data access and secrets?"* The answer should mention importing from `@/lib/api/<entity>` only, no direct Supabase or `fetch` calls in UI, and that `SUPABASE_SECRET_KEY` is server-only.

## Routes and access

| Route | Purpose | Access |
|-------|---------|--------|
| `/login` | Sign in | Signed out only (signed-in users go to `/tracker`) |
| `/register` | Finish an invite (set a password) | Public; the invite link signs the user in first |
| `/forgot-password`, `/auth/confirm`, `/auth/update-password` | Password recovery and email links | Public |
| `/auth/sign-out` | Clears a broken, revoked or blocked session | Public |
| `/access-denied`, `/blocked` | Shown when a role can't open a page, or the account is blocked | Public |
| `/terms` | Terms of use | Public |
| `/`, `/dashboard` | Redirect to `/tracker` | Any signed-in role |
| `/tracker` | Time tracking | Any signed-in role |
| `/projects` | Projects (read-only for workers, enforced by RLS) | Any signed-in role |
| `/profile` | User profile settings | Any signed-in role |
| `/crew` | Crew management | Manager, admin |
| `/reports` | Reporting | Manager, admin |
| `/users` | Redirects to `/crew` (user management lives there) | Any signed-in role, then Crew's rule |

Any route not listed needs a session; there is no public-by-default route.

## AI change workflow

How we make a change with an AI agent (Claude Code, Codex, Cursor, Windsurf). The agent does the typing; you own the result. Every step ends with a check you do yourself.

Agent rules live in `CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `.windsurfrules`, and `.cursor/rules/*.mdc`.

### The cycle

#### 1. Plan

Ask the agent to read the relevant code and propose the change **before** it edits anything.

- Give it the goal and the Jira key, e.g. "SBT-43: fix the `set-state-in-effect` lint error in `use-mobile.ts`".
- Check: the plan names the files it will touch and who uses them, keeps the change small, and adds no new dependencies or schema/auth changes without asking.

#### 2. Code

Let the agent make the change on its own branch from `dev` (e.g. `fix/sbt-43-...`).

- Check: no secrets in code, no direct Supabase or `fetch` calls in UI, and file names in kebab-case. See the agent rules.

#### 3. Review the diff

Read every line of `git diff` before you run anything.

- Does the diff do only what the plan said?
- Is the old behavior kept, unless the plan changed it on purpose?
- Are new tests testing real behavior, not just mocks?
- Do the agent's checks pass: `npx eslint <changed files>`, `npx tsc --noEmit`, and `yarn test`?

#### 4. Run

Check it in the real app, not just in tests.

- `yarn build` passes.
- `yarn dev`, then use the feature the way a user would. Unit tests can't show you this.
- Check the `yarn dev` terminal and the browser console for new errors.

#### 5. Review

Open a PR into `dev` that links the Jira ticket, describes the change, and gives "How to verify" steps. A teammate reviews it. Then move the ticket to **To Review** and add a comment with the PR link.

### Worked example: SBT-43

**Change:** `src/hooks/use-mobile.ts` called `setState` directly inside `useEffect`, which the `react-hooks/set-state-in-effect` lint rule flags.

| Step | What happened |
|------|---------------|
| Plan | The agent found the only consumer (`components/ui/sidebar.tsx`) and proposed `useSyncExternalStore` with `matchMedia`, with no new dependencies. The server snapshot returns `false` to keep the old desktop-first render. |
| Code | It rewrote the hook as `subscribe` / `getSnapshot` / `getServerSnapshot` helpers and added `use-mobile.test.ts` (node environment, stubbed `window.matchMedia`). |
| Review the diff | We confirmed `matches` on `(max-width: 767px)` equals the old `innerWidth < 768`, and that cleanup removes the same listener. ESLint, `tsc`, and tests (34) pass. |
| Run | `yarn build` passes. A developer checked it manually: signed in, opened `/dashboard`, and resized the browser across 768px. The sidebar switches between the mobile sheet and the desktop rail, with no new errors in the console or the `yarn dev` terminal. |
| Review | The PR goes into `dev` and links SBT-43. |
