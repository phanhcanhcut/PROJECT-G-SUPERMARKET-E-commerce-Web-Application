// src/modules/payments/webhook.controller.js
const asyncHandler = require("../../common/asyncHandler");
const repo = require("./payments.repo");
const { providers } = require("./payments.service");

exports.handleWebhook = asyncHandler(async (req, res) => {
  const providerKey = String(req.params.provider || "").toLowerCase();
  const provider = providers[providerKey];
  if (!provider) return res.status(404).json({ error: { code: "PROVIDER_NOT_FOUND", message: "Provider not supported" } });

  // verify signature (bắt buộc)
  const signatureOk = provider.verifySignature(req.body) ? 1 : 0;
  if (!signatureOk) return res.status(400).json({ error: { code: "INVALID_SIGNATURE", message: "Invalid signature" } });

  // normalize payload
  const n = provider.normalizeWebhook(req.body);

  // call SP (idempotent txn_ref)
  const result = await repo.callWebhookSP({
    provider: provider.name,
    txnRef: n.txnRef,
    orderCode: n.orderCode,
    amount: n.amount,
    status: n.status,
    signatureOk: 1,
    rawPayload: req.body,
  });

  return res.status(200).json({ received: true, result });
});