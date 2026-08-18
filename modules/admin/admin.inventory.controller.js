const asyncHandler = require("../../common/asyncHandler");
const service = require("./admin.service");

exports.list = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.searchInventory(q);
  res.status(200).json({ ...result, page: q.page, pageSize: q.pageSize });
});

exports.update = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const productId = Number(req.validated.params.productId);
  const { quantity } = req.validated.body;
  const result = await service.updateInventory(actorId, productId, quantity);
  res.status(200).json(result);
});

exports.adjust = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const productId = Number(req.validated.params.productId);
  const { delta, note } = req.validated.body;
  const result = await service.adjustInventory(actorId, productId, delta, note);
  res.status(200).json(result);
});
