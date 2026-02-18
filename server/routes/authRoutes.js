import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import xss from 'xss';
import rateLimit from 'express-rate-limit';

dotenv.config();

const router = express.Router();

// ─── Regex ────────────────────────────────────────────────────────────────────
// FIX: Imported from shared file to avoid duplication with Login.jsx
import { strongPasswordRegex, usernameRegex, emailRegex } from '../shared/validation.js';

// ─── Rate limiters ────────────────────────────────────────────────────────────
// FIX: Added rate limiting to prevent brute-force and email-spam attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 10,                   // 10 attempts per window per IP
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1-hour window
  max: 3,                    // max 3 verification emails per hour per IP
  message: { error: 'Too many verification emails requested. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Nodemailer transporter (created once, not per-request) ──────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── REGISTER ────────────────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  let { username, email, password } = req.body;

  username = xss(username);
  email    = xss(email);

  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields are required' });

  if (!usernameRegex.test(username))
    return res.status(400).json({ error: 'Username must be 3–30 characters, letters/numbers/underscores only.' });

  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Invalid email format.' });

  if (!strongPasswordRegex.test(password))
    return res.status(400).json({ error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.' });

  try {
    // FIX: SELECT only needed column instead of SELECT *
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length)
      return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword    = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    // FIX: Removed dead `verificationTokenExpires` variable — SQL handles expiry via DATE_ADD

    await db.query(
      `INSERT INTO users
         (username, email, password, verification_token, verification_token_expires, is_verified)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), false)`,
      [username, email, hashedPassword, verificationToken]
    );

    const verifyLink = `${FRONTEND_URL}/verify/${verificationToken}`;

    await transporter.sendMail({
      from:    process.env.EMAIL_USER,
      to:      email,
      subject: 'Verify your VetConnect account',
      html: `
        <h2>Verify your account</h2>
        <p>Click the link below to verify your VetConnect account:</p>
        <a href="${verifyLink}">${verifyLink}</a>
        <p>This link expires in 1 hour.</p>
      `,
    });

    res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.' });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  let { email, password } = req.body;

  email = xss(email);

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Invalid email format.' });

  try {
    // FIX: SELECT only needed columns instead of SELECT *
    const [rows] = await db.query(
      'SELECT id, email, password, role, is_verified FROM users WHERE email = ?',
      [email]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    if (!user.is_verified)
      return res.status(403).json({ error: 'Please verify your email before logging in.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // FIX: Audit log on successful login
    console.log(`[AUDIT] Login success: userId=${user.id} ip=${req.ip} at=${new Date().toISOString()}`);

    res.json({ token, role: user.role || 'user' });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;

  try {
    // FIX: SELECT only needed columns instead of SELECT *
    const [rows] = await db.query(
      `SELECT id, is_verified FROM users
       WHERE verification_token = ?
       AND verification_token_expires > NOW()`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({
        status: 'error',
        error: 'This link has expired or is invalid. Please request a new one.',
      });
    }

    const user = rows[0];

    if (user.is_verified) {
      return res.json({ status: 'already' });
    }

    await db.query(
      `UPDATE users
       SET is_verified = true,
           verification_token = NULL,
           verification_token_expires = NULL
       WHERE id = ?`,
      [user.id]
    );

    res.json({ status: 'ok' });

  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({
      status: 'error',
      error: 'Something went wrong. Please try again.',
    });
  }
});

// ─── RESEND VERIFICATION EMAIL ────────────────────────────────────────────────
router.post('/resend-verification', emailLimiter, async (req, res) => {
  let { email } = req.body;

  email = xss(email);

  if (!email || !emailRegex.test(email))
    return res.status(400).json({ error: 'Valid email required.' });

  try {
    // FIX: SELECT only needed columns instead of SELECT *
    const [rows] = await db.query(
      'SELECT id, is_verified FROM users WHERE email = ?',
      [email]
    );

    // FIX: Always return success to prevent email enumeration —
    // an attacker shouldn't be able to discover which emails are registered
    if (!rows.length || rows[0].is_verified) {
      return res.json({ message: 'If that email is registered and unverified, a new link has been sent.' });
    }

    const user = rows[0];

    const verificationToken = crypto.randomBytes(32).toString('hex');
    // FIX: Removed dead `verificationTokenExpires` variable — SQL handles expiry directly

    await db.query(
      `UPDATE users
       SET verification_token = ?, verification_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR)
       WHERE id = ?`,
      [verificationToken, user.id]
    );

    const verifyLink = `${FRONTEND_URL}/verify/${verificationToken}`;

    await transporter.sendMail({
      from:    process.env.EMAIL_USER,
      to:      email,
      subject: 'Verify your VetConnect account',
      html: `
        <h2>Verify your account</h2>
        <p>Click the link below to verify your VetConnect account:</p>
        <a href="${verifyLink}">${verifyLink}</a>
        <p>This link expires in 1 hour.</p>
      `,
    });

    res.json({ message: 'If that email is registered and unverified, a new link has been sent.' });

  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];

  try {
    const [blacklisted] = await db.query(
      'SELECT id FROM blacklisted_tokens WHERE token = ?',
      [token]
    );
    if (blacklisted.length)
      return res.status(401).json({ error: 'Token has been invalidated. Please log in again.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ─── ROLE GUARD MIDDLEWARE ────────────────────────────────────────────────────
// FIX: Added requireRole middleware — use after authenticate on any admin route:
//   router.get('/admin/users', authenticate, requireRole('admin'), handler)
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    console.warn(`[AUDIT] Forbidden access attempt: userId=${req.user?.id} role=${req.user?.role} ip=${req.ip} at=${new Date().toISOString()}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  try {
    const expiresAt = new Date(req.user.exp * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await db.query(
      'INSERT INTO blacklisted_tokens (token, expires_at) VALUES (?, ?)',
      [token, expiresAt]
    );

    // FIX: Cleanup of expired tokens moved to a scheduled cron job in server.js
    // (previously this ran on every logout request, causing unnecessary latency)

    console.log(`[AUDIT] Logout: userId=${req.user.id} ip=${req.ip} at=${new Date().toISOString()}`);

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;