# AGENTS.md

Instructions for AI coding agents working in this repository.
Full requirements are in `PROJECT_START.md`. **Read it before starting any task.**

## Project

Desktop app for a batch-based trading business (purchases → batches → sales → recovery).
Stack: **pnpm + Turborepo monorepo**, **NestJS** API, **React + Vite + TypeScript** UI, **Electron** shell, **PostgreSQL + Prisma**.

```
apps/api       NestJS
apps/web       React (Vite) UI
apps/desktop   Electron main/preload + installer config
packages/shared  Zod schemas, DTO types, enums, constants (used by api and web)
packages/ui      Standard reusable components (DataTable, FilterBar, Pagination, forms)
packages/config  eslint, tsconfig, prettier
prisma/          schema, migrations, seed
```

## How to work

1. **One phase at a time.** Work only on the phase I name from section 12 of `PROJECT_START.md`. Do not build ahead, and do not refactor unrelated code.
2. **Plan first.** Before coding, give a short plan: files to create or change, and any decision you are unsure about. Wait for my answer on anything that affects money, stock, ledgers or the database schema.
3. **Small steps.** Prefer small, reviewable changes over one giant change.
4. **Verify.** After coding, run lint, typecheck and tests. Fix failures. Then summarise what changed, what you tested and anything left undone.
5. **Never guess requirements.** If something is not in `PROJECT_START.md`, ask me. Do not invent business rules.
6. **Do not** delete or rewrite existing migrations, run destructive database commands, add large new dependencies, or change the folder structure without asking.
7. Do not commit secrets. Use `.env` (git-ignored) and keep `.env.example` updated.

## Money, stock and ledger rules (critical)

- **Never use floating point for money or weight.** Use Prisma `Decimal` and `decimal.js`. Money has 2 decimal places, base-unit quantity (kg) has 3.
- All stock, cost and profit calculations are in the item's **base unit**. Lines also store the entered quantity and unit for display.
- **Stock changes only by inserting rows into `stock_movements`**, inside a DB transaction. Never edit a stock number directly. Current stock is the sum of movements.
- Ledger entries are **append-only**. Fix mistakes with reversal entries.
- Invoices, payments and returns are **cancelled or voided with a reason**, never hard-deleted.
- Sale lines **store a snapshot** of the batch cost rate at sale time. Profit uses the snapshot, never the batch's current cost.
- Batch cost per unit = total batch cost ÷ **output** quantity (after wastage), not raw quantity.
- Any write touching several tables uses `prisma.$transaction`. Reducing batch stock must lock the row (`SELECT ... FOR UPDATE`) to prevent overselling.
- Returns are separate linked documents (credit note / debit note) created from the original invoice. Return quantity can never exceed sold minus already returned. Returned stock goes back to the **same batch at the original snapshot cost**. See section 4.5c of `PROJECT_START.md`.
- Document numbers (invoice, challan, receipt, return) come from `NumberSequence`, with no gaps and no duplicates.
- Closed periods and closed batches are locked. Changes after closing are booked in the current period.

## Backend (NestJS)

- One module per domain: auth, users, org, suppliers, clients, items, purchases, batches, sales, returns, payments, recovery, expenses, payroll, reports, notifications, backup.
- Controllers stay thin; business logic lives in services. Costing, stock and ledger logic live in dedicated, unit-tested services.
- Validate every input with the Zod schemas from `packages/shared`.
- Every list endpoint supports server-side `page`, `pageSize`, sorting, filtering and search, and returns `{ data, total, page, pageSize }`.
- Every route is protected by an auth guard and a permission guard. Write an `AuditLog` entry for create, update and cancel actions on financial records.
- Consistent error format. Never expose stack traces to the UI.
- PINs are hashed (argon2 or bcrypt). Never log PINs or tokens.

## Frontend (React)

- Use **only** components from `packages/ui`. If one is missing, add it to `packages/ui` first, then use it. No one-off styling.
- Every list page = `PageHeader` + `FilterBar` + `DataTable` + `Pagination` (at the bottom). Every form uses the standard form layout (label above field, 2-column grid, required marker, inline validation, Save / Save & New / Cancel).
- Look: calm and neutral, similar to the Claude desktop app. Tailwind + shadcn/ui, Inter font, 14px base size, thin borders, compact Excel-like table rows. No heavy gradients, shadows or animation.
- Sidebar is collapsible (button and `Ctrl+B`), with a user section and 3-dot menu at the bottom.
- Data fetching with TanStack Query, forms with React Hook Form + Zod, tables with TanStack Table.
- Keyboard shortcuts: `Ctrl+N` new, `Ctrl+S` save, `Ctrl+P` print, `Ctrl+K` search, `Esc` close. Spreadsheet-like line-item grids (Tab/Enter moves to next cell).
- All user-facing text goes through i18n (`en` and `ur`). Support RTL layout. Never hard-code UI strings.
- Numbers right-aligned with thousand separators.

## Electron

- The main process starts the Nest API on a random free localhost port, waits for the health check, then loads the web app.
- `contextIsolation: true`, `nodeIntegration: false`. Expose only a minimal API through the preload script.
- Uploaded proofs and backups live under `app.getPath('userData')`. The database is only reached through the API.
- Printing uses HTML templates (invoice, challan, receipt, credit note, return pickup note) with bundled Urdu fonts.

## Testing

Write tests **before or together with** the UI for these:
- batch cost per unit (including wastage %)
- stock movements and stock never going negative
- sale profit using the snapshot cost
- ledger balances (sale, payment, return, refund)
- cheque lifecycle including bounce reversal
- sale and purchase returns (over-return blocked, partial returns, damaged goods, closed batch)
- numbering sequences

Use Vitest or Jest for units, and a test database for integration tests. Never run tests against my real data.

## Conventions

- TypeScript `strict` everywhere. No `any` unless commented why.
- Names: files `kebab-case`, React components `PascalCase`, DB tables `snake_case`.
- Commits: small, with clear messages (`feat(batches): ...`, `fix(sales): ...`).
- Add or update docs and `.env.example` when you add configuration.
- Seed data is for development only and must never run in production.

## Definition of done (every task)

- [ ] Works as described in `PROJECT_START.md`
- [ ] Lint, typecheck and tests pass
- [ ] Uses the standard components and i18n
- [ ] Permissions and audit log applied where required
- [ ] Short summary given: what changed, how to test it, known gaps
