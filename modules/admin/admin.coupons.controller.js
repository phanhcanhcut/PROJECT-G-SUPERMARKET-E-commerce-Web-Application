const asyncHandler = require("../../common/asyncHandler");
const service = require("./admin.service");

exports.list = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.listCoupons(q);
  res.status(200).json({ ...result, page: q.page, pageSize: q.pageSize });
});

exports.create = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const dto = req.validated.body;
  const result = await service.createCoupon(actorId, dto);
  res.status(201).json(result);
});

exports.update = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const couponId = Number(req.validated.params.id);
  const dto = req.validated.body;
  const result = await service.updateCoupon(actorId, couponId, dto);
  res.status(200).json(result);
});

exports.deactivate = asyncHandler(async (req, res) => {
  const actorId = req.user.id;
  const couponId = Number(req.validated.params.id);
  const result = await service.deactivateCoupon(actorId, couponId);
  res.status(200).json(result);
});