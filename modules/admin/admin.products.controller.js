const asyncHandler = require("../../common/asyncHandler");
const service = require("./admin.service");

exports.create = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const dto = req.validated.body;
  const result = await service.createProduct(actorId, dto);
  res.status(201).json(result);
});

exports.update = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const productId = Number(req.validated.params.id);
  const dto = req.validated.body;
  const result = await service.updateProduct(actorId, productId, dto);
  res.status(200).json(result);
});

exports.deactivate = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const productId = Number(req.validated.params.id);
  const result = await service.deactivateProduct(actorId, productId);
  res.status(200).json(result);
});