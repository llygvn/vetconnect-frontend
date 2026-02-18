// ─── Scheduled tasks ─────────────────────────────────────────────────────────
// FIX: Moved expired token cleanup out of the logout request handler.
// Previously this ran on every logout, causing unnecessary DB latency.
// Run: import this file in your server entry point (e.g. index.js / app.js)
//   import './server-cron.js';

import cron from 'node-cron';
import db from './config/db.js';

// Runs every hour — deletes expired blacklisted tokens
cron.schedule('0 * * * *', async () => {
  try {
    const [result] = await db.query(
      'DELETE FROM blacklisted_tokens WHERE expires_at < NOW()'
    );
    console.log(`[CRON] Blacklist cleanup: removed ${result.affectedRows} expired token(s)`);
  } catch (err) {
    console.error('[CRON] Blacklist cleanup failed:', err);
  }
});