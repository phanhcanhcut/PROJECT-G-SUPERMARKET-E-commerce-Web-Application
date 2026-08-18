// src/modules/orders/orders.service.js
const { AppError } = require("../../common/errors");
const repo = require("./orders.repo");

function orderStatusText(s) {
  return {
    NEW: "Chờ admin duyệt",
    CONFIRMED: "Đã duyệt",
    PACKING: "Đang chuẩn bị hàng",
    SHIPPING: "Đang giao hàng",
    DELIVERED: "Đã giao",
    CANCELLED: "Đã hủy",
  }[s] || s;
}

function paymentStatusText(s) {
  return {
    PENDING_PAYMENT: "Chưa thanh toán",
    PAID: "Đã thanh toán",
    PAYMENT_FAILED: "Thanh toán lỗi",
    REFUNDED: "Đã hoàn tiền",
  }[s] || s;
}

async function createOrderFromCart(userId, dto) {
  const shippingFee = dto.shippingFee ?? 15000;

  const r = await repo.callCreateOrderSP({
    userId,
    addressId: dto.addressId,
    couponCode: dto.couponCode,
    paymentMethod: dto.paymentMethod,
    shippingFee,
    note: dto.note || null,
  });

  return {
    orderId: Number(r.orderId),
    orderCode: String(r.orderCode),
    grandTotal: Number(r.grandTotal),
    status: "NEW",
    statusLabel: orderStatusText("NEW"),
    paymentStatus: "PENDING_PAYMENT",
    paymentStatusLabel: paymentStatusText("PENDING_PAYMENT"),
    paymentMethod: dto.paymentMethod,
    canPay: dto.paymentMethod === "ONLINE",
    nextStep: dto.paymentMethod === "ONLINE" ? "CREATE_PAYMENT" : "WAIT_ADMIN_APPROVAL",
  };
}

async function myOrders(userId, query) {
  return repo.findOrdersByUser({
    userId,
    status: query.status || null,
    paymentStatus: query.paymentStatus || null,
    paymentMethod: query.paymentMethod || null,
    page: query.page,
    pageSize: query.pageSize,
  });
}

async function orderDetail(userId, orderCode) {
  const order = await repo.findOrderDetailByCode({ userId, orderCode });
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng", 404);
  return order;
}

async function cancelOrder(userId, orderCode) {
  const affected = await repo.cancelOrderByCode({ userId, orderCode });
  if (affected !== 1) {
    throw new AppError("CANNOT_CANCEL", "Không thể hủy đơn theo chính sách", 422);
  }
  return {
    message: "CANCELLED",
    orderCode,
    status: "CANCELLED",
    statusLabel: orderStatusText("CANCELLED"),
  };
}

module.exports = {
  createOrderFromCart,
  myOrders,
  orderDetail,
  cancelOrder
};