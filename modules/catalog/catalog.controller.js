// src/modules/catalog/catalog.controller.js
const asyncHandler = require("../../common/asyncHandler");
const service = require("./catalog.service");

exports.categories = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.getCategories(q);
  res.status(200).json(result);
});

exports.products = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.getProducts(q);
  res.status(200).json(result);
});

exports.productDetail = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  const result = await service.getProduct(Number(id));
  res.status(200).json(result);
});