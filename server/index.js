import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();

// ----------------- ENVIRONMENT CONFIG -----------------
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ----------------- MIDDLEWARE -----------------
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true, // allow cookies
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ----------------- CSRF PROTECTION -----------------
// Apply CSRF only to non-exempt routes
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: NODE_ENV === 'production',
  }
});

// Exclude GET requests for certain routes (like email verification)
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.startsWith('/api/verify')) {
    return next(); // skip CSRF
  }
  csrfProtection(req, res, next);
});

// ----------------- ROUTES -----------------

// Route to fetch CSRF token
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Auth routes
app.use('/api', authRoutes);

// Test route
app.get('/test-db', (req, res) => res.json({ message: 'Backend is working!' }));

// ----------------- ERROR HANDLING -----------------

// CSRF error handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Form tampered with (CSRF detected)' });
  }
  next(err);
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ----------------- START SERVER -----------------
const server = app.listen(PORT, () => {
  console.log(`\x1b[36mServer running in ${NODE_ENV} mode on port ${PORT}\x1b[0m`);
  if (NODE_ENV === 'development') {
    console.log(`\x1b[33mAllowed frontend origin: ${FRONTEND_URL}\x1b[0m`);
  }
});

// ----------------- GRACEFUL SHUTDOWN -----------------
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
