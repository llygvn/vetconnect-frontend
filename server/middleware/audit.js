import db from '../config/db.js';

// ─── Audit action constants ───────────────────────────────────────────────────
// Import these in your route files to keep action names consistent
export const AUDIT_ACTIONS = {
  // Auth
  LOGIN_SUCCESS:          'LOGIN_SUCCESS',
  LOGIN_FAIL:             'LOGIN_FAIL',
  LOGOUT:                 'LOGOUT',
  REGISTER:               'REGISTER',
  EMAIL_VERIFIED:         'EMAIL_VERIFIED',
  RESEND_VERIFICATION:    'RESEND_VERIFICATION',
  // Appointments
  APPOINTMENT_CREATED:    'APPOINTMENT_CREATED',
  APPOINTMENT_UPDATED:    'APPOINTMENT_UPDATED',
  APPOINTMENT_CANCELLED:  'APPOINTMENT_CANCELLED',
  APPOINTMENT_STATUS_CHANGED: 'APPOINTMENT_STATUS_CHANGED',
  // Users (admin actions)
  USER_DEACTIVATED:       'USER_DEACTIVATED',
  USER_REACTIVATED:       'USER_REACTIVATED',
  USER_ROLE_CHANGED:      'USER_ROLE_CHANGED',
  // Access
  FORBIDDEN_ACCESS:       'FORBIDDEN_ACCESS',
  // Admin
  ADMIN_VIEWED_USERS:     'ADMIN_VIEWED_USERS',
  ADMIN_VIEWED_AUDIT_LOGS:'ADMIN_VIEWED_AUDIT_LOGS',
};

// ─── Core audit logger ────────────────────────────────────────────────────────
// Call this directly from route handlers for precise control.
//
// Usage:
//   await audit({
//     userId:   req.user?.id,
//     userRole: req.user?.role,
//     action:   AUDIT_ACTIONS.LOGIN_SUCCESS,
//     entity:   'user',
//     entityId: user.id,
//     detail:   { email },       // any JSON-serializable object
//     ip:       req.ip,
//   });

export async function audit({ userId = null, userRole = null, action, entity = null, entityId = null, detail = null, ip = null }) {
  const detailStr = detail ? JSON.stringify(detail) : null;

  // Always log to console so it shows in server output even if DB write fails
  console.log(`[AUDIT] ${action}${entity ? ` on ${entity}${entityId ? `#${entityId}` : ''}` : ''} | user=${userId ?? 'anon'} role=${userRole ?? '-'} ip=${ip ?? '-'} | ${detailStr ?? ''}`);

  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, userRole, action, entity, entityId, detailStr, ip]
    );
  } catch (err) {
    // Don't let audit failures break the main request
    console.error('[AUDIT] Failed to write to DB:', err.message);
  }
}

// ─── HTTP request audit middleware ───────────────────────────────────────────
// Optional: attach to your express app to log all incoming requests.
// app.use(auditRequest);  ← add in index.js after authenticate middleware
//
// This is lightweight — it only logs admin routes and auth routes,
// not every single static/asset request.

export function auditRequest(req, res, next) {
  const isTracked =
    req.path.startsWith('/api/admin') ||
    req.path.startsWith('/api/login') ||
    req.path.startsWith('/api/logout') ||
    req.path.startsWith('/api/register');

  if (!isTracked) return next();

  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms) | ip=${req.ip} user=${req.user?.id ?? 'anon'}`);
  });

  next();
}
