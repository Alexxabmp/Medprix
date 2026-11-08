# Medprix

A full-stack pharmacy management platform built with React 19, TypeScript, Express 5, and Drizzle ORM (PostgreSQL). It streamlines day-to-day operations including point-of-sale activities, real-time inventory and stock tracking, supplier management, purchase order procurement, wholesale invoicing, and embedded financial/operational analytics. Made for Software Engineering 2.

---

## Key Features

- **Role-Based Access Control (RBAC):**
  - **Admin**: Full access across all workspaces, user management, and system administration.
  - **Frontdesk**: Inventory monitoring, supplier directories, procurement orders, and wholesale operations.
  - **Cashier**: Focused dashboard and point-of-sale transactions.
- **Embedded Analytics & Reporting:**
  - Real-time revenue and sales performance metrics.
  - Detailed reports: Sales, Inventory Movement, Stock Valuation, Financial Summary, and Cash Flow.
  - Period filtering (Today, Week, Month, Quarter) and export capabilities.
- **Inventory & Stock Management:**
  - Product catalog with batch tracking, expiry date alerts, and stock level thresholds.
  - Category management and instant search/filtering.
- **Supplier & Procurement Management:**
  - Vendor directory with contact information and supply history.
  - Purchase order creation, status tracking, and fulfillment workflow.
- **Wholesale & Invoicing:**
  - Bulk customer management, transaction records, and invoice generation.
- **API-First Architecture:**
  - OpenAPI 3.0 specification with automated React Query hooks and Zod schema generation via Orval.

---

## Monorepo Architecture

The repository is structured as a TypeScript monorepo using npm/pnpm workspaces:

```text
Medprix/
├── artifacts/
│   ├── api-server/           # Express 5 REST API backend
│   │   ├── src/              # Route handlers, middleware, logger
│   │   └── build.mjs         # esbuild bundling script (Node.js ESM)
│   └── medprix-dashboard/    # React 19 + Vite frontend application
│       └── src/              # Pages, components, hooks, design tokens
├── lib/
│   ├── api-client-react/     # Generated React Query hooks from OpenAPI spec
│   ├── api-spec/             # OpenAPI YAML definition and Orval config
│   ├── api-zod/              # Generated Zod validation schemas
│   └── db/                   # Drizzle ORM schema & PostgreSQL connection pool
├── scripts/                  # Maintenance & utility scripts
├── package.json              # Root workspace manifest & scripts
├── pnpm-workspace.yaml       # pnpm workspace configuration
└── tsconfig.base.json        # Base TypeScript compiler configuration
```

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS v4, Radix UI primitives, Lucide React, Wouter, TanStack React Query, Recharts.
- **Backend:** Node.js 24, Express 5, TypeScript, esbuild, Pino logging (`pino-http`, `pino-pretty`).
- **Database & ORM:** PostgreSQL 15+, Drizzle ORM, Drizzle Kit.
- **Validation & Codegen:** Zod, Orval (OpenAPI to React Query + Zod).

---

## Prerequisites

- **Node.js**: `v20.x` or `v24.x` (recommended)
- **Package Manager**: `npm` (v10+) or `pnpm` (v9+)
- **Docker**: Docker Desktop (optional, for local development)

---

## Local development

Install **Node.js 24** and **Docker Desktop**. Keep Docker Desktop running, and run the commands below from the repository root.

### 1. Install dependencies

```sh
npm install
```

### 2. Set up your environment

If `.env` does not exist yet, create it by running **one** of the following commands based on your terminal:

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env
```

**Git Bash / macOS / Linux:**
```sh
cp .env.example .env
```

Open `.env` and replace `SESSION_SECRET` with a random value of at least 32 characters. The default `DATABASE_URL` is already configured for the local Docker setup.

**Note:** If `.env` already exists, skip the copy command and update the existing  `.env` file instead.

### 3. Start and initialize Postgres

```sh
docker compose up -d --wait
npm run db:migrate -- apply
npm run db:seed
```

Docker creates Postgres 17, the `medprix` user, and the `medprix_local_test` database on port **55432**. Migrations create the tables. Seeding adds sample data and login accounts. No separate Postgres installation or manual database creation is needed.

### 4. Start the app

```sh
npm run dev
```

- Dashboard: http://localhost:3000
- API: http://localhost:5000

### Daily use

Start the database and app:

```sh
docker compose up -d --wait
npm run dev
```

Press **Ctrl+C** to stop the app, then stop the database:

```sh
docker compose down
```

Your database data is kept between restarts. Run `npm run db:migrate -- apply` after pulling changes that add migrations. Seeding is only needed for sample data during initial setup.

## Workspace Scripts Reference

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the API (`:5000`) and dashboard (`:3000`). |
| `npm run db:migrate -- status` | Checks applied and pending migrations. |
| `npm run db:migrate -- plan` | Lists pending migrations without applying them. |
| `npm run db:migrate -- apply` | Applies pending migrations to `DATABASE_URL`. |
| `npm run db:seed` | Adds sample data if users are absent. |
| `npm run build` | Builds the dashboard. |
| `npm run typecheck` | Typechecks the referenced library packages. |
| `npm run codegen --workspace=@workspace/api-spec` | Regenerates API hooks and validation schemas from the OpenAPI spec. |
| `npm run start --workspace=@workspace/api-server` | Starts the bundled production API server. |
| `npm run serve --workspace=@workspace/medprix-dashboard` | Previews the built dashboard. |

## Applying database changes

Check pending migrations, review their SQL in `lib/db/drizzle`, then apply them:

```sh
npm run db:migrate -- plan
npm run db:migrate -- apply
```

This also applies destructive schema changes, including the legacy cashier storage cleanup. Back up data you need first. The cleanup refuses to proceed if `cashier_transactions` still contains rows; export/review those records before proceeding, or reset a disposable local database below.

### Reset the local database (destructive)

To discard **all local database data** and rebuild from scratch, stop the app with **Ctrl+C**, confirm `.env` uses the local Docker database URL above, then run:

```sh
docker compose down -v
docker compose up -d --wait
npm run db:migrate -- apply
npm run db:seed
npm run dev
```

`down -v` deletes the local Postgres volume. Ordinary `docker compose down` keeps your data.

## Troubleshooting

- **Docker cannot connect:** Start Docker Desktop, then retry `docker compose up -d --wait`.
- **Database connection fails:** Run `docker compose ps` and check that `.env` uses the local URL above, including port `55432`. Environment variables set in your terminal override `.env`.
- **Port already in use:** Stop any other app using ports `3000`, `5000`, or `55432`.
- **Compose cannot find its configuration:** Run from the repository root, where `compose.yaml` is located.
