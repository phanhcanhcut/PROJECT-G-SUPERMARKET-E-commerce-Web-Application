// src/modules/orders/orders.repo.js
const { pool } = require("../../infra/db/mysql");
const { AppError } = require("../../common/errors");

function mapDbError(err) {
  const msg = String(err?.sqlMessage || err?.message || "");

  // Sai số lượng tham số procedure
  if (err?.errno === 1318 || /Incorrect number of arguments/i.test(msg)) {
    return new AppError(
      "ORDER_SP_ARG_MISMATCH",
      "Stored procedure tạo đơn đang lệch tham số so với backend.",
      500
    );
  }

  // SIGNAL SQLSTATE '45000'
  if (err?.errno === 1644) {
    if (/CART_EMPTY/i.test(msg)) {
      return new AppError("CART_EMPTY", "Giỏ hàng đang trống.", 422);
    }
    if (/ADDRESS_NOT_FOUND/i.test(msg)) {
      return new AppError("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ giao hàng.", 404);
    }
    if (/INVALID_COUPON/i.test(msg) || /COUPON/i.test(msg)) {
      return new AppError("INVALID_COUPON", "Mã giảm giá không hợp lệ hoặc không áp dụng được.", 422);
    }
    if (/OUT_OF_STOCK/i.test(msg)) {
      return new AppError("OUT_OF_STOCK", "Một hoặc nhiều sản phẩm không đủ tồn kho.", 422);
    }
    return new AppError("ORDER_CREATE_FAILED", msg || "Không tạo được đơn hàng.", 422);
  }

  return err;
}

async function callCreateOrderSP({ userId, addressId, couponCode, paymentMethod, shippingFee, note }) {
  const conn = await pool.getConnection();
  try {
    // QUAN TRỌNG:
    // bản này giả định SP có thêm p_note
    await conn.query(
      "CALL sp_create_order_from_cart(?,?,?,?,?,?,@oid,@ocode,@grand)",
      [userId, addressId, couponCode || "", paymentMethod, shippingFee, note]
    );

    const [rows] = await conn.query(
      "SELECT @oid AS orderId, @ocode AS orderCode, @grand AS grandTotal"
    );

    return rows[0];
  } catch (err) {
    throw mapDbError(err);
  } finally {
    conn.release();
  }
}

async function findOrdersByUser({ userId, status, paymentStatus, paymentMethod, page, pageSize }) {
  const offset = (page - 1) * pageSize;

  const where = ["o.user_id = ?"];
  const params = [userId];

  if (status) {
    where.push("o.status = ?");
    params.push(status);
  }

  if (paymentStatus) {
    where.push("o.payment_status = ?");
    params.push(paymentStatus);
  }

  if (paymentMethod) {
    where.push("o.payment_method = ?");
    params.push(paymentMethod);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT o.order_code, o.created_at, o.grand_total, o.status, o.payment_status, o.payment_method
     FROM orders o
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { total: Number(countRow.total), items: rows };
}

async function findOrderDetailByCode({ userId, orderCode }) {
  const [orders] = await pool.query(
    `SELECT o.id, o.order_code, o.created_at, o.subtotal, o.shipping_fee, o.discount_total, o.grand_total,
            o.status, o.payment_status, o.payment_method, o.note,
            a.detail AS address_detail, a.ward, a.district, a.city
     FROM orders o
     JOIN addresses a ON a.id = o.address_id
     WHERE o.order_code = ? AND o.user_id = ?
     LIMIT 1`,
    [orderCode, userId]
  );

  const order = orders[0];
  if (!order) return null;

  const [items] = await pool.query(
    `SELECT oi.product_id, p.name, p.sku, oi.qty, oi.price_snapshot, oi.line_total
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`,
    [order.id]
  );

  const [payments] = await pool.query(
    `SELECT provider, txn_ref, status, amount, created_at
     FROM payments
     WHERE order_id = ?
     ORDER BY created_at DESC
     LIMIT 3`,
    [order.id]
  );

  return { ...order, items, payments };
}

async function cancelOrderByCode({ userId, orderCode }) {
  const [r] = await pool.query(
    `UPDATE orders
     SET status='CANCELLED'
     WHERE order_code = ? AND user_id = ? AND status='NEW' AND payment_status <> 'PAID'`,
    [orderCode, userId]
  );
  return r.affectedRows;
}

module.exports = {
  callCreateOrderSP,
  findOrdersByUser,
  findOrderDetailByCode,
  cancelOrderByCode,
};