const { pool } = require("../../infra/db/mysql");

async function listByUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, detail, ward, district, city, is_default, created_at
     FROM addresses
     WHERE user_id = ?
     ORDER BY is_default DESC, id DESC`,
    [userId]
  );
  return rows;
}

async function createTx({ userId, detail, ward, district, city, isDefault }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[cntRow]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM addresses WHERE user_id = ?`,
      [userId]
    );
    const hasAny = Number(cntRow.cnt) > 0;

    // Nếu user chưa có địa chỉ nào -> ép default=1
    let makeDefault = !!isDefault || !hasAny;

    if (makeDefault) {
      await conn.query(`UPDATE addresses SET is_default = 0 WHERE user_id = ?`, [userId]);
    }

    const [r] = await conn.query(
      `INSERT INTO addresses (user_id, detail, ward, district, city, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, detail, ward || null, district || null, city, makeDefault ? 1 : 0]
    );

    await conn.commit();
    return r.insertId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateTx({ userId, id, detail, ward, district, city, isDefault }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // đảm bảo địa chỉ thuộc user
    const [rows] = await conn.query(
      `SELECT id, is_default FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE`,
      [id, userId]
    );
    if (!rows.length) {
      await conn.rollback();
      return { ok: false, reason: "ADDRESS_NOT_FOUND" };
    }

    if (isDefault === true) {
      await conn.query(`UPDATE addresses SET is_default = 0 WHERE user_id = ?`, [userId]);
    }

    await conn.query(
      `UPDATE addresses
       SET detail = COALESCE(?, detail),
           ward = ?,
           district = ?,
           city = COALESCE(?, city),
           is_default = COALESCE(?, is_default)
       WHERE id = ? AND user_id = ?`,
      [
        detail ?? null,
        ward ?? null,
        district ?? null,
        city ?? null,
        isDefault === undefined ? null : (isDefault ? 1 : 0),
        id,
        userId,
      ]
    );

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function setDefaultTx({ userId, id }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE`,
      [id, userId]
    );
    if (!rows.length) {
      await conn.rollback();
      return { ok: false, reason: "ADDRESS_NOT_FOUND" };
    }

    await conn.query(`UPDATE addresses SET is_default = 0 WHERE user_id = ?`, [userId]);
    await conn.query(`UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?`, [id, userId]);

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function remove({ userId, id }) {
  const [r] = await pool.query(
    `DELETE FROM addresses WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return r.affectedRows;
}

module.exports = { listByUser, createTx, updateTx, setDefaultTx, remove };