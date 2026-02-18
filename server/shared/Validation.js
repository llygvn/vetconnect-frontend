// ─── Shared validation constants ─────────────────────────────────────────────
// FIX: Extracted from auth.js and Login.jsx to a single source of truth.
// If the password policy changes, update it here only.

export const strongPasswordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

export const usernameRegex = /^[\w]{3,30}$/;

export const emailRegex = /^\S+@\S+\.\S+$/;