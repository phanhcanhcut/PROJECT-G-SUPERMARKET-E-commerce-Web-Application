// src/modules/payments/providers/provider.interface.js
class PaymentProvider {
  name() { throw new Error("not implemented"); }
  verifySignature(_payload) { return false; }
  normalizeWebhook(_payload) { throw new Error("not implemented"); }
  createPayment(_params) { throw new Error("not implemented"); }
}
module.exports = { PaymentProvider };