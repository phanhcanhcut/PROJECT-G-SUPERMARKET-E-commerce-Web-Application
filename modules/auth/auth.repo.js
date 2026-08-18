// src/modules/auth/auth.repo.js
const { pool } = require("../../infra/db/mysql");

async function findByEmail(email) {
  const [rows] = await pool.query(
    "SELECT id, name, email, phone, password_hash, role, status FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    "SELECT id, name, email, phone, role, status FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

async function createUser({ name, email, phone, passwordHash }) {
  const [r] = await pool.query(
    "INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?,?,?,?, 'CUSTOMER', 'ACTIVE')",
    [name, email, phone || null, passwordHash]
  );
  return r.insertId;
}

module.exports = { findByEmail, findById, createUser };