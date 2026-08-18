// src/modules/admin/admin.repo.js
const { pool } = require("../../infra/db/mysql");

async function writeAudit({ actorId, action, targetType, targetId, metadata }) {
  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES (?, ?, ?, ?, ?)`,
    [actorId, action, targetType, targetId || null, JSON.stringify(metadata || {})]
  );
}

/* ---------- PRODUCTS ---------- */
async function createProductTx({ actorId, product, images, initialStock }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO products (category_id, name, sku, brand, price, discount_price, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [product.categoryId, product.name, product.sku, product.brand || null, product.price, product.discountPrice ?? null, product.description || null]
    );
    const productId = r.insertId;
    await conn.query(`INSERT INTO inventory (product_id, quantity) VALUES (?, ?)`, [productId, initialStock ?? 0]);
    if (Array.isArray(images) && images.length) {
      const values = images.map((url, idx) => [productId, url, idx + 1]);
      await conn.query(`INSERT INTO product_images (product_id, url, sort_order) VALUES ?`, [values]);
    }
    await conn.commit();
    await writeAudit({ actorId, action: "CREATE_PRODUCT", targetType: "PRODUCT", targetId: productId, metadata: { sku: product.sku, name: product.name, initialStock: initialStock ?? 0 } });
    return productId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateProductTx({ actorId, productId, patch, images }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[exists]] = await conn.query(`SELECT id FROM products WHERE id = ? LIMIT 1`, [productId]);
    if (!exists) {
      await conn.rollback();
      return { ok: false, reason: "PRODUCT_NOT_FOUND" };
    }

    const hasDiscountPrice = Object.prototype.hasOwnProperty.call(patch || {}, "discountPrice");
    await conn.query(
      `UPDATE products
       SET category_id = COALESCE(?, category_id),
           name = COALESCE(?, name),
           sku = COALESCE(?, sku),
           brand = COALESCE(?, brand),
           price = COALESCE(?, price),
           discount_price = CASE WHEN ? = 1 THEN ? ELSE discount_price END,
           description = COALESCE(?, description),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        patch.categoryId ?? null,
        patch.name ?? null,
        patch.sku ?? null,
        patch.brand ?? null,
        patch.price ?? null,
        hasDiscountPrice ? 1 : 0,
        hasDiscountPrice ? patch.discountPrice ?? null : null,
        patch.description ?? null,
        patch.status ?? null,
        productId,
      ]
    );

    if (Array.isArray(images)) {
      await conn.query(`DELETE FROM product_images WHERE product_id = ?`, [productId]);
      if (images.length) {
        const values = images.map((url, idx) => [productId, url, idx + 1]);
        await conn.query(`INSERT INTO product_images (product_id, url, sort_order) VALUES ?`, [values]);
      }
    }

    await conn.commit();
    await writeAudit({ actorId, action: "UPDATE_PRODUCT", targetType: "PRODUCT", targetId: productId, metadata: { patch, imagesCount: Array.isArray(images) ? images.length : "unchanged" } });
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function deactivateProduct({ actorId, productId }) {
  const [r] = await pool.query(`UPDATE products SET status='INACTIVE', updated_at=CURRENT_TIMESTAMP(3) WHERE id = ?`, [productId]);
  if (r.affectedRows === 1) await writeAudit({ actorId, action: "DEACTIVATE_PRODUCT", targetType: "PRODUCT", targetId: productId, metadata: {} });
  return r.affectedRows;
}

