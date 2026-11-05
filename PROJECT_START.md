# Batch Trading & Recovery Desktop App: Project Start Guide

> Put this file in the repo root. In Claude Code, copy the "Rules for the AI agent" section into `CLAUDE.md`. In Antigravity, put it into the project rules / `AGENTS.md`.
> Build **phase by phase**. Never ask the agent to "build everything".

---

## 1. What we are building (my understanding)

A **desktop app** for a trading business (looks like pulses/daal: raw purchase → processing → sale) where:

1. **Purchases** come from suppliers (raw stock, e.g. 1000 kg).
2. Purchases + labour + other costs are grouped into a **Batch** (Batch 1, 2, 3…). The batch gives a **cost per kg**.
3. **Sales** are made *from a batch*. Each sale deducts batch stock and records profit using that batch's cost per kg.
4. **Clients** buy on credit. A **Recovery Officer** collects money on set **recovery dates / routes** and enters the receipt (cash, cheque, bank transfer) with proof.
5. A **Dashboard** shows sales, received, receivable, pending cheques, gross/net profit per batch and per kg.
6. Each sale/purchase prints **2 documents**: Invoice (money) and Challan (delivery, for the rider).
7. Also: expenses, salaries/advances/bonus, users, notifications, daily DB backup.

### How I read the notebook pages

| Notebook | Meaning |
|---|---|
| Invoice: Date, Item, Sale Qty, Rate, Bill Amount | Sale invoice line layout |
| Challan | Delivery note, no prices needed, for the rider |
| "Batch 1: Raw 1000 kg, Rate/1 kg" | Batch creation: input weight, cost per kg |
| "1000 → 800" next to Balai | **Yield**: 1000 kg raw produces ~800 kg sellable (loss from cleaning/processing) *(please confirm)* |
| Purchase 200 bags × 250 = 50,000, Balai (labour) 400, etc. → total 79,000 | Batch cost = purchase + labour + other costs |
| "Cost Rate / Profit / Party" | Per-sale: batch cost rate, sale rate, profit, client |
| Sale Posting Record: Gohar, 5/11, 5000 | Sale on date to client, with amount |
| Recovery Dali / Recovery date | Recovery schedule per client |
| Return | Sale return (stock must go back to the batch) |

> ⚠️ Important design consequence: **sellable kg ≠ raw kg**. Batch cost per kg = *total batch cost ÷ sellable output kg*, not ÷ raw kg. Without this, profit is overstated.

---

## 2. Recommended tech stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Simple, fast, shared types |
| Backend | **NestJS** (REST) | As requested; runs inside Electron as a child process |
| Frontend | **React + Vite + TypeScript** | Fast dev |
| UI kit | **shadcn/ui + Tailwind**, **TanStack Table**, **TanStack Query**, **React Hook Form + Zod** | Clean, Claude-desktop-like look, standard tables/forms |
| Desktop | **Electron** (+ electron-builder installer) | As requested |
| Database | **PostgreSQL** (recommended) | Exact money maths (`NUMERIC`), transactions + row locks for stock, reliable `pg_dump` backups |
| ORM | **Prisma** | Typed, migrations, easy for AI agents |
| Auth | Username + **PIN** (hashed with argon2/bcrypt), JWT access token, role-based permissions | As requested |
| PDF/Print | **Electron `webContents.print` + HTML templates** (or `pdfmake`) | A4 invoice + challan |
| Files | Local folder `userData/uploads` (cheque/receipt proofs), path stored in DB | Offline, simple |
| Scheduler | `@nestjs/schedule` | Daily backup, reminders |

### Database decision (read this)

