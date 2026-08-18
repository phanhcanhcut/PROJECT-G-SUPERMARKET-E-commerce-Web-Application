const asyncHandler = require("../../common/asyncHandler");
const service = require("./admin.service");

exports.revenue = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.revenueReport(q);
  res.status(200).json(result);
});