import express from 'express';
import db from '../config/db.js';
import { authenticate, requireRole } from './authRoutes.js';
import { audit, AUDIT_ACTIONS } from '../middleware/audit.js';

const router = express.Router();

// All routes in this file require a valid JWT + admin role
// authenticate → verifies JWT and blacklist
// requireRole('admin') → checks req.user.role === 'admin'
router.use(authenticate, requireRole('admin'));

// ─── USERS ────────────────────────────────────────────────────────────────────

// GET /api/admin/users
// Returns all users with pet count. Supports ?status=active|inactive&search=
router.get('/users', async (req, res) => {
  const { status, search } = req.query;

  let query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.role,
      u.is_verified,
      u.is_active,
      u.created_at,
      COUNT(DISTINCT a.id) AS appointment_count
    FROM users u
    LEFT JOIN appointments a ON a.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND u.is_active = ?';
    params.push(status === 'active' ? 1 : 0);
  }
  if (search) {
    query += ' AND (u.username LIKE ? OR u.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' GROUP BY u.id ORDER BY u.created_at DESC';

  try {
    const [rows] = await db.query(query, params);

    await audit({
      userId:   req.user.id,
      userRole: req.user.role,
      action:   AUDIT_ACTIONS.ADMIN_VIEWED_USERS,
      detail:   { filters: { status, search } },
      ip:       req.ip,
    });

    res.json(rows);
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users/:id
// Returns a single user with their full appointment history
router.get('/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [users] = await db.query(
      `SELECT id, username, email, role, is_verified, is_active, created_at
       FROM users WHERE id = ?`,
      [id]
    );

    if (!users.length)
      return res.status(404).json({ error: 'User not found' });

    const [appointments] = await db.query(
      `SELECT id, pet_name, species, service, assigned_vet,
              appointment_date, appointment_time, status, appointment_status, created_at
       FROM appointments WHERE user_id = ? ORDER BY appointment_date DESC`,
      [id]
    );

    res.json({ ...users[0], appointments });
  } catch (err) {
    console.error('Admin get user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/users/:id/status
// Activate or deactivate a user account
// Body: { is_active: true | false }
router.patch('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean')
    return res.status(400).json({ error: 'is_active must be a boolean' });

  // Prevent admin from deactivating their own account
  if (parseInt(id) === req.user.id)
    return res.status(400).json({ error: 'You cannot deactivate your own account' });

  try {
    const [users] = await db.query('SELECT id, username, is_active FROM users WHERE id = ?', [id]);
    if (!users.length)
      return res.status(404).json({ error: 'User not found' });

    await db.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, id]);

    await audit({
      userId:   req.user.id,
      userRole: req.user.role,
      action:   is_active ? AUDIT_ACTIONS.USER_REACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
      entity:   'user',
      entityId: parseInt(id),
      detail:   { targetUsername: users[0].username, previousStatus: users[0].is_active, newStatus: is_active },
      ip:       req.ip,
    });

    res.json({ message: `User ${is_active ? 'activated' : 'deactivated'} successfully` });
  } catch (err) {
    console.error('Admin update user status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

// GET /api/admin/appointments
// Returns all appointments. Supports ?status=&appointment_status=&search=&date=
router.get('/appointments', async (req, res) => {
  const { status, appointment_status, search, date } = req.query;

  let query = `
    SELECT
      a.id,
      a.pet_name,
      a.species,
      a.service,
      a.assigned_vet,
      a.appointment_date,
      a.appointment_time,
      a.status,
      a.appointment_status,
      a.notes,
      a.created_at,
      u.id        AS owner_id,
      u.username  AS owner_username,
      u.email     AS owner_email
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }
  if (appointment_status) {
    query += ' AND a.appointment_status = ?';
    params.push(appointment_status);
  }
  if (search) {
    query += ' AND (a.pet_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (date) {
    query += ' AND DATE(a.appointment_date) = ?';
    params.push(date);
  }

  query += ' ORDER BY a.appointment_date ASC, a.appointment_time ASC';

  try {
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Admin get appointments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/appointments/:id/status
// Update the appointment_status (pending → confirmed → completed | cancelled)
// Body: { appointment_status: 'confirmed' | 'completed' | 'cancelled' | 'pending' }
router.patch('/appointments/:id/status', async (req, res) => {
  const { id } = req.params;
  const { appointment_status } = req.body;

  const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
  if (!allowed.includes(appointment_status))
    return res.status(400).json({ error: `appointment_status must be one of: ${allowed.join(', ')}` });

  try {
    const [existing] = await db.query(
      `SELECT a.id, a.appointment_status, a.pet_name, u.username AS owner_username
       FROM appointments a JOIN users u ON u.id = a.user_id WHERE a.id = ?`,
      [id]
    );

    if (!existing.length)
      return res.status(404).json({ error: 'Appointment not found' });

    const prev = existing[0];

    // Also update the `status` column (upcoming/past/cancelled) when relevant
    let newStatus = prev.status;
    if (appointment_status === 'cancelled') newStatus = 'cancelled';
    if (appointment_status === 'completed') newStatus = 'past';

    await db.query(
      'UPDATE appointments SET appointment_status = ?, status = ? WHERE id = ?',
      [appointment_status, newStatus, id]
    );

    await audit({
      userId:   req.user.id,
      userRole: req.user.role,
      action:   AUDIT_ACTIONS.APPOINTMENT_STATUS_CHANGED,
      entity:   'appointment',
      entityId: parseInt(id),
      detail:   {
        petName:      prev.pet_name,
        owner:        prev.owner_username,
        previousStatus: prev.appointment_status,
        newStatus:    appointment_status,
      },
      ip: req.ip,
    });

    res.json({ message: 'Appointment status updated successfully' });
  } catch (err) {
    console.error('Admin update appointment status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

// GET /api/admin/audit-logs
// Returns paginated audit logs. Supports ?action=&userId=&page=&limit=
router.get('/audit-logs', async (req, res) => {
  const {
    action,
    userId,
    page  = 1,
    limit = 50,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT
      l.id,
      l.user_id,
      l.user_role,
      l.action,
      l.entity,
      l.entity_id,
      l.detail,
      l.ip_address,
      l.created_at,
      u.username
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE 1=1
  `;
  const params = [];

  if (action) {
    query += ' AND l.action = ?';
    params.push(action);
  }
  if (userId) {
    query += ' AND l.user_id = ?';
    params.push(userId);
  }

  query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  try {
    const [rows]  = await db.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) AS total FROM audit_logs WHERE 1=1';
    const countParams = [];
    if (action) { countQuery += ' AND action = ?';  countParams.push(action); }
    if (userId) { countQuery += ' AND user_id = ?'; countParams.push(userId); }

    const [[{ total }]] = await db.query(countQuery, countParams);

    await audit({
      userId:   req.user.id,
      userRole: req.user.role,
      action:   AUDIT_ACTIONS.ADMIN_VIEWED_AUDIT_LOGS,
      detail:   { filters: { action, userId, page, limit } },
      ip:       req.ip,
    });

    res.json({
      data:  rows,
      total,
      page:  parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error('Admin get audit logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── STATS / OVERVIEW ─────────────────────────────────────────────────────────

// GET /api/admin/stats
// Returns summary numbers for the admin dashboard overview cards
router.get('/stats', async (req, res) => {
  try {
    const [[{ totalAppointments }]] = await db.query('SELECT COUNT(*) AS totalAppointments FROM appointments');
    const [[{ activeUsers }]]       = await db.query('SELECT COUNT(*) AS activeUsers FROM users WHERE is_active = 1');
    const [[{ completedToday }]]    = await db.query(`SELECT COUNT(*) AS completedToday FROM appointments WHERE appointment_status = 'completed' AND DATE(updated_at) = CURDATE()`);
    const [[{ pendingCount }]]      = await db.query(`SELECT COUNT(*) AS pendingCount FROM appointments WHERE appointment_status = 'pending'`);
    const [[{ cancelledToday }]]    = await db.query(`SELECT COUNT(*) AS cancelledToday FROM appointments WHERE appointment_status = 'cancelled' AND DATE(updated_at) = CURDATE()`);

    res.json({
      totalAppointments,
      activeUsers,
      completedToday,
      pendingAppointments: pendingCount,
      cancelledToday,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
