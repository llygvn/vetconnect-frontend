import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import xss from 'xss';

dotenv.config();

const router = express.Router();

// ------------------- REGEX -------------------
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
const usernameRegex = /^[\w]{3,30}$/;
const emailRegex = /^\S+@\S+\.\S+$/;

// ------------------- MIDDLEWARE FOR CSRF -------------------
// Make sure your index.js applies csurf before these routes

// ------------------- REGISTER -------------------
router.post('/register', async (req, res) => {
  let { username, email, password } = req.body;

  // ------------------- SANITIZE INPUTS -------------------
  username = xss(username);
  email = xss(email);

  // ------------------- VALIDATION -------------------
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!usernameRegex.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–30 characters, letters/numbers/underscores only.'
    });
  }

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  if (!strongPasswordRegex.test(password)) {
    return res.status(400).json({
      error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.'
    });
  }

  try {
    // ------------------- CHECK EMAIL EXISTS -------------------
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // ------------------- HASH PASSWORD -------------------
    const hashedPassword = await bcrypt.hash(password, 10);

    // ------------------- GENERATE VERIFICATION TOKEN -------------------
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // ------------------- INSERT USER -------------------
    await db.query(
      `INSERT INTO users 
       (username, email, password, verification_token, verification_token_expires, is_verified)
       VALUES (?, ?, ?, ?, ?, false)`,
      [username, email, hashedPassword, verificationToken, verificationTokenExpires]
    );

    // ------------------- SEND VERIFICATION EMAIL -------------------
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const verifyLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${verificationToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify your VetConnect account',
      html: `
        <h2>Verify your account</h2>
        <p>Click the link below to verify:</p>
        <a href="${verifyLink}">${verifyLink}</a>
      `,
    });

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------- LOGIN -------------------
router.post('/login', async (req, res) => {
  let { email, password } = req.body;

  // ------------------- SANITIZE INPUTS -------------------
  email = xss(email);

  // ------------------- VALIDATION -------------------
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(403).json({ error: 'Please verify your email first' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token, role: user.role || 'user' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------- VERIFY EMAIL -------------------
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT * FROM users 
       WHERE verification_token = ? 
       AND verification_token_expires > NOW()`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).send('Verification link is invalid or has expired.');
    }

    await db.query(
      `UPDATE users 
       SET is_verified = true, 
           verification_token = NULL,
           verification_token_expires = NULL
       WHERE verification_token = ?`,
      [token]
    );

    res.send('Email verified successfully! You can now log in.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Verification failed.');
  }
});

export default router;
