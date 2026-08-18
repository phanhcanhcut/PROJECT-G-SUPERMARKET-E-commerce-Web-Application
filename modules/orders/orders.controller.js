// src/modules/orders/orders.controller.js
const asyncHandler = require("../../common/asyncHandler");
const service = require("./orders.service");

exports.createOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dto = req.validated.body;
  const result = await service.createOrderFromCart(userId, dto);
  res.status(201).json(result);
});

exports.myOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const q = req.validated.query;
  const result = await service.myOrders(userId, q);
  res.status(200).json(result);
});

exports.orderDetail = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { orderCode } = req.validated.params;
  const result = await service.orderDetail(userId, orderCode);
  res.status(200).json(result);
});

exports.cancel = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { orderCode } = req.validated.params;
  const result = await service.cancelOrder(userId, orderCode);
  res.status(200).json(result);
});