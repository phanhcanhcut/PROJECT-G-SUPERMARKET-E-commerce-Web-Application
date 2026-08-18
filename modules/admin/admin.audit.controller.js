const asyncHandler = require("../../common/asyncHandler");
const service = require("./admin.service");

exports.list = asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const result = await service.auditLogs(q);
  res.status(200).json({ ...result, page: q.page, pageSize: q.pageSize });
});                                         