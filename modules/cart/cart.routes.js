// src/modules/cart/cart.routes.js
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/auth");
const validate = require("../../common/validate");
const ctrl = require("./cart.controller");

const router = express.Router();

const addItemSchema = z.object({
  body: z.object({
    productId: z.coerce.number().int().positive(),
    qty: z.coerce.number().int().positive(),
  }),
  query: z.any(),
  params: z.any(),
});

const updateQtySchema = z.object({
  body: z.object({
    qty: z.coerce.number().int().positive(),
  }),
  query: z.any(),
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

const idParamSchema = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

router.get("/", auth, ctrl.getCart);
router.post("/items", auth, validate(addItemSchema), ctrl.addItem);
router.put("/items/:id", auth, validate(updateQtySchema), ctrl.updateQty);
router.delete("/items/:id", auth, validate(idParamSchema), ctrl.removeItem);

module.exports = router;