// src/modules/catalog/catalog.routes.js
const express = require("express");
const { z } = require("zod");
const validate = require("../../common/validate");
const ctrl = require("./catalog.controller");

const router = express.Router();

const categoriesSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    parentId: z.coerce.number().int().positive().optional(),
    tree: z.coerce.number().int().optional(), // tree=1
  }),
});

const productsSchema = z.object({
  body: z.any(),
  params: z.any(),
  query: z.object({
    keyword: z.string().max(200).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    brand: z.string().max(120).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sort: z.enum(["newest", "price_asc", "price_desc", "name_asc"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const productDetailSchema = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

router.get("/categories", validate(categoriesSchema), ctrl.categories);
router.get("/products", validate(productsSchema), ctrl.products);
router.get("/products/:id", validate(productDetailSchema), ctrl.productDetail);

module.exports = router;