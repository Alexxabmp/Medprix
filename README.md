# Medprix — Pharmacy Operations & Management Dashboard

A full-stack pharmacy management platform built with React 19, TypeScript, Express 5, and Drizzle ORM (MySQL). It streamlines day-to-day operations including point-of-sale activities, real-time inventory and stock tracking, supplier management, purchase order procurement, wholesale invoicing, and embedded financial/operational analytics. Made for Software Engineering 2.

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
│   └── db/                   # Drizzle ORM schema & MySQL connection pool
├── scripts/                  # Maintenance & utility scripts
├── package.json              # Root workspace manifest & scripts
├── pnpm-workspace.yaml       # pnpm workspace configuration
└── tsconfig.base.json        # Base TypeScript compiler configuration
```

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS v4, Radix UI primitives, Lucide React, Wouter, TanStack React Query, Recharts.
- **Backend:** Node.js 24, Express 5, TypeScript, esbuild, Pino logging (`pino-http`, `pino-pretty`).
- **Database & ORM:** MySQL 8.0+, Drizzle ORM, Drizzle Kit.
- **Validation & Codegen:** Zod, Orval (OpenAPI to React Query + Zod).

---

## Prerequisites

- **Node.js**: `v20.x` or `v24.x` (recommended)
- **Package Manager**: `npm` (v10+) or `pnpm` (v9+)
- **Database**: `MySQL 8.0+`

---

## Environment Configuration

Runtime configuration is read from process environment variables.

For local development, keep an uncommitted `.env` file at the repository root, next to `.env.example`, as your personal source of values. Before running API or database commands, load those values into your shell/session or provide them through your process manager, terminal profile, IDE run configuration, Docker Compose, or deployment secrets.

### Required Environment Variables

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | MySQL connection string for Drizzle ORM | `mysql://root:password@localhost:3306/medprix` |
| `SESSION_SECRET` | Secret used to sign login session cookies. Required in production. | `use-a-long-random-secret` |

### Optional / Service-Specific Variables

| Variable | Target Service | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | `api-server` | `5000` | HTTP port for the Express backend |
| `PORT` | `medprix-dashboard` | `5173` (dev) / `3000` (prod) | HTTP port for the Vite web server |
| `NODE_ENV` | Global | `development` | Runtime environment (`development` / `production`) |
| `LOG_LEVEL` | `api-server` | `info` | Pino logging level (`trace`, `debug`, `info`, `warn`, `error`) |
| `CORS_ORIGIN` | `api-server` | Local dev origins only outside production | Comma-separated allowed frontend origins for credentialed requests |
| `SESSION_TTL_SECONDS` | `api-server` | `28800` | Login session lifetime in seconds |
| `BCRYPT_SALT_ROUNDS` | `api-server` | `12` | Bcrypt work factor, clamped between `10` and `14` |
| `BASE_PATH` | `medprix-dashboard` | `/` | Base URL path for frontend assets |

---

## Development Setup

### 1. Install Dependencies

From the root directory, install all dependencies across the monorepo:

```bash
# Using npm:
npm install

# Or using pnpm:
pnpm install
```

### 2. Configure Environment Variables

Create a local `.env` file at the repository root if you want a file-based reference:

```bash
cp .env.example .env
```

Do not commit `.env`. Load the needed values into your shell before running workspace scripts:

```bash
# Windows PowerShell
$env:DATABASE_URL="mysql://root:yourpassword@localhost:3306/medprix"
$env:SESSION_SECRET="replace-with-a-long-random-secret"

# Linux / macOS Bash / Git Bash
export DATABASE_URL="mysql://root:yourpassword@localhost:3306/medprix"
export SESSION_SECRET="replace-with-a-long-random-secret"
```

### 3. Initialize the Database

Push the Drizzle ORM schema to your MySQL database

```bash
npm run push --workspace=@workspace/db
```

Or using `pnpm`:

```bash
pnpm --filter @workspace/db run push
```

### 4. Run in Development Mode

Run both the API server and frontend dashboard concurrently with hot reload:

```bash
# Using npm:
npm run dev

# Or using pnpm:
pnpm run dev
```

This starts:
- **API Server:** `http://localhost:5000` (health check: `http://localhost:5000/api/healthz`)
- **Frontend Dashboard:** `http://localhost:5173`

---

## Workspace Scripts Reference

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs API server (`:5000`) and Vite dashboard (`:5173`) concurrently. |
| `npm run build` | Performs typechecking and builds the frontend production bundle. |
| `npm run typecheck` | Typechecks all libraries and sub-packages (`tsc --build`). |
| `npm run push --workspace=@workspace/db` | Pushes Drizzle schema directly to the database. |
| `npm run push-force --workspace=@workspace/db` | Pushes schema changes with forced migration. |
| `npm run codegen --workspace=@workspace/api-spec` | Regenerates React Query hooks & Zod schemas from `openapi.yaml`. |
| `npm run start --workspace=@workspace/api-server` | Starts the bundled production API server. |
| `npm run serve --workspace=@workspace/medprix-dashboard` | Previews the built frontend dashboard locally. |

---

## API Specification & Codegen

Medprix follows an API-first approach:

1. **Spec Location:** `lib/api-spec/openapi.yaml`
2. **Generator Configuration:** `lib/api-spec/orval.config.ts`
3. **Generated Outputs:**
   - Client hooks: `lib/api-client-react/src/generated/`
   - Zod models: `lib/api-zod/src/generated/`

Whenever updating `openapi.yaml`, re-run the code generation tool:

```bash
# Using npm:
npm run codegen --workspace=@workspace/api-spec

# Or using pnpm:
pnpm --filter @workspace/api-spec run codegen
```

---

## Troubleshooting

### 1. `DATABASE_URL must be set` Error
- Ensure `DATABASE_URL` is loaded into the process environment before running the backend or database migrations.
- A root `.env` file is useful for local reference, but this repo does not auto-load it.
- Verify the MySQL service is active and the database name exists.

### 2. `Cannot connect to MySQL database`
- Ensure MySQL is running on the target port (default `3306`).
- Verify credentials and check user permissions:
  ```sql
  CREATE DATABASE IF NOT EXISTS medprix;
  GRANT ALL PRIVILEGES ON medprix.* TO 'your_user'@'localhost';
  FLUSH PRIVILEGES;
  ```

### 3. `Could not reach the server. Is the backend running?`
- In development, ensure the API server is listening on port `5000`.
- In production, check that your reverse proxy properly routes `/api` to the backend process.
