// src/modules/payments/payments.service.js
const crypto = require("crypto");
const { AppError } = require("../../common/errors");
const repo = require("./payments.repo");

// provider registry
const providers = {
  vnpay: require("./providers/vnpay.provider"),
};

function genTxnRef() {
  return `TXN_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

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

async function createPaymentSession(userId, dto) {
  const providerKey = String(dto.provider || "").toLowerCase();
  const provider = providers[providerKey];
  if (!provider) throw new AppError("PROVIDER_NOT_FOUND", "Provider không hỗ trợ", 404);

  const order = await repo.findOrderForPayment({ userId, orderCode: dto.orderCode });
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng", 404);

  if (order.payment_method !== "ONLINE") {
    throw new AppError("ORDER_NOT_ONLINE", "Đơn không phải thanh toán online", 422);
  }
  if (order.status === "CANCELLED") {
    throw new AppError("ORDER_CANCELLED", "Đơn đã bị hủy", 422);
  }
  if (order.payment_status === "PAID") {
    throw new AppError("ORDER_ALREADY_PAID", "Đơn đã thanh toán", 422);
  }
  if (order.payment_status !== "PENDING_PAYMENT") {
    throw new AppError("ORDER_NOT_PAYABLE", "Đơn không ở trạng thái có thể thanh toán", 422);
  }

  const amount = Number(order.grand_total);

  let txnRef, paymentId;
  for (let i = 0; i < 3; i++) {
    txnRef = genTxnRef();
    try {
      paymentId = await repo.insertInitPayment({
        orderId: order.id,
        provider: provider.name,
        amount,
        txnRef,
        rawPayload: { createdBy: "payments/create", orderCode: order.order_code },
      });
      break;
    } catch (e) {
      if (e && e.code === "ER_DUP_ENTRY") continue;
      throw e;
    }
  }

  if (!paymentId) {
    throw new AppError("PAYMENT_CREATE_FAILED", "Không tạo được payment session", 500);
  }

  const created = await provider.createPayment({
    orderCode: order.order_code,
    amount,
    txnRef,
  });

  return {
    orderCode: order.order_code,
    txnRef: created.txnRef,
    payUrl: created.payUrl,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    paymentStatusLabel: paymentStatusText(order.payment_status),
    orderStatus: order.status,
    orderStatusLabel: orderStatusText(order.status),
  };
}

async function paymentStatus(userId, orderCode) {
  const row = await repo.getPaymentStatusByOrder({ userId, orderCode });
  if (!row) throw new AppError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng", 404);

  return {
    orderCode: row.order_code,
    orderStatus: row.status,
    orderStatusLabel: orderStatusText(row.status),
    paymentStatus: row.payment_status,
    paymentStatusLabel: paymentStatusText(row.payment_status),
    paymentMethod: row.payment_method,
    grandTotal: Number(row.grand_total),
    canPay:
      row.payment_method === "ONLINE" &&
      row.payment_status === "PENDING_PAYMENT" &&
      row.status !== "CANCELLED",
    latestPayment: row.txn_ref
      ? {
          provider: row.provider,
          txnRef: row.txn_ref,
          status: row.payment_record_status,
          createdAt: row.payment_created_at,
        }
      : null,
  };
}

module.exports = { createPaymentSession, paymentStatus, providers };