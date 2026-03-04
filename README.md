# 🐾 VetConnect

**VetConnect** is a full-stack web application that connects pet owners with veterinary services. It handles user authentication, appointment booking, and admin management — built with **React + Vite** (frontend) and **Node.js + Express + MySQL** (backend).

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Project Structure](#project-structure)
3. [Tech Stack](#tech-stack)
4. [Security Documentation](#security-documentation)
5. [API Documentation](#api-documentation)
6. [Deployment Guide](#deployment-guide)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance & Updates](#maintenance--updates)

---

## Project Overview

VetConnect provides a secure platform for:
- **Pet owners** to register, verify their email, log in, and book veterinary appointments
- **Admins** to manage users, appointments, and view full audit logs
- **Veterinarians** to be assigned to appointments managed by the admin

The project is organized as a monorepo with separate `client/` and `server/` directories.

---

## Project Structure

```
vetconnect-frontend/
├── client/                   # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── admindashboard.jsx
│   │   ├── EmailVerification.jsx
│   │   ├── VerifyEmail.jsx
│   │   ├── VerificationSuccess.jsx
│   │   ├── api.js
│   │   └── shared/
│   │       └── Validation.js  # Shared regex (used by both client & server)
│   └── public/
├── server/                   # Node.js + Express backend
│   ├── config/
│   │   └── db.js             # MySQL connection pool with TLS
│   ├── controllers/
│   │   └── authController.js
│   ├── middleware/
│   │   ├── auth.js           # JWT protect middleware
│   │   └── audit.js          # Audit logging middleware & action constants
│   ├── routes/
│   │   ├── authRoutes.js     # Register, login, verify, logout
│   │   └── admin.js          # Admin-only routes (RBAC protected)
│   ├── server-cron.js        # Scheduled cleanup tasks
│   └── index.js              # Express app entry point
├── .gitignore
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 18 + Vite |
| Backend Framework | Node.js + Express |
| Database | MySQL |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| Email | Nodemailer (Gmail SMTP) |
| Input Sanitization | xss package |
| CSRF Protection | csurf |
| Rate Limiting | express-rate-limit |
| Audit Logging | Custom middleware + MySQL `audit_logs` table |

---

## Security Documentation

This section documents the actual security controls implemented in VetConnect's backend.

### 1. Authentication

**Password Hashing**
- All passwords are hashed using **bcrypt** with 10 salt rounds before being stored (`authRoutes.js`, `authController.js`)
- Plaintext passwords are never stored or logged at any point

**JWT Token Management**
- On successful login, a signed JWT is issued with a **1-hour expiry** (`expiresIn: '1h'`)
- The token payload includes `id`, `email`, and `role`
- Tokens are verified on every protected route via the `authenticate` middleware (`authRoutes.js`) and the `protect` middleware (`auth.js`)

**Token Blacklisting on Logout**
- On logout, the token is inserted into a `blacklisted_tokens` MySQL table with its expiry timestamp
- Every subsequent request checks the blacklist — invalidated tokens are rejected even before expiry
- Expired blacklisted tokens are cleaned up automatically by a scheduled cron job (`server-cron.js`)

**Email Verification**
- After registration, users receive a time-limited email verification link before they can log in
- A cryptographically secure 32-byte random token is generated via `crypto.randomBytes(32)` and stored with a **1-hour expiry** (enforced in MySQL via `DATE_ADD`)
- Users with `is_verified = false` are blocked from logging in with a `403` response
- The verification token is cleared from the database after successful use

**Generic Error Messages (Anti-Enumeration)**
- Login always returns `"Invalid credentials"` regardless of whether the email or password is wrong — preventing user enumeration attacks
- The resend-verification endpoint always returns the same message whether the email exists or not, also preventing email enumeration

**Rate Limiting**
- Login and register: max **10 attempts per 15 minutes** per IP (`authLimiter`)
- Resend verification email: max **3 requests per hour** per IP (`emailLimiter`)
- Implemented using `express-rate-limit` with standard headers

### 2. Input Validation & XSS Protection

**Server-Side Validation**
- All registration inputs are validated server-side using shared regex patterns from `shared/validation.js` (same file used by the frontend — no duplication)
- Username: 3–30 characters, letters/numbers/underscores only (`usernameRegex`)
- Email: strict email format check (`emailRegex`)
- Password: minimum 12 characters, must include uppercase, lowercase, number, and special character (`strongPasswordRegex`)

**XSS Sanitization**
- User-supplied string inputs (`username`, `email`) are sanitized using the `xss` package before any processing or database insertion

**SQL Injection Prevention**
- All database queries use **parameterized queries** (prepared statements) through the MySQL2 connection pool — no raw string interpolation in any SQL query

**CSRF Protection**
- Implemented using `csurf` in `index.js` with `httpOnly: true`, `sameSite: 'strict'` cookie settings, and `secure: true` in production
- The `/api/csrf-token` endpoint provides tokens to the frontend
- Public auth endpoints (register, login, verify, resend) are explicitly CSRF-exempt since they are used before a session exists

### 3. Database Security

**Credential Storage**
- All database credentials, JWT secret, and email credentials are stored in a `.env` file
- `.env` is excluded from version control via `.gitignore` and is never committed to the repository

**TLS Database Connection**
- MySQL connection in `db.js` is configured with SSL/TLS (`ssl: { rejectUnauthorized: true }`)
- On every server startup, `SHOW STATUS LIKE 'Ssl_cipher'` is executed and the active cipher is logged to confirm TLS is live

**Role-Based Access Control (RBAC)**
- Users have a `role` column in the database (`'user'` or `'admin'`)
- The `requireRole('admin')` middleware protects all `/api/admin/*` routes — non-admin JWTs are rejected with `403 Forbidden`
- All admin routes additionally require a valid JWT via `authenticate` middleware (double-layered protection)
- Admins cannot deactivate their own account (explicitly enforced in the route handler)

**Audit Logging**
- A full audit logging system is implemented in `middleware/audit.js` using a `audit_logs` MySQL table
- Events logged include: login success, logout, registration, email verification, resend verification, appointment creation/updates/cancellations, user activation/deactivation, role changes, forbidden access attempts, and admin access to sensitive routes
- Each record stores: `user_id`, `user_role`, `action`, `entity`, `entity_id`, `detail` (JSON), `ip_address`, and `created_at`
- Audit log write failures do not crash the main request (fail-safe design)
- Audit logs are viewable by admins via `GET /api/admin/audit-logs` (paginated, filterable)

**CORS**
- CORS is restricted to the exact `FRONTEND_URL` environment variable — not open to all origins
- Credentials are allowed only from the specified origin (`credentials: true`)

### 4. Route Protection Summary

| Route | Auth Required | Role Required |
|---|---|---|
| `POST /api/register` | No | — |
| `POST /api/login` | No | — |
| `GET /api/verify/:token` | No | — |
| `POST /api/resend-verification` | No | — |
| `GET /api/csrf-token` | No | — |
| `POST /api/logout` | Yes (JWT) | Any |
| `GET /api/admin/users` | Yes (JWT) | admin |
| `PATCH /api/admin/users/:id/status` | Yes (JWT) | admin |
| `GET /api/admin/appointments` | Yes (JWT) | admin |
| `PATCH /api/admin/appointments/:id/status` | Yes (JWT) | admin |
| `GET /api/admin/audit-logs` | Yes (JWT) | admin |
| `GET /api/admin/stats` | Yes (JWT) | admin |

---

## API Documentation

All protected endpoints require: `Authorization: Bearer <token>`

All requests and responses use **JSON**.

### Authentication Endpoints

**Register**
```
POST /api/register
Body: { username, email, password }
201: { message: "Registration successful. Please check your email to verify your account." }
400: { error: "..." }   // validation or duplicate email
```

**Login**
```
POST /api/login
Body: { email, password }
200: { token, role }
401: { error: "Invalid credentials" }
403: { error: "Please verify your email before logging in." }
```

**Verify Email**
```
GET /api/verify/:token
200: { status: "ok" | "already" }
400: { status: "error", error: "This link has expired or is invalid." }
```

**Resend Verification Email**
```
POST /api/resend-verification
Body: { email }
200: { message: "If that email is registered and unverified, a new link has been sent." }
```

**Logout**
```
POST /api/logout
Headers: Authorization: Bearer <token>
200: { message: "Logged out successfully" }
```

**Get CSRF Token**
```
GET /api/csrf-token
200: { csrfToken: "..." }
```

### Admin Endpoints (JWT + admin role required)

**List Users**
```
GET /api/admin/users?status=active|inactive&search=
200: [ { id, username, email, role, is_verified, is_active, appointment_count, created_at } ]
```

**Get Single User + Appointments**
```
GET /api/admin/users/:id
200: { ...user, appointments: [...] }
```

**Update User Active Status**
```
PATCH /api/admin/users/:id/status
Body: { is_active: true | false }
200: { message: "User activated/deactivated successfully" }
```

**List All Appointments**
```
GET /api/admin/appointments?status=&appointment_status=&search=&date=
200: [ { id, pet_name, species, service, assigned_vet, appointment_date, owner_username, ... } ]
```

**Update Appointment Status**
```
PATCH /api/admin/appointments/:id/status
Body: { appointment_status: "pending" | "confirmed" | "completed" | "cancelled" }
200: { message: "Appointment status updated successfully" }
```

**Get Audit Logs**
```
GET /api/admin/audit-logs?action=&userId=&page=1&limit=50
200: { data: [...], total, page, limit, pages }
```

**Get Dashboard Stats**
```
GET /api/admin/stats
200: { totalAppointments, activeUsers, completedToday, pendingAppointments, cancelledToday }
```

---

## Deployment Guide

### Prerequisites

- Node.js v18+
- npm v9+
- MySQL 8.0+ with TLS enabled
- Gmail account with an **App Password** (not your actual Gmail password)

### 1. Clone the Repository

```bash
git clone https://github.com/llygvn/vetconnect-frontend.git
cd vetconnect-frontend
```

### 2. Install Dependencies

```bash
# Frontend
cd client && npm install

# Backend
cd ../server && npm install
```

### 3. Configure Environment Variables

Create `server/.env` (never commit this file):

```env
PORT=5000
NODE_ENV=production

DB_HOST=your-db-host
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=vetconnect

JWT_SECRET=use-a-long-random-string-here
JWT_EXPIRES_IN=1h

EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-gmail-app-password

FRONTEND_URL=https://your-frontend-domain.com
```

> ⚠️ **Generate your Gmail App Password** at: Google Account → Security → 2-Step Verification → App Passwords. Never use your real Gmail password.

### 4. Set Up the Database

Your MySQL database needs the following tables at minimum:
- `users` — includes `id`, `username`, `email`, `password`, `role`, `is_verified`, `is_active`, `verification_token`, `verification_token_expires`, `created_at`
- `appointments` — includes `id`, `user_id`, `pet_name`, `species`, `service`, `assigned_vet`, `appointment_date`, `appointment_time`, `status`, `appointment_status`, `notes`, `created_at`, `updated_at`
- `blacklisted_tokens` — includes `id`, `token`, `expires_at`
- `audit_logs` — includes `id`, `user_id`, `user_role`, `action`, `entity`, `entity_id`, `detail`, `ip_address`, `created_at`

### 5. Run in Development

```bash
# Backend (from /server)
npm run dev

# Frontend (from /client)
npm run dev
```

Frontend: `http://localhost:5173` | Backend: `http://localhost:5000`

### 6. Build Frontend for Production

```bash
cd client
npm run build
```

Output goes to `/client/dist` — deploy to Vercel, Netlify, or serve via Nginx.

### 7. Pre-Deployment Security Checklist

- [ ] `.env` is not committed to the repository
- [ ] `NODE_ENV` is set to `production`
- [ ] `JWT_SECRET` is a strong, random string
- [ ] Gmail App Password is configured (not account password)
- [ ] HTTPS is enforced on both frontend and backend domains
- [ ] TLS cipher is confirmed in server startup logs
- [ ] `FRONTEND_URL` exactly matches your production frontend domain

---

## Troubleshooting

**Server won't start**
Check that all required `.env` variables are present and Node.js is v18+. Run `cd server && npm install` to ensure dependencies are installed.

**"Please verify your email before logging in"**
The user registered but hasn't clicked the verification link. Check spam folder. Use the resend verification option if the link expired (links expire after 1 hour).

**"This link has expired or is invalid"**
The 1-hour verification token expired. Request a new link via the resend verification page or `POST /api/resend-verification`.

**"Too many attempts. Please try again in 15 minutes."**
The rate limiter triggered after 10 login/register attempts from the same IP within 15 minutes. Wait 15 minutes before retrying.

**Token rejected after logout**
This is expected — tokens are blacklisted on logout. Log in again to receive a new token.

**CSRF error (403 "Form tampered with")**
The frontend did not include a valid CSRF token. Ensure the frontend fetches `/api/csrf-token` and attaches it to all state-changing requests.

**TLS cipher shows blank on server startup**
MySQL TLS is not active. Enable SSL on your MySQL server and confirm `ssl: { rejectUnauthorized: true }` is set in `server/config/db.js`.

**CORS errors in browser console**
The `FRONTEND_URL` in `.env` does not match the actual frontend origin. Update it to the exact URL including protocol and port if applicable.

---

## Maintenance & Updates

### Dependency & Security Checks

```bash
npm audit           # Check for known vulnerabilities
npm audit fix       # Auto-fix where possible
npm outdated        # Check for outdated packages
```

### Security Maintenance Schedule

| Task | Frequency |
|---|---|
| `npm audit` check | Weekly |
| Dependency updates | Monthly |
| JWT secret rotation | Every 90 days |
| Gmail App Password rotation | Every 90 days |
| Full security review | Every major release |
| Blacklisted token cleanup | Automatic (cron job in `server-cron.js`) |

### Branch Reference

| Branch | Purpose |
|---|---|
| `main` | Base frontend (login & signup) |
| `feature/tls-database` | TLS database + full-stack integration |
| `email-verification-branch` | Email verification, audit logging, CSRF, RBAC |

### Rollback Procedure

```bash
git log --oneline             # Find the last stable commit
git revert <commit-hash>      # Revert the problematic commit
cd client && npm run build    # Rebuild frontend
# Redeploy /client/dist
```

---

## 👥 Contributors

VetConnect — ITE 370 IAS 2 Group Project  
Course: ITE 370 | Instructor: Dr. Engelbert Q. Cruz

*Last updated: February 2026*