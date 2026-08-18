// src/modules/admin/admin.service.js
const { AppError } = require("../../common/errors");
const repo = require("./admin.repo");

const ALLOWED = {
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKING", "CANCELLED"],
  PACKING: ["SHIPPING"],
  SHIPPING: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

function assertTransition(current, next) {
  const allowed = ALLOWED[current] || [];
  if (!allowed.includes(next)) {
    throw new AppError("INVALID_STATE_TRANSITION", "Chuyển trạng thái không hợp lệ", 422);
  }
}

function assertConfirmPolicy(order) {
  if (order.payment_method === "ONLINE" && order.payment_status !== "PAID") {
    throw new AppError("CANNOT_CONFIRM_UNPAID_ONLINE", "Đơn online chưa thanh toán, không thể duyệt", 422);
  }
}

function assertCancelPolicy(order) {
  if (order.payment_status === "PAID") {
    throw new AppError("CANNOT_CANCEL_PAID_ORDER", "Đơn đã thanh toán không thể hủy trực tiếp", 422);
  }
}

async function createProduct(actorId, dto) {
  try {
    const productId = await repo.createProductTx({ actorId, product: dto.product, images: dto.images || [], initialStock: dto.initialStock ?? 0 });
    return { productId, message: "CREATED" };
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") throw new AppError("SKU_EXISTS", "SKU đã tồn tại", 409);
    throw e;
  }
}

async function updateProduct(actorId, productId, dto) {
  try {
    const r = await repo.updateProductTx({ actorId, productId, patch: dto.patch, images: dto.images });
    if (!r.ok) throw new AppError("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);
    return { message: "UPDATED", productId };
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") throw new AppError("SKU_EXISTS", "SKU đã tồn tại", 409);
    throw e;
  }
}

async function deactivateProduct(actorId, productId) {
  const affected = await repo.deactivateProduct({ actorId, productId });
  if (affected !== 1) throw new AppError("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);
  return { message: "DEACTIVATED", productId };
}

async function searchInventory(query) {
  return repo.adminListInventory(query);
}

async function updateInventory(actorId, productId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new AppError("INVALID_QUANTITY", "Tồn kho phải >= 0", 400);
  const r = await repo.updateInventoryTx({ actorId, productId, quantity });
  if (!r.ok) throw new AppError(r.reason, r.reason === "INVENTORY_NOT_FOUND" ? "Không tìm thấy tồn kho" : r.reason, 404);
  return { message: "UPDATED", productId, oldQty: r.oldQty, newQty: quantity };
}

async function adjustInventory(actorId, productId, delta, note) {
  if (!Number.isInteger(delta) || delta === 0) throw new AppError("INVALID_DELTA", "delta phải là số nguyên khác 0", 400);
  const r = await repo.adjustInventoryTx({ actorId, productId, delta, note });
  if (!r.ok) {
    if (r.reason === "INSUFFICIENT_STOCK") throw new AppError(r.reason, "Không đủ tồn kho để trừ", 422);
    throw new AppError(r.reason, "Không tìm thấy tồn kho", 404);
  }
  return { message: "ADJUSTED", productId, oldQty: r.oldQty, delta, newQty: r.newQty };
}

async function searchOrders(query) {
  return repo.adminSearchOrders(query);
}

async function getOrderDetail(orderId) {
  const order = await repo.adminGetOrderDetail(orderId);
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng", 404);
  return { ...order, allowedNextStatuses: ALLOWED[order.status] || [] };
}

async function updateOrder(actorId, orderId, patch) {
  const order = await repo.adminGetOrderDetail(orderId);
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng", 404);
  const r = await repo.updateOrderAdminTx({ actorId, orderId, patch });
  if (!r.ok) {
    if (r.reason === "ORDER_NOT_FOUND") throw new AppError(r.reason, "Không tìm thấy đơn hàng", 404);
    if (r.reason === "ADDRESS_NOT_FOUND_OR_NOT_OWNED") throw new AppError(r.reason, "Địa chỉ không thuộc người mua của đơn", 422);
    throw new AppError(r.reason, r.reason, 422);
  }
  return { message: "ORDER_UPDATED", orderId, updatedFields: Object.keys(patch || {}) };
}

async function updateOrderStatus(actorId, orderId, nextStatus) {
  const order = await repo.adminGetOrderDetail(orderId);
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng", 404);
  assertTransition(order.status, nextStatus);
  if (nextStatus === "CONFIRMED") assertConfirmPolicy(order);
  if (nextStatus === "CANCELLED") assertCancelPolicy(order);
  const r = await repo.setOrderStatusTx({ actorId, orderId, nextStatus });
  if (!r.ok) throw new AppError(r.reason, "Không tìm thấy đơn hàng", 404);
  return { message: "STATUS_UPDATED", orderId, from: r.prevStatus, to: nextStatus };
}

async function searchCustomers(query) {
  return repo.adminListCustomers(query);
}

async function getCustomerDetail(customerId) {
  const customer = await repo.adminGetCustomerDetail(customerId);
  if (!customer) throw new AppError("CUSTOMER_NOT_FOUND", "Không tìm thấy người mua", 404);
  return customer;
}

async function updateCustomerStatus(actorId, customerId, status) {
  const affected = await repo.updateCustomerStatus({ actorId, customerId, status });
  if (affected !== 1) throw new AppError("CUSTOMER_NOT_FOUND", "Không tìm thấy người mua", 404);
  return { message: "CUSTOMER_STATUS_UPDATED", customerId, status };
}

async function listCoupons(query) {
  return repo.listCoupons(query);
}

async function createCoupon(actorId, dto) {
  try {
    const id = await repo.createCoupon({ actorId, dto });
    return { couponId: id, message: "CREATED" };
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") throw new AppError("CODE_EXISTS", "Coupon code đã tồn tại", 409);
    throw e;
  }
}

async function updateCoupon(actorId, couponId, dto) {
  try {
    const affected = await repo.updateCoupon({ actorId, couponId, dto });
    if (affected !== 1) throw new AppError("COUPON_NOT_FOUND", "Không tìm thấy coupon", 404);
    return { message: "UPDATED", couponId };
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") throw new AppError("CODE_EXISTS", "Coupon code đã tồn tại", 409);
    throw e;
  }
}

async function deactivateCoupon(actorId, couponId) {
  const affected = await repo.deactivateCoupon({ actorId, couponId });
  if (affected !== 1) throw new AppError("COUPON_NOT_FOUND", "Không tìm thấy coupon", 404);
  return { message: "DEACTIVATED", couponId };
}

async function revenueReport(query) {
  return repo.revenueReport(query);
}

async function auditLogs(query) {
  return repo.listAuditLogs(query);
}

module.exports = {
  createProduct,
  updateProduct,
  deactivateProduct,
  searchInventory,
  updateInventory,
  adjustInventory,
  searchOrders,
  getOrderDetail,
  updateOrder,
  updateOrderStatus,
  searchCustomers,
  getCustomerDetail,
  updateCustomerStatus,
  listCoupons,
  createCoupon,
  updateCoupon,
  deactivateCoupon,
  revenueReport,
  auditLogs,
};
