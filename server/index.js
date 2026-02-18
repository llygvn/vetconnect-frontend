import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import dotenv from 'dotenv';

import authRouter from './routes/authRoutes.js';
import adminRouter from './routes/admin.js';
import { auditRequest } from './middleware/audit.js';
import './server-cron.js';

dotenv.config();

const app = express();

// ─── ENV ───────────────────────────────
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── CORE MIDDLEWARE ───────────────────
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── AUDIT LOGGING ─────────────────────
app.use(auditRequest);

// ─── CSRF PROTECTION ───────────────────
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: NODE_ENV === 'production',
  },
});

const CSRF_EXEMPT = [
  '/api/register',
  '/api/login',
  '/api/verify',
  '/api/resend-verification',
];

app.use((req, res, next) => {
  const isExempt = CSRF_EXEMPT.some(path => req.path.startsWith(path));
  if (isExempt) return next();
  csrfProtection(req, res, next);
});

// Provide CSRF token
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// ─── ROUTES ────────────────────────────
app.use('/api', authRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/test-db', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// ─── ERROR HANDLING ────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Form tampered with (CSRF detected)' });
  }
  next(err);
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START SERVER ──────────────────────
const server = app.listen(PORT, async () => {
  console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
  console.log(`Allowed frontend origin: ${FRONTEND_URL}`);

  // TLS test - remove after confirming
  const db = (await import('./config/db.js')).default;
  const [rows] = await db.execute("SHOW STATUS LIKE 'Ssl_cipher'");
  console.log('TLS Cipher:', rows[0].Value);
});

// ─── GRACEFUL SHUTDOWN ─────────────────
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
