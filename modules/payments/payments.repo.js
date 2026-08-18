// src/modules/payments/payments.repo.js
const { pool } = require("../../infra/db/mysql");

// lấy order để check owner + trạng thái
async function findOrderForPayment({ userId, orderCode }) {
  const [rows] = await pool.query(
    `SELECT id, order_code, grand_total, status, payment_status, payment_method
     FROM orders
     WHERE order_code = ? AND user_id = ?
     LIMIT 1`,
    [orderCode, userId]
  );
  return rows[0] || null;
}

// insert payment INIT (retry nếu txn_ref trùng)
async function insertInitPayment({ orderId, provider, amount, txnRef, rawPayload }) {
  const [r] = await pool.query(
    `INSERT INTO payments (order_id, provider, amount, currency, txn_ref, status, raw_payload)
     VALUES (?, ?, ?, 'VND', ?, 'INIT', ?)`,
    [orderId, provider, amount, txnRef, JSON.stringify(rawPayload || {})]
  );
  return r.insertId;
}

async function getPaymentStatusByOrder({ userId, orderCode }) {
  const [rows] = await pool.query(
    `SELECT o.order_code, o.status, o.payment_status, o.payment_method, o.grand_total,
            p.provider, p.txn_ref, p.status AS payment_record_status, p.created_at AS payment_created_at
     FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.order_code = ? AND o.user_id = ?
     ORDER BY p.created_at DESC
     LIMIT 1`,
    [orderCode, userId]
  );
  return rows[0] || null;
}

// CALL stored procedure webhook (idempotency + trừ tồn kho)
async function callWebhookSP({ provider, txnRef, orderCode, amount, status, signatureOk, rawPayload }) {
  const conn = await pool.getConnection();
  try {
    await conn.query("CALL sp_handle_payment_webhook(?,?,?,?,?,?,?,@res)", [
      provider,
      txnRef,
      orderCode,
      amount,
      status,
      signatureOk,
      JSON.stringify(rawPayload),
    ]);
    const [rows] = await conn.query("SELECT @res AS result");
    return rows[0].result;
  } finally {
    conn.release();
  }
}

module.exports = {
  findOrderForPayment,
  insertInitPayment,
  getPaymentStatusByOrder,
  callWebhookSP,
};