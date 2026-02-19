# 🐾 VetConnect Frontend

**VetConnect** is a web-based platform that connects pet owners with licensed veterinarians. This repository contains the frontend application built with **React + Vite**, handling authentication (login & signup), and the user-facing interface for booking and managing veterinary consultations.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Security Documentation](#security-documentation)
4. [API Documentation](#api-documentation)
5. [Deployment Guide](#deployment-guide)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance & Updates](#maintenance--updates)

---

## Project Overview

VetConnect provides a secure, accessible platform for:
- Pet owners to register, log in, and book vet consultations
- Veterinarians to manage appointments and patient records
- Admins to oversee platform activity and user roles

The frontend communicates with a REST API backend and enforces security best practices at every layer.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 |
| Build Tool | Vite |
| Language | JavaScript (ES6+) |
| Linting | ESLint |
| HTTP Client | Axios / Fetch API |
| Auth | JWT (JSON Web Tokens) |
| Styling | CSS Modules / Tailwind CSS |

---

## Security Documentation

This section documents all security controls implemented in VetConnect's frontend.

### Authentication Security

**Password Policy**
- Minimum 8 characters required
- Must include uppercase, lowercase, number, and special character
- Enforced at both frontend (immediate feedback) and backend (validation)

**Token Management**
- Authentication uses short-lived JWT access tokens
- Tokens are stored in `httpOnly` cookies (not `localStorage`) to prevent XSS access
- Refresh tokens are used to obtain new access tokens without re-login
- All tokens are validated on every protected route

**Session Management**
- Sessions expire after 30 minutes of inactivity
- Logout invalidates the token server-side and clears all cookies
- Auto-timeout prompts user before session ends

**Login Error Handling**
- Generic error messages only (e.g., "Invalid credentials") — no indication of whether email or password was wrong, to prevent user enumeration

**Rate Limiting**
- Login attempts are rate-limited by the backend API (max 5 attempts before temporary lockout)
- Frontend disables the login button and shows a countdown after repeated failures

**MFA (Multi-Factor Authentication)**
- MFA is available as an optional feature for all users
- Mandatory for admin-level accounts

### Input Validation & XSS Protection

- All form inputs are validated client-side before submission (length, format, required fields)
- Server-side validation is the authoritative check — frontend validation is for UX only
- Output is escaped using React's built-in JSX rendering (prevents XSS by default)
- File uploads (e.g., profile photos) are restricted by type (`image/jpeg`, `image/png`) and size (max 2MB) on the frontend, with backend enforcement as well
- CSRF tokens are included in all state-changing API requests via request headers

### Data Handling

- No sensitive data (passwords, tokens) is stored in `localStorage` or `sessionStorage`
- API responses containing sensitive fields are not logged to the browser console in production
- Environment variables (API URLs, keys) are stored in `.env` files and excluded from version control via `.gitignore`

---

## API Documentation

VetConnect's frontend interacts with the following API endpoints. All endpoints require a valid JWT unless marked as public.

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/api/auth/register` | Register a new user | No |
| POST | `/api/auth/login` | Log in and receive JWT | No |
| POST | `/api/auth/logout` | Invalidate session/token | Yes |
| POST | `/api/auth/refresh` | Refresh access token | Yes (refresh token) |
| POST | `/api/auth/mfa/verify` | Verify MFA code | Partial |

### User Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/api/users/me` | Get current user profile | Yes |
| PUT | `/api/users/me` | Update profile info | Yes |
| POST | `/api/users/me/avatar` | Upload profile photo | Yes |

### Appointment Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/api/appointments` | List user's appointments | Yes |
| POST | `/api/appointments` | Book a new appointment | Yes |
| DELETE | `/api/appointments/:id` | Cancel an appointment | Yes |

### Request / Response Format

All requests and responses use **JSON**. Example login request:

```json
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

Example success response:
```json
{
  "status": "success",
  "accessToken": "<jwt_token>",
  "user": {
    "id": "abc123",
    "email": "user@example.com",
    "role": "pet_owner"
  }
}
```

Example error response:
```json
{
  "status": "error",
  "message": "Invalid credentials."
}
```

---

## Deployment Guide

### Prerequisites

- Node.js v18 or higher
- npm v9 or higher
- Access to the VetConnect backend API (running separately)

### 1. Clone the Repository

```bash
git clone https://github.com/llygvn/vetconnect-frontend.git
cd vetconnect-frontend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_BASE_URL=https://your-backend-api.com
VITE_APP_ENV=production
```

> ⚠️ **Never commit your `.env` file.** It is already listed in `.gitignore`.

### 4. Run in Development Mode

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 5. Build for Production

```bash
npm run build
```

Output files will be in the `/dist` folder.

### 6. Preview Production Build Locally

```bash
npm run preview
```

### 7. Deploy

Upload the `/dist` folder to your hosting provider (e.g., Vercel, Netlify, or an Nginx/Apache server).

**For Vercel (recommended):**
```bash
npm install -g vercel
vercel --prod
```

**Security checklist before deploying:**
- [ ] `.env` is not committed to the repo
- [ ] `VITE_APP_ENV` is set to `production`
- [ ] HTTPS is enforced on the hosting domain
- [ ] CORS settings on the backend allow only the production frontend URL

---

## Troubleshooting

### App won't start (`npm run dev` fails)

**Cause:** Missing dependencies or wrong Node version.  
**Fix:**
```bash
node -v          # Must be v18+
npm install      # Reinstall dependencies
npm run dev
```

### "Invalid credentials" on login even with correct password

**Cause:** Token may be expired or backend is unreachable.  
**Fix:**
- Clear browser cookies and try again
- Check that `VITE_API_BASE_URL` in `.env` points to the correct backend
- Check backend server status

### Blank page after login / redirect not working

**Cause:** JWT not being set correctly, or route guard misconfiguration.  
**Fix:**
- Open browser DevTools → Application → Cookies and confirm the auth cookie is present
- Check the browser console for errors
- Verify that protected routes have the `<PrivateRoute>` wrapper in `App.jsx`

### File upload fails

**Cause:** File exceeds 2MB size limit or is an unsupported type.  
**Fix:** Ensure the uploaded file is a `.jpg` or `.png` under 2MB. If backend rejects it, check the backend's file validation settings.

### CORS errors in console

**Cause:** Backend is not whitelisting the frontend's origin.  
**Fix:** Ask the backend team to add your frontend URL to the CORS allowed origins list.

### ESLint errors on build

**Cause:** Code style issues blocking the production build.  
**Fix:**
```bash
npm run lint       # See all ESLint issues
npm run lint --fix # Auto-fix where possible
```

---

## Maintenance & Updates

### Dependency Updates

Dependencies should be reviewed and updated **monthly** to patch security vulnerabilities.

```bash
npm outdated          # Check for outdated packages
npm update            # Update within semver range
npm audit             # Check for known vulnerabilities
npm audit fix         # Auto-fix vulnerabilities
```

### Security Patches Schedule

| Task | Frequency |
|---|---|
| `npm audit` check | Weekly |
| Dependency updates | Monthly |
| Full security review | Every semester / major release |
| JWT secret rotation | Every 90 days (backend) |

### Version Control Practices

- All changes go through **feature branches** and **pull requests**
- Branch naming: `feature/`, `fix/`, `security/`
- Commit messages follow conventional format: `feat:`, `fix:`, `security:`
- Never push directly to `main`

### Environment Management

- `.env` files are **never** committed to version control
- Separate `.env` configurations exist for `development` and `production`
- Environment variables are documented in `.env.example` (safe to commit — no real values)

### Rollback Procedure

If a bad deployment occurs:
1. Revert to the last stable commit: `git revert HEAD`
2. Rebuild and redeploy: `npm run build && vercel --prod`
3. Notify the team via group chat

---

## 👥 Contributors

VetConnect Frontend — ITE 370 IAS 2 Group Project  
Course: ITE 370 | Instructor: Dr. Engelbert Q. Cruz

---

*Last updated: February 2026*
