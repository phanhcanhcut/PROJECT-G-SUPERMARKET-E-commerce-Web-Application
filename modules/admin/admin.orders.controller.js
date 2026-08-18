const asyncHandler = require("../../common/asyncHandler");
const service = require("./admin.service");

exports.list = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.searchOrders(q);
  res.status(200).json({ ...result, page: q.page, pageSize: q.pageSize });
});

exports.detail = asyncHandler(async (req, res) => {
  const orderId = Number(req.validated.params.id);
  const result = await service.getOrderDetail(orderId);
  res.status(200).json(result);
});

exports.update = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const orderId = Number(req.validated.params.id);
  const { patch } = req.validated.body;
  const result = await service.updateOrder(actorId, orderId, patch);
  res.status(200).json(result);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const orderId = Number(req.validated.params.id);
  const { status } = req.validated.body;
  const result = await service.updateOrderStatus(actorId, orderId, status);
  res.status(200).json(result);
});
