# Mini ERP — Batch Trading & Recovery Desktop App

Desktop application for a batch-based trading business (purchases → batches → sales → recovery).

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **API:** NestJS (`apps/api`)
- **UI:** React + Vite + TypeScript + Tailwind CSS (`apps/web`)
- **Desktop:** Electron (`apps/desktop`)
- **Database:** PostgreSQL + Prisma 7 (`prisma/`)
- **Shared packages:** `@mini-erp/shared` (Zod schemas & DTO types), `@mini-erp/ui` (standard UI kit), `@mini-erp/config` (ESLint, TypeScript, Prettier)

## Structure

```
/
├─ apps/
│  ├─ api/            NestJS REST API (spawned by Electron on a random free localhost port)
│  ├─ web/            React + Vite + TypeScript UI
│  └─ desktop/        Electron main & preload process
├─ packages/
│  ├─ shared/         Shared Zod schemas, constants, and DTO types
│  ├─ ui/             Reusable standard UI components
│  └─ config/         Shared ESLint, TypeScript, and Prettier configs
├─ prisma/
│  ├─ schema.prisma   Prisma schema (PostgreSQL, gapless integer IDs)
│  ├─ migrations/     SQL migrations
│  └─ dev/            Dev database init scripts (creates mini_erp_test)
├─ docker-compose.yml Local PostgreSQL 17 for development
└─ prisma.config.ts   Prisma 7 configuration
```

## Prerequisites

- **Node.js** `>= 22.12`
- **pnpm** `11.x`
- **Docker** (for local development & test PostgreSQL databases)

## Quick Start (Development)

1. **Copy environment file:**

   ```bash
   cp .env.example .env
   ```

2. **Install dependencies (also generates the Prisma client):**

   ```bash
   pnpm install
   ```

3. **Start local PostgreSQL via Docker:**

   ```bash
   pnpm db:up
   ```

4. **Apply database migrations:**

   ```bash
   pnpm db:migrate
   ```

5. **Start the app (builds shared/api in watch mode, starts Vite, and opens the Electron desktop window):**
   ```bash
   pnpm dev
   ```

## Scripts

| Command                       | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                    | Starts shared watch, API watch, Vite dev server, and Electron window |
| `pnpm build`                  | Builds all packages and apps                                         |
| `pnpm lint`                   | Runs ESLint across all workspaces                                    |
| `pnpm typecheck`              | Runs `tsc --noEmit` across all workspaces                            |
| `pnpm test`                   | Runs unit tests (Vitest) across all workspaces                       |
| `pnpm test:integration`       | Runs integration tests against `DATABASE_URL_TEST` (`mini_erp_test`) |
| `pnpm format`                 | Formats repository with Prettier                                     |
| `pnpm db:up` / `pnpm db:down` | Starts / stops local PostgreSQL container                            |
| `pnpm db:generate`            | Generates Prisma client into `apps/api/src/generated/prisma`         |
| `pnpm db:migrate`             | Runs Prisma migrations in development                                |
