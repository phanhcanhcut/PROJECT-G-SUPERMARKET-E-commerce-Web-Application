// src/modules/cart/cart.repo.js
const { pool } = require("../../infra/db/mysql");

async function ensureCart(userId) {
  const [rows] = await pool.query("SELECT id FROM carts WHERE user_id = ? LIMIT 1", [userId]);
  if (rows.length) return rows[0].id;

  const [r] = await pool.query("INSERT INTO carts (user_id) VALUES (?)", [userId]);
  return r.insertId;
}

async function getCartByUser(userId) {
  const cartId = await ensureCart(userId);

  const [items] = await pool.query(
    `SELECT
        ci.id AS itemId,
        ci.product_id AS productId,
        p.name,
        p.sku,
        p.brand,
        ci.qty,
        ci.price_snapshot AS unitPrice,
        ROUND(ci.qty * ci.price_snapshot, 2) AS lineTotal,
        i.quantity AS stock,
        p.status
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN inventory i ON i.product_id = p.id
     WHERE ci.cart_id = ?
     ORDER BY ci.id ASC`,
    [cartId]
  );

  const [[sumRow]] = await pool.query(
    `SELECT
        COUNT(*) AS itemLines,
        COALESCE(ROUND(SUM(qty * price_snapshot), 2), 0) AS subtotal
     FROM cart_items
     WHERE cart_id = ?`,
    [cartId]
  );

  const itemCount = items.reduce((acc, it) => acc + Number(it.qty), 0);

  return {
    cartId,
    items,
    summary: {
      itemLines: Number(sumRow.itemLines),
      itemCount,
      subtotal: Number(sumRow.subtotal),
    },
  };
}

async function getCartItemForUser(userId, itemId) {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.cart_id, ci.product_id, ci.qty
     FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id
     WHERE ci.id = ? AND c.user_id = ?
     LIMIT 1`,
    [itemId, userId]
  );
  return rows[0] || null;
}

async function getProductForCart(productId) {
  const [rows] = await pool.query(
    `SELECT
        p.id, p.status,
        COALESCE(p.discount_price, p.price) AS sellingPrice,
        i.quantity AS stock
     FROM products p
     JOIN inventory i ON i.product_id = p.id
     WHERE p.id = ?
     LIMIT 1`,
    [productId]
  );
  return rows[0] || null;
}

async function getExistingCartLine(cartId, productId) {
  const [rows] = await pool.query(
    `SELECT id, qty FROM cart_items WHERE cart_id = ? AND product_id = ? LIMIT 1`,
    [cartId, productId]
  );
  return rows[0] || null;
}

async function insertCartItem({ cartId, productId, qty, unitPrice }) {
  const [r] = await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, qty, price_snapshot)
     VALUES (?, ?, ?, ?)`,
    [cartId, productId, qty, unitPrice]
  );
  return r.insertId;
}

async function updateCartItem({ itemId, qty, unitPrice }) {
  const [r] = await pool.query(
    `UPDATE cart_items
     SET qty = ?, price_snapshot = ?
     WHERE id = ?`,
    [qty, unitPrice, itemId]
  );
  return r.affectedRows;
}

async function deleteCartItem(userId, itemId) {
  const [r] = await pool.query(
    `DELETE ci
     FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id
     WHERE ci.id = ? AND c.user_id = ?`,
    [itemId, userId]
  );
  return r.affectedRows;
}

module.exports = {
  ensureCart,
  getCartByUser,
  getCartItemForUser,
  getProductForCart,
  getExistingCartLine,
  insertCartItem,
  updateCartItem,
  deleteCartItem,
};