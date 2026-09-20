# StaySync PG — Next.js Backend (Phase 1 / P0 Spec)

Production-ready Next.js backend for the StaySync PG Management platform. Implements all essential P0 APIs specified in `pg-management/docs/P0-BACKEND-API-SPEC.md` using a resilient, chunked local JSON database.

---

## Features

- **Framework**: Next.js 16 (App Router) on Node 22 LTS with TypeScript.
- **Framework**: Next.js 16 (App Router) on Node 22 LTS with TypeScript.
- **Database**: Google Cloud Firebase Firestore (Always Free Spark Plan):
  - Collections: `users`, `sessions`, `otps`, `buildings`, `rooms`, `tenants`, `coOccupants`, `payments`, `electricity`, `documents`, `idempotency`.
  - Zero credit card required, persistent across serverless and cold starts on Vercel.
- **Authentication**: JWT access tokens (15-min TTL) with refresh token rotation (30-day TTL) and bcrypt password hashing.
- **Onboarding Gate**: Enforces `403 NOT_ONBOARDED` on all protected resources until the property onboarding wizard is completed.
- **Idempotency**: Supports `Idempotency-Key` header on payments and electricity meter readings.
- **CORS Support**: Configured for Vite frontend and production Vercel deployment.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create or edit `.env.local`:
```env
PORT=3001
JWT_SECRET=pg_staysync_jwt_secret_key_2026_super_secure_production_ready
DATA_DIR=./data
```

### 3. Run Development Server
```bash
npm run dev
```
The backend will start at `http://localhost:3001`.

### 4. Run Integration Test Suite
```bash
npm test
# or: node scripts/test-api.mjs
```

---

## API Summary (Base URL: `/v1`)

| Module | Method | Endpoint | Description |
|---|---|---|---|
| **Health** | `GET` | `/v1/health` | Health status and timestamp |
| **Auth** | `POST` | `/v1/auth/register` | Register owner account |
| | `POST` | `/v1/auth/login` | Login with email or phone |
| | `POST` | `/v1/auth/refresh` | Refresh access token with rotation |
| | `POST` | `/v1/auth/logout` | Revoke session |
| | `GET` | `/v1/auth/me` | Current authenticated user |
| | `POST` | `/v1/auth/forgot-password` | Generate 6-digit OTP |
| | `POST` | `/v1/auth/reset-password` | Verify OTP & reset password |
| **Account** | `PATCH` | `/v1/account` | Update profile / business address |
| | `PATCH` | `/v1/account/bank` | Update UPI & bank (masked in responses) |
| **Onboarding** | `POST` | `/v1/onboarding` | Property, floors, rooms & initial tenant setup |
| **Buildings** | `GET` | `/v1/buildings` | List properties with calculated room stats |
| | `POST` | `/v1/buildings` | Create property |
| | `GET` | `/v1/buildings/:id` | Get property details |
| | `PATCH` | `/v1/buildings/:id` | Update property |
| | `DELETE` | `/v1/buildings/:id` | Delete property (cascade delete if vacant) |
| **Rooms** | `GET` | `/v1/rooms` | List rooms with filters & occupant count |
| | `POST` | `/v1/rooms` | Create room |
| | `GET` | `/v1/rooms/:id` | Get room details |
| | `PATCH` | `/v1/rooms/:id` | Update room metadata |
| | `DELETE` | `/v1/rooms/:id` | Delete room (409 if occupied) |
| | `PATCH` | `/v1/rooms/:id/status` | Move vacant <-> maintenance |
| **Tenants** | `GET` | `/v1/tenants` | List tenants with search and filters |
| | `POST` | `/v1/tenants` | Check-in tenant & co-occupants (atomic) |
| | `GET` | `/v1/tenants/:id` | Get tenant profile & lease |
| | `PATCH` | `/v1/tenants/:id` | Update tenant details |
| | `POST` | `/v1/tenants/:id/notice` | Put tenant on notice period |
| | `POST` | `/v1/tenants/:id/vacate` | Vacate tenant, refund deposit & free room |
| **KYC Docs** | `GET` | `/v1/tenants/:id/documents` | Tenant documents list |
| | `POST` | `/v1/tenants/:id/documents` | Multipart file upload (max 10MB) |
| | `GET` | `/v1/documents/:id/file` | Download / stream KYC file |
| **Co-Occupants** | `GET` | `/v1/co-occupants` | List co-occupants by room or tenant |
| | `POST` | `/v1/co-occupants` | Add co-occupant (checks room capacity) |
| | `PATCH` | `/v1/co-occupants/:id` | Update co-occupant |
| | `DELETE` | `/v1/co-occupants/:id` | Remove co-occupant |
| | `POST` | `/v1/co-occupants/:id/aadhaar` | Upload Aadhaar card |
| | `GET` | `/v1/co-occupants/:id/aadhaar` | Download / view Aadhaar file |
| **Payments** | `GET` | `/v1/payments` | List payments with filters & pagination |
| | `POST` | `/v1/payments` | Record rent payment (`Idempotency-Key`) |
| | `GET` | `/v1/payments/:id` | Get payment receipt |
| | `GET` | `/v1/tenants/:id/dues` | Calculate outstanding rent & electricity |
| **Electricity** | `GET` | `/v1/electricity` | List sub-meter readings |
| | `POST` | `/v1/electricity` | Log sub-meter reading (`Idempotency-Key`) |
| **Dashboard** | `GET` | `/v1/dashboard` | Portfolio occupancy, revenue & stats |
| | `GET` | `/v1/overdue` | Overdue tenants & days overdue list |
# pg-management-backend
