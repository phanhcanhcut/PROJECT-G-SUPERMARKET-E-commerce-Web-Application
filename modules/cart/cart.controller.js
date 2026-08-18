// src/modules/cart/cart.controller.js
const asyncHandler = require("../../common/asyncHandler");
const service = require("./cart.service");

exports.getCart = asyncHandler(async (req, res) => {
  const result = await service.getCart(req.user.id);
  res.status(200).json(result);
});

exports.addItem = asyncHandler(async (req, res) => {
  const dto = req.validated.body;
  const result = await service.addItem(req.user.id, dto);
  res.status(200).json(result);
});

exports.updateQty = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  const dto = req.validated.body;
  const result = await service.updateQty(req.user.id, Number(id), dto);
  res.status(200).json(result);
});

exports.removeItem = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  const result = await service.removeItem(req.user.id, Number(id));
  res.status(200).json(result);
});