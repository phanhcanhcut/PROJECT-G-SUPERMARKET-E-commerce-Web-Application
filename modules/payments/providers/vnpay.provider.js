// src/modules/payments/providers/vnpay.provider.js
const crypto = require("crypto");

const provider = {
  name: "VNPAY",

  // Tạo txnRef + payUrl demo
  createPayment: async ({ orderCode, amount, txnRef }) => {
    const payUrl = `https://sandbox-gateway.example/vnpay/pay?orderCode=${encodeURIComponent(
      orderCode
    )}&txnRef=${encodeURIComponent(txnRef)}&amount=${amount}`;

    return { txnRef, payUrl };
  },

  // Verify HMAC demo: signature = HMAC(secret, orderCode|txnRef|amount|status)
  verifySignature: (payload) => {
    const secret = process.env.PAYMENT_SECRET || "change_me";
    const providedSig = payload.signature || "";
    const base = `${payload.orderCode}|${payload.txnRef}|${payload.amount}|${payload.status}`;
    const sig = crypto.createHmac("sha256", secret).update(base).digest("hex");
    return sig === providedSig;
  },

  normalizeWebhook: (payload) => {
    const status = String(payload.status || "").toUpperCase();
    return {
      txnRef: String(payload.txnRef),
      orderCode: String(payload.orderCode),
      amount: Number(payload.amount),
      status: status === "SUCCESS" ? "SUCCESS" : "FAILED",
    };
  },
};

module.exports = provider;