- **One PC only** → SQLite is simplest (no install). 
- **Several PCs (office + recovery officers' laptops) on the same network** → **PostgreSQL** on one "server" PC; other PCs run Electron as clients pointing to it. 
- **DECIDED:** one PC now, multiple PCs later → **PostgreSQL**, installed locally by the installer today. The API is already a separate process, so going multi-PC later = install Postgres + API on one "server" PC and point the other PCs' Electron clients at it. No rewrite needed. Keep all DB access behind the API (clients never talk to Postgres directly).
- Installer should bundle a portable PostgreSQL (or the setup wizard asks for a connection string).

**Never store money as float.** Use `Decimal(14,2)` in DB and a decimal library in code. Store weights as `Decimal(12,3)`.

---

## 3. Monorepo structure

```
/
├─ apps/
│  ├─ api/            # NestJS
│  ├─ web/            # React (Vite), the UI
│  └─ desktop/        # Electron main/preload, starts api, loads web, installer config
├─ packages/
│  ├─ shared/         # Zod schemas, DTO types, enums, constants (used by api + web)
│  ├─ ui/             # Reusable standard components (DataTable, FormField, PageHeader…)
│  └─ config/         # eslint, tsconfig, prettier
├─ prisma/            # schema.prisma, migrations, seed
├─ CLAUDE.md
├─ PROJECT_START.md
├─ pnpm-workspace.yaml
└─ turbo.json
```

---

## 4. Core business rules (the heart of the app)

### 4.1 Batch costing
```
batch_total_cost = Σ purchase items allocated + Σ labour + Σ other batch expenses (rent, fuel, packing…)
output_kg        = raw_kg_used − wastage_kg          (or entered directly as final output)
cost_per_kg      = batch_total_cost / output_kg
```
- Batch statuses: `DRAFT → OPEN → CLOSED`. Costs can be edited only while not closed. Closing locks cost per kg.
- Purchased raw stock is **allocated** to a batch (a purchase line can be split across batches). Raw stock left unallocated stays in "raw inventory".

### 4.2 Sale from batch
```
line_amount   = qty_kg × sale_rate
line_cogs     = qty_kg × batch.cost_per_kg
line_profit   = line_amount − line_cogs
```
- A sale line **must** reference a batch. Block the sale if batch stock < qty (allow override only with permission).
- Every stock change writes a row in **`stock_movements`** (append-only log): `batch_id, type (PURCHASE_IN / PRODUCTION / SALE_OUT / RETURN_IN / ADJUSTMENT / WASTAGE), qty, ref_type, ref_id, user, timestamp`. 
- Current batch stock = sum of its movements. Never overwrite a stock number directly.

### 4.3 Ledgers (clients and suppliers)
- Use **one ledger table per party type** (or one generic `ledger_entries`) with `debit`, `credit`, `balance`, `ref_type`, `ref_id`.
- Client: sale = debit (receivable), payment received = credit, sale return = credit.
- Supplier: purchase = credit (payable), payment made = debit.
- Entries are **never edited or deleted**. To fix a mistake, post a reversal entry. 

### 4.4 Payments & proof
- Methods: `CASH`, `CHEQUE`, `BANK_TRANSFER`, (optional) `ONLINE_WALLET`.
- Cheque: number, bank, cheque date, status `RECEIVED → DEPOSITED → CLEARED / BOUNCED`. A bounced cheque reverses the credit and notifies.
- **Proof required**: cheque / transfer = uploaded image (mandatory). Cash = system-generated **payment receipt** (printable).
- Payment can be allocated against specific invoices or kept as "on account".

### 4.5 Recovery module
- Each client has: `recovery_day(s)`, `route`, `assigned_officer`, `promised_date`.
- **Recovery Route** = named group of clients (e.g. "Saddar Route") with an assigned officer.
- Officer's daily screen: *"Today's recoveries"* = clients due today + overdue, with outstanding amount, last payment, last note.
- Officer creates a **Recovery Entry**: client, amount, method, proof, remarks, **next promised date**. This posts to the client ledger.
- Statuses per visit: `COLLECTED / PARTIAL / PROMISED / NOT_AVAILABLE / REFUSED`.
- Suggested extras: aging buckets (0-7, 8-30, 31-60, 60+ days), officer collection report, promise-vs-actual report.

### 4.5a Units of measure (decided: items can use different units)
- Every item has a **base unit** (default KG) and optional **alternate units** with a conversion factor (e.g. Bag = 50 kg, Maund = 40 kg, Ton = 1000 kg).
- If bag weight is not fixed, the purchase/sale line stores the **actual kg** entered for that line (bag count is informational).
- **All stock, costing and profit are calculated in the base unit.** Each line stores: `entered_qty`, `entered_unit`, `qty_base`, `rate_per_entered_unit`, `rate_per_base`. Display uses the unit the user entered; reports can switch to base unit.
- Cost per base unit is the single source of truth for profit.

### 4.5b Wastage as percentage (decided)
- Batch form accepts `wastage_percent` **or** `wastage_kg` (either one calculates the other).
- `wastage_kg = raw_kg × wastage_percent / 100`, `output_kg = raw_kg − wastage_kg`.
- When the batch is closed, the user can enter the **actual output** after weighing; the system recalculates actual wastage % and cost/kg, and shows the difference from the planned figure.
- Wastage movement is logged in `stock_movements` as type `WASTAGE`.

### 4.5c Returns (best-practice design)

**Principle: a return is a new, linked document. Never edit or delete the original invoice.**

*Void vs return:* if the goods were never delivered, **void** the invoice (full reversal, needs reason + permission). Once delivered, always use a **Return**.

**Sale Return (Credit Note)**
1. Must be created **from the original invoice** (pick the invoice, then the lines). Standalone returns are not allowed.
2. Per line: `return_qty ≤ sold_qty − already_returned_qty` (the system blocks over-returns, partial and multiple returns are allowed).
3. **Return rate = original invoice rate** (including its proportional discount and tax). Rate cannot be changed. Optional "restocking/deduction" amount is a separate visible line.
4. **Reason code is mandatory** (quality, wrong item, short weight, customer cancelled, damaged in transit, other) + free-text note.
5. **Condition per line** decides where the stock goes:
   | Condition | Stock effect | Money effect |
   |---|---|---|
   | `RESALEABLE` | `RETURN_IN` movement into the **same batch** the item was sold from | Reverse sale + reverse COGS |
   | `DAMAGED / UNUSABLE` | No stock back (or `WASTAGE` movement) | Reverse sale; COGS stays as a **loss** (shown as return loss) |
   | `PARTIAL` | Split the line: resaleable part back, damaged part as loss | Both rules above |
6. **Cost on return = the original snapshot `batch_cost_rate`**, never the batch's current cost. This keeps the batch's stock valuation and profit correct, even if the batch is closed (a closed batch only gets quantity back, its cost/kg stays locked).
7. **Money handling.** Return creates a **credit note** that reduces what the client owes. User chooses one of:
   - **Adjust against outstanding invoices** (default), the credit is allocated to the oldest or selected invoices.
   - **Keep as credit on account** (advance balance for the next purchase).
   - **Cash/bank refund**, which creates a `Payment OUT` linked to the credit note (needs proof like any payment, and permission).
   - If the invoice was paid by cheque, the refund is a new payment, never a cheque edit.
8. **Ledger:** credit-note entry (credit to client) linked via `ref_type = SALE_RETURN`. A refund adds the offsetting debit.
9. **Challan:** a **Return Pickup Note** (goods return challan) is printed for the rider, with qty, condition and a client signature box. Stock can be set to "pending receipt" until the store confirms (status `REQUESTED → PICKED_UP → RECEIVED/INSPECTED → POSTED`); the stock and ledger entries are posted only at `POSTED`.
10. **Approval:** permission `sales.return.create`; optional approval threshold (e.g. amount > X needs Manager).
11. **Reports:** every sales and profit report shows **Sales, Returns, Net Sales**, and **net-of-return profit**. Dashboard sales figures are always net of returns. Add a "Returns report" (by client, batch, reason, rider/driver).
12. **Recovery:** outstanding amounts for recovery officers drop automatically after a posted credit note.
13. Dates: the return is posted on its own date. If the original period is already closed, it is booked in the **current** period (never rewrites closed periods).
14. Printing: **Credit Note** (money doc, shown to the client) + **Return Pickup Note** (rider doc).

**Purchase Return (Debit Note)**
1. Created from the original purchase invoice, `return_qty ≤ purchased − returned`.
2. Only stock **not yet consumed** can be returned. Check what is still unallocated in raw inventory. If the raw stock was already allocated to an **OPEN** batch, the allocation is reduced and the batch cost/kg recalculates. If it sits in a **CLOSED** batch, block the return and use a **Supplier claim / adjustment** (a price adjustment on the ledger, no stock move) instead.
3. Stock: `RETURN_OUT` movement. Ledger: debit to supplier (reduces payable).
4. Settlement: adjust against payable, keep as supplier credit, or receive a refund (`Payment IN`).
5. Print a **Debit Note** + **Goods Return Challan**.

**Data model for returns**
```
SaleReturn(id, no, date, sale_id, client_id, status, reason_code, notes, subtotal, tax, deduction, total, settlement_type, created_by, approved_by)
SaleReturnItem(id, return_id, sale_item_id, batch_id, qty_base, entered_qty, entered_unit, rate, tax, condition, cogs_reversed, loss_amount)
PurchaseReturn(id, no, date, purchase_id, supplier_id, status, reason_code, total, settlement_type, ...)
PurchaseReturnItem(id, return_id, purchase_item_id, qty_base, rate, amount)
```
`SaleItem.returned_qty` is a derived total (kept in sync by the service, covered by tests).

**Tests required for returns:** over-return blocked, partial/multiple returns, stock returns to the correct batch at the original cost, damaged goods create a loss, refund vs adjust vs credit-on-account, closed-batch return, ledger balance after return, reports show net sales.

### 4.5d Payroll types (decided)
Employee `pay_type`: `FIXED_MONTHLY`, `DAILY_WAGE`, `PIECE_RATE`.
- Fixed: monthly salary.
- Daily: attendance/days-worked entries × daily rate.
- Piece-rate: work entries (quantity × rate, e.g. kg processed or bags loaded), optionally linked to a **batch** so the labour cost flows into batch cost automatically.
- All types support advances (deducted at settlement), bonus, deductions, overtime, and a printable salary slip.

### 4.5e Optional sales tax (decided)
- Organization setting: `tax_enabled` (off by default), tax name (GST/Sales Tax), default rate, NTN/STRN.
- When enabled: tax % per invoice line (default from item), shown on invoice, included in receivable, reported in a **Tax summary report**. Profit is calculated **excluding tax**. Returns reverse tax proportionally.

### 4.5f Languages (decided: English, Urdu or both)
- App UI language switch: **English / اردو** (i18n with `react-i18next`, RTL layout support).
- Master data has `name` and `name_ur` fields (clients, items, suppliers, org).
- Print language is selectable per document (English, Urdu, or bilingual headings). Fonts: Noto Nastaliq Urdu (or Jameel Noori Nastaleeq) embedded in the app so printing never depends on the PC's fonts.
- Dates/numbers: Western digits by default, optional Urdu digits.

### 4.6 Profit definitions (dashboard)
- **Gross profit** = Σ (sale amount − batch cost of qty sold).
- **Net profit** = Gross profit − operating expenses (rent, bills, fuel, maintenance) − salaries/bonuses in the period.
- Show **profit per kg** and **profit per batch**.

---

## 5. Modules and screens

### 5.1 Setup & auth
1. **First-run wizard** (only when DB has no organization): 
   - Step 1: Organization name, phone, address, email, tax/NTN no., **logo upload**, currency, date format. 
   - Step 2: Admin user: first name, last name, username, PIN (+ confirm). 
   - Step 3: Finish → login. 
2. **Login**: username + PIN. → Dashboard.
3. Roles: `ADMIN`, `MANAGER`, `ACCOUNTANT`, `SALES`, `RECOVERY_OFFICER`, `STORE/RIDER`. Permissions per module (view / create / edit / delete / approve / print). Admin can edit the matrix.
4. Auto-lock after inactivity (optional PIN re-entry).

### 5.2 Sidebar menu (collapsible, Claude-desktop style)
```
Dashboard
Sales
  ├ Sales Invoices
  ├ Sale Returns
  └ Challans
Purchases
  ├ Purchase Invoices
  └ Purchase Returns
Batches
Inventory (batch stock + stock log)
Clients
  ├ Client List
  ├ Client Ledger
  └ Routes
Recovery
  ├ Today's Recovery
  ├ Recovery Entries
  └ Schedule
Suppliers
  ├ Supplier List
  └ Supplier Ledger
Payments & Cheques
Expenses
Payroll (Employees, Advances, Salaries, Bonus)
Reports
Notifications
Users & Roles
Settings (Organization, Print templates, Backup, Numbering)
```
- Sidebar can be hidden/shown (toggle button + shortcut `Ctrl+B`), collapses to icons.
- Bottom of sidebar: user avatar + **3-dot menu** (Profile, Change PIN, Lock, Logout).

### 5.3 Dashboard
- Date filter: **Today / This week / This month / Custom range**.
- Cards: Total Sales, Received, Receivable (outstanding), Pending Cheques (count + amount), Gross Profit, Net Profit, Expenses.
- Table: **Batch performance**: batch, kg sold, remaining kg, avg cost/kg, avg sale/kg, profit/kg, total profit.
- Lists: Cheques due for deposit (next 7 days), Today's recovery due, Overdue clients (top 10), Low batch stock.
- Charts: keep to 2 simple ones (sales vs received per day; profit by batch).

### 5.4 Detailed Sales Report (page 2 of notebook)
Columns: `Date | Invoice ID | Challan ID | Batch | Item | Client | Batch cost/kg | Sale rate/kg | Qty (kg) | Amount | Cost | Profit/Loss | Profit/kg | Payment status | Salesperson`
- Filters: date range, batch, client, item, route, salesperson, paid/unpaid.
- Totals row at the bottom. Export **Excel + PDF + print**.

### 5.5 Other reports (recommended)
Client ledger, supplier ledger, receivable aging, recovery by officer, cheque register, batch profitability, stock position, expense summary, salary sheet, daily cash book, day-end closing.

---

## 6. Database model (starting point for Prisma)

```
Organization(id, name, logo_path, address, phone, email, tax_no, currency, settings_json)
User(id, first_name, last_name, username UNIQUE, pin_hash, role_id, is_active, employee_id?, last_login)
Role(id, name) · Permission(id, module, action) · RolePermission(role_id, permission_id)

Supplier(id, name, phone, address, opening_balance, is_active)
Client(id, name, phone, address, route_id?, officer_id?, recovery_day, credit_limit, opening_balance, is_active)
Route(id, name, officer_id)

Item(id, name, unit='KG', is_active)                 -- e.g. Daal types

PurchaseInvoice(id, no, date, supplier_id, total, paid, status, notes)
PurchaseItem(id, purchase_id, item_id, bags, kg, rate_per_kg, amount)

Batch(id, no, name, date, status, raw_kg, wastage_kg, output_kg, total_cost, cost_per_kg, closed_at)
BatchSource(id, batch_id, purchase_item_id, kg_used, amount)      -- allocation of purchases
BatchCost(id, batch_id, type[LABOUR|RENT|FUEL|PACKING|OTHER], description, amount, date)

SaleInvoice(id, no, date, client_id, subtotal, discount, total, received, status, salesperson_id)
SaleItem(id, sale_id, batch_id, item_id, qty_kg, rate, amount, batch_cost_rate, cogs, profit)  -- snapshot cost at sale time!
Challan(id, no, sale_id, rider_id, vehicle, delivered_at, status)
SaleReturn(id, no, sale_id, ...) · SaleReturnItem(...)

StockMovement(id, batch_id, type, qty_kg, ref_type, ref_id, user_id, created_at, note)   -- append-only

Payment(id, no, direction[IN|OUT], party_type, party_id, method, amount, date, user_id, notes)
PaymentAllocation(id, payment_id, invoice_type, invoice_id, amount)
Cheque(id, payment_id, cheque_no, bank, cheque_date, status, deposit_date, cleared_date)
Attachment(id, owner_type, owner_id, file_path, mime, uploaded_by, created_at)

LedgerEntry(id, party_type, party_id, date, ref_type, ref_id, debit, credit, balance, narration)

RecoverySchedule(id, client_id, next_date, expected_amount, officer_id, status)
RecoveryEntry(id, client_id, officer_id, date, amount, method, payment_id?, outcome, next_promised_date, remarks)

ExpenseCategory(id, name) · Expense(id, date, category_id, amount, paid_by, batch_id?, notes, attachment)
Employee(id, name, cnic, phone, designation, salary, join_date, is_active)
SalaryAdvance(id, employee_id, date, amount, notes)
SalaryRecord(id, employee_id, month, basic, advance_deducted, bonus, deductions, net, paid_on)

Notification(id, type, title, body, due_at, is_read, user_id?, ref_type, ref_id)
BackupLog(id, started_at, finished_at, path, size, status, type[AUTO|MANUAL], error)
AuditLog(id, user_id, action, entity, entity_id, before_json, after_json, created_at)
NumberSequence(id, doc_type, prefix, next_no, year)    -- invoice/challan/receipt numbering
```
**Key rule:** `SaleItem.batch_cost_rate` is copied at sale time so later changes never rewrite past profit.

---

## 7. Printing (2 documents per transaction)

| Document | Audience | Contains |
|---|---|---|
| **Invoice** | Client / accounts | Org logo, invoice no, date, client, items (batch optional), rate, amount, previous balance, total due, signature lines |
| **Challan** | Rider / receiver | Challan no, linked invoice no, client + address + phone, items & **kg only (no prices)**, vehicle/rider, "received by" signature box |
| **Payment receipt** | Client | For cash payments (system generated), receipt no, amount, officer, date |

- A4 + optional 80 mm thermal receipt layout.
- Reprints are marked "DUPLICATE".
- Templates are HTML/CSS, so you can change them without touching logic.

---

## 8. Notifications

- Cheque due for deposit (3 days, 1 day, today).
- Cheque bounced / cleared.
- Client recovery due today / overdue.
- Backup success or failure; "no backup for 24 h" warning.
- Low batch stock; batch open for too long.
- Credit limit exceeded.
- In-app bell icon + OS desktop notification (Electron `Notification`). A scheduler runs every hour.

---

## 9. Backup system

- **Auto daily** backup (time configurable) using `pg_dump` → compressed `.zip` containing the SQL dump **and the uploads folder** (proof images!).
- Keep last N (e.g. 30) backups, auto-delete older.
- **Manual backup** button, **Restore** screen (admin only, confirmation + auto "pre-restore" backup).
- Destination: local folder + optional second location (USB / network share / Google Drive folder).
- Log every backup in `BackupLog`, notify on failure.
- Restore must be tested during Phase 9, not left until last.

---

## 10. UI / UX standards (apply everywhere)

- **Look**: calm, neutral, Claude-desktop-like. Light theme first (dark optional). Fonts: **Inter** (UI) + **Noto Nastaliq Urdu / Jameel Noori** only where Urdu text is needed. Base size 14 px. Lots of whitespace, thin borders, no gradients or heavy shadows.
- **Reusable components** (build once in `packages/ui`, then use everywhere):
  - `AppShell` (sidebar + topbar), `PageHeader` (title + primary action)
  - `DataTable` (Excel-like: compact rows, sticky header, column sort, resize/show-hide columns, zebra optional, row click → detail, keyboard nav)
  - `FilterBar` (search box, date range, selects, "Clear" button), always directly under the page header
  - `Pagination` (bottom: rows per page 10/25/50/100, "1-25 of 340", first/prev/next/last). **Server-side pagination on every list.**
  - `FormField`, `TextInput`, `NumberInput` (kg/rate/amount), `Select` / searchable `Combobox`, `DatePicker`, `FileUpload` (image preview), `MoneyText`
  - `ConfirmDialog`, `Drawer`/`Dialog` for quick-add forms, `Toast`, `EmptyState`, `StatusBadge`
- **Forms**: one standard layout: label above field, 2-column grid, required `*`, inline validation, `Save` / `Save & New` / `Cancel`. Line-item grids (invoice items) behave like a spreadsheet: Tab/Enter moves to next cell, Add row on last Enter.
- **Keyboard first**: `Ctrl+N` new, `Ctrl+S` save, `Ctrl+P` print, `Ctrl+K` quick search, `Esc` close.
- Numbers: right-aligned, thousand separators, 2 decimals for money, 3 for kg. Negative/overdue in muted red, not bright.
- Every list: search + filters + export + pagination. Every form: same components. No one-off styling.

---

## 11. Important things you did not mention (recommended additions)

**Must have**
1. **Sale returns / purchase returns** (the notebook has "Return"): stock goes back to the batch and ledger reverses.
2. **Yield/wastage** tracking per batch, as explained above.
3. **Audit log** (who changed what), essential with multiple users handling money.
4. **Document numbering** (INV-2026-0001, CH-…, PAY-…) with no gaps and no duplicates.
5. **No delete, only cancel/void** for invoices, payments and ledger entries (with reason).
6. **Opening balances** for clients/suppliers/stock, so you can start using the app mid-year.
7. **Financial year / day-end closing**: lock old dates so records cannot be changed silently.
8. **Credit limit** per client + warning on sale.
9. **Discount / extra charges** (loading, freight) on invoice.
10. **Backups that include uploaded proofs.**
11. **Cheque lifecycle** (received → deposited → cleared/bounced) and bounce handling.
12. **Role-based permissions** (the recovery officer should only see their own route and not profit figures).

**Strongly recommended**
13. Recovery officer **daily collection report + cash handover** (officer collected X, handed Y to the office).
14. **Partial payment allocation** to specific invoices.
15. **Client statement** printable/PDF (and WhatsApp share as a file).
16. **Rider/vehicle** assignment on challan + delivery confirmation.
17. **Price list / last rate** shown when you select a client + batch.
18. **Batch stock adjustment** with reason (spillage, theft, count correction).
19. **Excel import** for opening clients/suppliers and **Excel export** on every list.
20. **Cash book / daily closing** (cash in hand vs expected).
21. App **auto-update** and a **DB migration** step at startup so future versions upgrade safely.
22. **Urdu support**: Urdu names for clients/items, and optionally an Urdu print layout. Test RTL printing early.
23. **Multi-branch / multi-organization** is *not* needed now, but the `organization_id` column on main tables keeps the door open.
24. Optional later: SMS/WhatsApp reminders for recovery, barcode/QR on challan, mobile app for recovery officers.

---

## 12. Build phases (give the agent one phase at a time)

| Phase | Deliverable | Done when |
|---|---|---|
| **0** | Monorepo scaffold, lint/format, Prisma + Postgres, Electron boots API + web | `pnpm dev` opens desktop window |
| **1** | Shared UI kit (AppShell, DataTable, FilterBar, Pagination, forms), theme, collapsible sidebar | A demo list + form page uses only standard components |
| **2** | First-run organization setup, admin creation, login (PIN), roles/permissions, user management | Fresh install → wizard → login → empty dashboard |
| **3** | Suppliers, items, purchase invoices, supplier ledger, payments out | Purchase posts ledger entry |
| **4** | **Batches**: allocate purchases, labour/other costs, wastage, cost/kg, stock log | Batch shows correct cost/kg and stock |
| **5** | Clients, routes, sales invoices from batches, stock deduction, client ledger, returns | Sale reduces batch stock; profit snapshot saved |
| **6** | Payments in, cheques, proof upload, receipts, ledger allocation | Cheque status flow works |
| **7** | Recovery schedule, officer daily screen, recovery entries, aging | Officer records collection → ledger updates |
| **8** | Printing: invoice, challan, receipt | All three print correctly (A4, Urdu OK) |
| **9** | Expenses, employees, advances, salaries, bonus | Net profit includes them |
| **10** | Dashboard + detailed sales report + other reports + exports | Numbers reconcile with ledgers |
| **11** | Notifications + scheduler | Cheque/recovery alerts fire |
| **12** | Backup/restore, audit log, installer (electron-builder), auto-update, hardening | Install on clean PC, backup, restore, verified |

**Testing priorities** (write automated tests for these first): batch cost/kg, stock movements, sale profit, ledger balances, cheque bounce reversal, returns.

---

## 13. Rules for the AI agent (copy into `CLAUDE.md` / project rules)

```
PROJECT: Desktop app: NestJS + React (Vite) + Electron + PostgreSQL (Prisma), pnpm + Turborepo monorepo.

GENERAL
- TypeScript strict everywhere. Shared Zod schemas live in packages/shared and are used by both api and web.
- Work only on the current phase from PROJECT_START.md. Do not build ahead.
- Before coding a phase: list the files you will create/change and wait for my OK on big decisions.
- After coding: run lint, typecheck, tests; fix errors; summarise what changed.

MONEY & STOCK
- Never use float for money or weight. Use Prisma Decimal / decimal.js. Money 2 dp, kg 3 dp.
- Stock changes ONLY by inserting rows in stock_movements inside a DB transaction. Never edit a stock number directly.
- Ledger entries are append-only. Corrections = reversal entries. Documents are cancelled/voided, never hard-deleted.
- Sale items store a snapshot of batch cost rate at sale time.
- All multi-table writes use prisma.$transaction. Use row locking (SELECT ... FOR UPDATE) when reducing batch stock.

BACKEND (NestJS)
- Modules per domain (auth, users, org, suppliers, clients, purchases, batches, sales, payments, recovery, expenses, payroll, reports, notifications, backup).
- Controllers thin, logic in services. DTO validation with Zod. Consistent response + error format.
- Every list endpoint: server-side pagination (page, pageSize), sorting, filtering, search. Returns { data, total, page, pageSize }.
- Permission guard on every route. Write AuditLog for create/update/cancel on financial entities.

FRONTEND (React)
- Use ONLY components from packages/ui (DataTable, FilterBar, Pagination, FormField, etc.). If a component is missing, add it to packages/ui first. No one-off styles.
- Every list page = PageHeader + FilterBar + DataTable + Pagination (bottom). Every form uses the standard form layout.
- Excel-like compact tables, calm neutral theme, Inter font, 14px base. No heavy gradients/shadows/animations.
- TanStack Query for data, React Hook Form + Zod for forms. Keyboard shortcuts as defined in section 10.

ELECTRON
- Main process starts the Nest API on a random free localhost port, waits for health check, then loads the web app. contextIsolation on, nodeIntegration off, expose minimal API via preload.
- File uploads and backups under app.getPath('userData').

QUALITY
- Write unit tests for costing, stock, ledger and profit logic before the UI.
- Seed script creates demo data for development only.
```

---

## 14. First prompt to give the agent (Phase 0)

```
Read PROJECT_START.md fully. Start Phase 0 only:
1. Create a pnpm + Turborepo monorepo with apps/api (NestJS), apps/web (React+Vite+TS+Tailwind+shadcn/ui), apps/desktop (Electron), packages/shared, packages/ui, packages/config.
2. Add Prisma with PostgreSQL in /prisma, a docker-compose.yml for local Postgres in dev, and a first migration with Organization and User tables.
3. Electron main process should start the Nest API (random free port), wait for /health, and open the web app in a window. Add dev scripts: `pnpm dev` starts everything.
4. Add ESLint, Prettier, strict tsconfig, husky + lint-staged.
5. Add a README with run instructions.
Show me the folder tree and the commands to run when done. Do not start Phase 1.
```

---

## 15. Confirmed decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Deployment | Single PC now, architecture ready for multi-PC (API separate from DB and UI) |
| 2 | Units | Multiple units per item with conversion to a base unit (section 4.5a) |
| 3 | Batch/sales | One batch from many purchases and items; one invoice with lines from many batches |
| 4 | Wastage | Entered as % (or kg) per batch (section 4.5b) |
| 5 | Payroll | Fixed, daily and piece-rate (section 4.5d) |
| 6 | Language | English, Urdu or both (section 4.5f) |
| 7 | Recovery officer | Same PC for now, role-based login ready for other PCs |
| 8 | Sales tax | Optional, off by default (section 4.5e) |
| 9 | Returns | Credit/debit note approach (section 4.5c) |

## 16. Remaining questions (can be decided later, defaults shown)

1. **Returned goods:** are they usually resaleable, or often damaged? *(Default: user picks condition per return.)*
2. **Refunds:** do you ever refund cash, or only reduce the client's balance? *(Default: both allowed, cash refund needs permission.)*
3. **Bag weight:** is a bag always a fixed weight per item, or does it vary per purchase? *(Default: fixed default per item, editable per line.)*
4. **Recovery officer commission/target:** do officers get commission on collections? *(Default: not included, can be added in Phase 7.)*
5. **Sales tax rates:** if you use tax, one rate or several? *(Default: single rate, per-line override.)*
