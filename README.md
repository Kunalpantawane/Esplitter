# Esplitter ⚡

Esplitter is an offline-first group expense splitter and personal budget tracker. It combines robust offline data integrity, intelligent pairwise debt simplification, and interactive spending analytics into a single, cohesive, glassmorphic single-page application.

---

## 💡 Why Esplitter is Needed

Traditional bill-splitting apps are plagued by infrastructure dependencies, forced online requirements, and fragmented features. Esplitter was built to solve these core pain points:

1. **True Offline-First Reliability**: Have you ever tried to split a bill at a remote cabin, in a basement restaurant, or during international travel with no data? Most apps fail or freeze. Esplitter writes immediately to your local database (IndexedDB) and synchronizes transparently in the background when connectivity returns.
2. **Zero-Fee Manual Settlements**: Instead of locking you into proprietary payment gateways, high fees, or complex third-party registrations, Esplitter implements a clean, secure settlement flow. Simply copy the recipient's UPI ID, make the payment in your favorite banking app, and mark it paid. The recipient confirms it, keeping the balance sheet perfectly secure.
3. **Unified Personal & Group Budgeting**: Most users are forced to maintain two separate apps—one for splitting restaurant bills with friends, and another for keeping track of their own monthly budgets. Esplitter combines both under one roof: group balances are kept strictly distinct from your private personal ledger, yet accessible with a single click.
4. **Enhanced Session Security**: Esplitter implements advanced web security protocols including CSRF/XSS resistant HttpOnly cookies, opaque rotated refresh tokens, and SHA-256 server-side hashing, keeping your sessions secure without bloated third-party authentication services.

---

## 🔥 Cool Features

* **Pairwise Settlement Simplification (Smart Mode)**: Toggle between *Normal* and *Smart* settlement modes. Smart Mode runs a graph-simplification algorithm that eliminates circular debts and minimizes the actual count of transaction links needed to settle the group (e.g. if A owes B ₹100, and B owes C ₹100, Smart Mode simplifies this so A pays C ₹100 directly).
* **Dexie.js Offline Cache**: Powered by Dexie.js (IndexedDB version 4), the client application performs blazing-fast local reads/writes, queuing sync operations with exponential backoff retry and conflict resolution logic.
* **Interactive Chart.js Analytics**: Track your personal spending behavior with gorgeous, responsive doughnut and line charts that compile your transactions dynamically.
* **Proactive Budget Warnings**: Set category-specific or overall monthly budgets and watch Esplitter compute your real-time spending pace, visually highlighting categories that are approaching or exceeding their limits.
* **Premium Glassmorphic Design**: Built using high-performance CSS variables, rich gradients, smooth micro-animations, and responsive layouts that fit perfectly on mobile screens and desktops alike.

---

## 🛠️ Tech Stack

| Layer | Technologies & Libraries |
| :--- | :--- |
| **Frontend Runtime** | Vanilla ES6 JavaScript, Dexie (IndexedDB), Chart.js, Service Worker |
| **Frontend Build** | Vite, PostCSS, Tailwind CSS |
| **Backend API** | Node.js, Express (4.18), Mongoose (8) |
| **Security & Utilities** | Helmet, CORS, express-rate-limit, JWT, bcrypt, cookie-parser, dotenv |
| **Testing Suite** | Jest, Supertest, mongodb-memory-server |

---

## ⚡ Quick Start & How to Run

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### 2. Installation
Clone the repository and install all dependencies:
```bash
npm install
```

### 3. Environment Setup
Copy the example environment file and fill in your details:
```bash
cp .env.example .env
```
Open `.env` and configure the following variables:
* `MONGODB_URI`: Your MongoDB connection string (e.g., `mongodb://localhost:27017/esplitter`).
* `JWT_SECRET`: A secure key used to sign JSON Web Tokens.
* `PORT` (Optional): The port the server will run on (defaults to `3000`).
* `NODE_ENV`: Set to `development` or `production`.
* `CORS_ORIGINS`: Comma-separated list of allowed origins (e.g., `http://localhost:5173`).

### 4. Running the Application

You can spin up the full stack or individual layers depending on your workflow:

* **Run Full Stack (Recommended)**: Starts both the backend server (via nodemon) and the Vite dev server concurrently:
  ```bash
  npm run dev
  ```
* **Run Frontend Only**: Starts the Vite compiler on `http://localhost:5173`:
  ```bash
  npm run dev:frontend
  ```
* **Run Backend Only**: Starts the Node.js API with live reload on `http://localhost:3000`:
  ```bash
  npm run dev:backend
  ```
* **Build for Production**: Compiles and bundles optimized static assets into the `/dist` directory:
  ```bash
  npm run build
  ```

---

## 🧪 Testing Structure

Esplitter utilizes a thorough, automated integration test suite written with Jest and Supertest. 

* **No External Database Needed**: The tests employ `mongodb-memory-server` to spin up an isolated, disposable in-memory MongoDB instance for every test run, keeping your local database clean.
* **Test Coverage**: Consists of **7 test suites and 58 integration tests** covering the entire lifecycle of the application:
  1. `core-regression`: Balance consistency, role transfer limits, and group deletion rules.
  2. `expenses`: Split validation (Equal, Custom, Percentage), CRUD operations, and idempotent sync.
  3. `groups`: Group creation, invite code rotation, admin permissions, and membership approvals.
  4. `settlement`: Minimization algorithm verification and circular debt resolution comparisons.
  5. `auth`: Register limits, password strength validation, and cookie rotation.
  6. `personal-budget-category`: Budgets, custom category seeding, and personal expenses sync.
  7. `user`: Profile updates and UPI ID format sanitization.

### Run all tests:
```bash
npm test
```

---

## 📂 Project Structure

```text
server/
  ├── config/        # Database connection configuration
  ├── controllers/   # Route controller handlers (auth, budget, categories, sync, etc.)
  ├── lib/           # Utility functions (atomic transactions, group access checks)
  ├── middleware/    # Express middlewares (authentication, global error handler)
  ├── models/        # Mongoose/MongoDB data schemas
  ├── routes/        # Express REST API endpoints
  ├── scripts/       # Migration and cleanup scripts
  └── services/      # Core business logic (balances, sync protocol)

public/              # Live frontend SPA codebase (HTML, styles, scripts, service worker)
  ├── css/           # Standard styling rules
  ├── js/            # UI components and core IndexedDB syncing engines
  └── sw.js          # Offline service worker app-shell cache

src/                 # TypeScript and Tailwind migration scaffold
  ├── styles/        # Structured Tailwind and design token modules
  └── ts/            # Strongly-typed modules (scaffolding targets)

tests/               # Jest integration regression suites
doc/                 # Checked-in system specifications and guides
```

---

## 📄 Documentation Index

For detailed architectural breakdowns, review our verified markdown documentation in the `/doc` folder:
* [System Overview](doc/system_overview.md) — End-to-end data flow and sync protocol.
* [API Design](doc/api.md) — Comprehensive REST endpoint specifications.
* [Backend Architecture](doc/backend.md) — Middleware, runtime startup, and server design.
* [Database Design](doc/database.md) — MongoDB schema fields, IndexedDB stores, and relationship tables.
* [Frontend Architecture](doc/frontend.md) — Browser runtime dependencies, Dexie setups, and module maps.
* [Improvements Log](doc/improvements.md) — Features implementation status and gaps index.
* [PRD](doc/prd.md) — Product requirements document snapshot.