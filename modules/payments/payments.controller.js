// src/modules/payments/payments.controller.js
const asyncHandler = require("../../common/asyncHandler");
const service = require("./payments.service");

exports.create = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dto = req.validated.body;
  const result = await service.createPaymentSession(userId, dto);
  res.status(200).json(result);
});

exports.status = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { orderCode } = req.validated.query;
  const result = await service.paymentStatus(userId, orderCode);
  res.status(200).json(result);
});