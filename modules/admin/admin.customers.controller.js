const asyncHandler = require("../../common/asyncHandler");
const service = require("./admin.service");

exports.list = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.searchCustomers(q);
  res.status(200).json({ ...result, page: q.page, pageSize: q.pageSize });
});

exports.detail = asyncHandler(async (req, res) => {
  const customerId = Number(req.validated.params.id);
  const result = await service.getCustomerDetail(customerId);
  res.status(200).json(result);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const customerId = Number(req.validated.params.id);
  const { status } = req.validated.body;
  const result = await service.updateCustomerStatus(actorId, customerId, status);
  res.status(200).json(result);
});