/* ---------- INVENTORY ---------- */
async function adminListInventory({ keyword, status, lowStockBelow, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const where = ["1=1"];
  const params = [];
  if (keyword) { where.push("(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)"); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (status) { where.push("p.status = ?"); params.push(status); }
  if (lowStockBelow !== undefined) { where.push("COALESCE(i.quantity, 0) <= ?"); params.push(lowStockBelow); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM products p LEFT JOIN inventory i ON i.product_id = p.id ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.category_id AS categoryId, p.name, p.sku, p.brand, p.price, p.discount_price AS discountPrice, p.status, COALESCE(i.quantity, 0) AS quantity
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     ${whereSql}
     ORDER BY p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return { total: Number(countRow.total), items: rows };
}

async function updateInventoryTx({ actorId, productId, quantity }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(`SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE`, [productId]);
    if (!row) { await conn.rollback(); return { ok: false, reason: "INVENTORY_NOT_FOUND" }; }
    const oldQty = Number(row.quantity);
    await conn.query(`UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE product_id = ?`, [quantity, productId]);
    await conn.commit();
    await writeAudit({ actorId, action: "UPDATE_INVENTORY", targetType: "INVENTORY", targetId: productId, metadata: { oldQty, newQty: quantity } });
    return { ok: true, oldQty };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function adjustInventoryTx({ actorId, productId, delta, note }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(`SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE`, [productId]);
    if (!row) { await conn.rollback(); return { ok: false, reason: "INVENTORY_NOT_FOUND" }; }
    const oldQty = Number(row.quantity);
    const newQty = oldQty + Number(delta);
    if (newQty < 0) { await conn.rollback(); return { ok: false, reason: "INSUFFICIENT_STOCK" }; }
    await conn.query(`UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE product_id = ?`, [newQty, productId]);
    await conn.commit();
    await writeAudit({ actorId, action: "ADJUST_INVENTORY", targetType: "INVENTORY", targetId: productId, metadata: { oldQty, delta, newQty, note: note || null } });
    return { ok: true, oldQty, newQty };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ---------- ORDERS ---------- */
async function adminSearchOrders({ status, paymentStatus, paymentMethod, dateFrom, dateTo, orderCode, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const where = ["1=1"];
  const params = [];
  if (status) { where.push("o.status = ?"); params.push(status); }
  if (paymentStatus) { where.push("o.payment_status = ?"); params.push(paymentStatus); }
  if (paymentMethod) { where.push("o.payment_method = ?"); params.push(paymentMethod); }
  if (dateFrom) { where.push("o.created_at >= ?"); params.push(dateFrom); }
  if (dateTo) { where.push("o.created_at <= ?"); params.push(dateTo); }
  if (orderCode) { where.push("o.order_code LIKE ?"); params.push(`%${orderCode}%`); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT o.id, o.order_code, o.created_at, o.grand_total, o.status, o.payment_status, o.payment_method,
            u.id AS userId, u.name AS customerName, u.email AS customerEmail
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return { total: Number(countRow.total), items: rows };
}

async function adminGetOrderDetail(orderId) {
  const [rows] = await pool.query(
    `SELECT o.id, o.user_id AS userId, o.address_id AS addressId, o.order_code, o.created_at, o.subtotal, o.shipping_fee, o.discount_total, o.grand_total,
            o.status, o.payment_status, o.payment_method, o.note,
            u.name AS customerName, u.email AS customerEmail, u.phone AS customerPhone,
            a.detail AS address_detail, a.ward, a.district, a.city
     FROM orders o
     JOIN users u ON u.id = o.user_id
     JOIN addresses a ON a.id = o.address_id
     WHERE o.id = ?
     LIMIT 1`,
    [orderId]
  );
  const order = rows[0];
  if (!order) return null;
  const [items] = await pool.query(
    `SELECT oi.product_id, p.name, p.sku, oi.qty, oi.price_snapshot, oi.line_total
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`,
    [orderId]
  );
  const [payments] = await pool.query(
    `SELECT provider, txn_ref, status, amount, created_at FROM payments WHERE order_id = ? ORDER BY created_at DESC`,
    [orderId]
  );
  return { ...order, items, payments };
}

async function updateOrderAdminTx({ actorId, orderId, patch }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orderRows] = await conn.query(`SELECT id, user_id, address_id, payment_status, note FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
    const order = orderRows[0];
    if (!order) { await conn.rollback(); return { ok: false, reason: "ORDER_NOT_FOUND" }; }
    if (patch.addressId !== undefined) {
      const [addressRows] = await conn.query(`SELECT id FROM addresses WHERE id = ? AND user_id = ? LIMIT 1`, [patch.addressId, order.user_id]);
      if (!addressRows[0]) { await conn.rollback(); return { ok: false, reason: "ADDRESS_NOT_FOUND_OR_NOT_OWNED" }; }
    }
    const hasNote = Object.prototype.hasOwnProperty.call(patch || {}, "note");
    const hasPaymentStatus = Object.prototype.hasOwnProperty.call(patch || {}, "paymentStatus");
    const hasAddressId = Object.prototype.hasOwnProperty.call(patch || {}, "addressId");
    await conn.query(
      `UPDATE orders
       SET address_id = CASE WHEN ? = 1 THEN ? ELSE address_id END,
           payment_status = CASE WHEN ? = 1 THEN ? ELSE payment_status END,
           note = CASE WHEN ? = 1 THEN ? ELSE note END,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        hasAddressId ? 1 : 0, hasAddressId ? patch.addressId : null,
        hasPaymentStatus ? 1 : 0, hasPaymentStatus ? patch.paymentStatus : null,
        hasNote ? 1 : 0, hasNote ? (patch.note ?? null) : null,
        orderId,
      ]
    );
    await conn.commit();
    await writeAudit({ actorId, action: "UPDATE_ORDER", targetType: "ORDER", targetId: orderId, metadata: { before: order, patch } });
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function setOrderStatusTx({ actorId, orderId, nextStatus }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT id, status, payment_status, payment_method FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) { await conn.rollback(); return { ok: false, reason: "ORDER_NOT_FOUND" }; }
    const prevStatus = order.status;
    await conn.query(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [nextStatus, orderId]);
    await conn.commit();
    await writeAudit({ actorId, action: "UPDATE_ORDER_STATUS", targetType: "ORDER", targetId: orderId, metadata: { from: prevStatus, to: nextStatus } });
    return { ok: true, prevStatus };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ---------- CUSTOMERS ---------- */
async function adminListCustomers({ keyword, status, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const where = ["u.role = 'CUSTOMER'"];
  const params = [];
  if (keyword) { where.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)"); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (status) { where.push("u.status = ?"); params.push(status); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status,
            COUNT(DISTINCT o.id) AS ordersCount,
            ROUND(COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' AND o.status <> 'CANCELLED' THEN o.grand_total ELSE 0 END), 0), 2) AS totalSpent,
            MAX(o.created_at) AS lastOrderAt
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     ${whereSql}
     GROUP BY u.id, u.name, u.email, u.phone, u.status
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return { total: Number(countRow.total), items: rows };
}

async function adminGetCustomerDetail(customerId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status,
            COUNT(DISTINCT o.id) AS ordersCount,
            ROUND(COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' AND o.status <> 'CANCELLED' THEN o.grand_total ELSE 0 END), 0), 2) AS totalSpent,
            MAX(o.created_at) AS lastOrderAt
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     WHERE u.id = ? AND u.role = 'CUSTOMER'
     GROUP BY u.id, u.name, u.email, u.phone, u.status`,
    [customerId]
  );
  const customer = rows[0];
  if (!customer) return null;
  const [addresses] = await pool.query(`SELECT id, detail, ward, district, city, is_default FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC`, [customerId]);
  const [recentOrders] = await pool.query(
    `SELECT id, order_code, created_at, grand_total, status, payment_status, payment_method
     FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 10`,
    [customerId]
  );
  return { ...customer, addresses, recentOrders };
}

async function updateCustomerStatus({ actorId, customerId, status }) {
  const [r] = await pool.query(`UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND role = 'CUSTOMER'`, [status, customerId]);
  if (r.affectedRows === 1) {
    await writeAudit({ actorId, action: "UPDATE_CUSTOMER_STATUS", targetType: "USER", targetId: customerId, metadata: { status } });
  }
  return r.affectedRows;
}

/* ---------- COUPONS ---------- */
async function listCoupons({ isActive, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const where = ["1=1"];
  const params = [];
  if (isActive !== undefined) { where.push("is_active = ?"); params.push(isActive ? 1 : 0); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM coupons ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT id, code, type, value, min_order, max_discount, start_at, end_at, usage_limit, used_count, is_active
     FROM coupons ${whereSql}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return { total: Number(countRow.total), items: rows };
}

async function createCoupon({ actorId, dto }) {
  const [r] = await pool.query(
    `INSERT INTO coupons (code, type, value, min_order, max_discount, start_at, end_at, usage_limit, used_count, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [dto.code, dto.type, dto.value, dto.minOrder ?? 0, dto.maxDiscount ?? null, dto.startAt, dto.endAt, dto.usageLimit ?? 0, dto.isActive ? 1 : 0]
  );
  await writeAudit({ actorId, action: "CREATE_COUPON", targetType: "COUPON", targetId: r.insertId, metadata: { code: dto.code } });
  return r.insertId;
}

async function updateCoupon({ actorId, couponId, dto }) {
  const hasMaxDiscount = Object.prototype.hasOwnProperty.call(dto || {}, "maxDiscount");
  const [r] = await pool.query(
    `UPDATE coupons
     SET code = COALESCE(?, code),
         type = COALESCE(?, type),
         value = COALESCE(?, value),
         min_order = COALESCE(?, min_order),
         max_discount = CASE WHEN ? = 1 THEN ? ELSE max_discount END,
         start_at = COALESCE(?, start_at),
         end_at = COALESCE(?, end_at),
         usage_limit = COALESCE(?, usage_limit),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`,
    [dto.code ?? null, dto.type ?? null, dto.value ?? null, dto.minOrder ?? null, hasMaxDiscount ? 1 : 0, hasMaxDiscount ? dto.maxDiscount ?? null : null, dto.startAt ?? null, dto.endAt ?? null, dto.usageLimit ?? null, dto.isActive === undefined ? null : (dto.isActive ? 1 : 0), couponId]
  );
  if (r.affectedRows === 1) await writeAudit({ actorId, action: "UPDATE_COUPON", targetType: "COUPON", targetId: couponId, metadata: dto });
  return r.affectedRows;
}

async function deactivateCoupon({ actorId, couponId }) {
  const [r] = await pool.query(`UPDATE coupons SET is_active = 0 WHERE id = ?`, [couponId]);
  if (r.affectedRows === 1) await writeAudit({ actorId, action: "DEACTIVATE_COUPON", targetType: "COUPON", targetId: couponId, metadata: {} });
  return r.affectedRows;
}

/* ---------- REPORTS ---------- */
async function revenueReport({ from, to, groupBy }) {
  const fmt = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";
  const [series] = await pool.query(
    `SELECT DATE_FORMAT(o.created_at, ?) AS bucket, COUNT(*) AS ordersCount, ROUND(SUM(o.grand_total), 2) AS revenue
     FROM orders o
     WHERE o.payment_status = 'PAID' AND o.status <> 'CANCELLED' AND o.created_at >= ? AND o.created_at <= ?
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [fmt, from, to]
  );

  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS totalOrders,
            ROUND(COALESCE(SUM(o.grand_total), 0), 2) AS totalRevenue,
            ROUND(COALESCE(AVG(o.grand_total), 0), 2) AS avgOrderValue
     FROM orders o
     WHERE o.payment_status = 'PAID' AND o.status <> 'CANCELLED' AND o.created_at >= ? AND o.created_at <= ?`,
    [from, to]
  );

  const [byPaymentMethod] = await pool.query(
    `SELECT o.payment_method, COUNT(*) AS ordersCount, ROUND(SUM(o.grand_total), 2) AS revenue
     FROM orders o
     WHERE o.payment_status = 'PAID' AND o.status <> 'CANCELLED' AND o.created_at >= ? AND o.created_at <= ?
     GROUP BY o.payment_method
     ORDER BY revenue DESC`,
    [from, to]
  );

  const [topProducts] = await pool.query(
    `SELECT p.id, p.name, p.sku, SUM(oi.qty) AS totalQty, ROUND(SUM(oi.line_total), 2) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE o.payment_status = 'PAID' AND o.status <> 'CANCELLED' AND o.created_at >= ? AND o.created_at <= ?
     GROUP BY p.id, p.name, p.sku
     ORDER BY revenue DESC, totalQty DESC
     LIMIT 10`,
    [from, to]
  );

  return {
    series,
    totalRevenue: Number(summary.totalRevenue || 0),
    totalOrders: Number(summary.totalOrders || 0),
    avgOrderValue: Number(summary.avgOrderValue || 0),
    byPaymentMethod,
    topProducts,
  };
}

/* ---------- AUDIT ---------- */
async function listAuditLogs({ actorId, action, from, to, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const where = ["1=1"];
  const params = [];
  if (actorId) { where.push("actor_id = ?"); params.push(actorId); }
  if (action) { where.push("action = ?"); params.push(action); }
  if (from) { where.push("created_at >= ?"); params.push(from); }
  if (to) { where.push("created_at <= ?"); params.push(to); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT id, actor_id AS actorId, action, target_type AS targetType, target_id AS targetId, metadata, created_at AS createdAt
     FROM audit_logs ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return { total: Number(countRow.total), items: rows };
}

module.exports = {
  writeAudit,
  createProductTx,
  updateProductTx,
  deactivateProduct,
  adminListInventory,
  updateInventoryTx,
  adjustInventoryTx,
  adminSearchOrders,
  adminGetOrderDetail,
  updateOrderAdminTx,
  setOrderStatusTx,
  adminListCustomers,
  adminGetCustomerDetail,
  updateCustomerStatus,
  listCoupons,
  createCoupon,
  updateCoupon,
  deactivateCoupon,
  revenueReport,
  listAuditLogs,
};
