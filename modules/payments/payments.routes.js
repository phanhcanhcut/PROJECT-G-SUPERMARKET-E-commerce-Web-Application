// src/modules/payments/payments.routes.js
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/auth");
const validate = require("../../common/validate");
const ctrl = require("./payments.controller");

const router = express.Router();

const createSchema = z.object({
  body: z.object({
    orderCode: z.string().min(5).max(30),
    provider: z.enum(["vnpay"]), // demo, thêm momo/stripe sau
  }),
  query: z.any(),
  params: z.any(),
});

const statusSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    orderCode: z.string().min(5).max(30),
  }),
});

router.post("/create", auth, validate(createSchema), ctrl.create);
router.get("/status", auth, validate(statusSchema), ctrl.status);

module.exports = router;