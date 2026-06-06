const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('ALTER TYPE "Role" ADD VALUE IF NOT EXISTS \'CASHIER\'');
    const r = await pool.query('SELECT enum_range(NULL::"Role") AS roles');
    console.log('ENUM:', r.rows[0].roles);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
