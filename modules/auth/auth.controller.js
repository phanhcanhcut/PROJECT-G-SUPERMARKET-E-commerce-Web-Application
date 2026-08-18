// src/modules/auth/auth.controller.js
const asyncHandler = require("../../common/asyncHandler");
const service = require("./auth.service");

exports.register = asyncHandler(async (req, res) => {
  const dto = req.validated.body;
  const r = await service.register(dto);
  res.status(201).json(r);
});

exports.login = asyncHandler(async (req, res) => {
  const dto = req.validated.body;
  const r = await service.login(dto);
  res.status(200).json(r);
});

exports.refresh = asyncHandler(async (req, res) => {
  const dto = req.validated.body;
  const r = await service.refresh(dto);
  res.status(200).json(r);
});

exports.me = asyncHandler(async (req, res) => {
  const r = await service.me(req.user.id);
  res.status(200).json(r);
});

exports.logout = asyncHandler(async (_req, res) => {
  const r = await service.logout();
  res.status(200).json(r);
});