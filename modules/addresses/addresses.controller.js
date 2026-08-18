const asyncHandler = require("../../common/asyncHandler");
const service = require("./addresses.service");

exports.list = asyncHandler(async (req, res) => {
  const r = await service.list(req.user.id);
  res.status(200).json(r);
});

exports.create = asyncHandler(async (req, res) => {
  const r = await service.create(req.user.id, req.validated.body);
  res.status(201).json(r);
});

exports.update = asyncHandler(async (req, res) => {
  const id = Number(req.validated.params.id);
  const r = await service.update(req.user.id, id, req.validated.body);
  res.status(200).json(r);
});

exports.setDefault = asyncHandler(async (req, res) => {
  const id = Number(req.validated.params.id);
  const r = await service.setDefault(req.user.id, id);
  res.status(200).json(r);
});

exports.remove = asyncHandler(async (req, res) => {
  const id = Number(req.validated.params.id);
  const r = await service.remove(req.user.id, id);
  res.status(200).json(r);
});