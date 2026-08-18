// src/modules/orders/orders.routes.js
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/auth");
const validate = require("../../common/validate");
const ctrl = require("./orders.controller");

const router = express.Router();

const createOrderSchema = z.object({
  body: z.object({
    addressId: z.coerce.number().int().positive(),
    couponCode: z.string().max(40).optional(),
    paymentMethod: z.enum(["ONLINE", "COD"]),
    shippingFee: z.coerce.number().nonnegative().optional(),
    note: z.string().max(255).optional(),
  }),
  query: z.any(),
  params: z.any(),
});

const myOrdersSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
    paymentMethod: z.enum(["ONLINE", "COD"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const orderCodeParamSchema = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({
    orderCode: z.string().min(5).max(30),
  }),
});

router.post("/", auth, validate(createOrderSchema), ctrl.createOrder);
router.get("/my", auth, validate(myOrdersSchema), ctrl.myOrders);
router.get("/:orderCode", auth, validate(orderCodeParamSchema), ctrl.orderDetail);
router.post("/:orderCode/cancel", auth, validate(orderCodeParamSchema), ctrl.cancel);

module.exports = router;