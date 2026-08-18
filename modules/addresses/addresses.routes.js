const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/auth");
const validate = require("../../common/validate");
const ctrl = require("./addresses.controller");

const router = express.Router();
router.use(auth);

const createSchema = z.object({
  body: z.object({
    detail: z.string().min(3).max(255),
    ward: z.string().max(120).optional(),
    district: z.string().max(120).optional(),
    city: z.string().min(2).max(120),
    isDefault: z.boolean().optional(),
  }),
  query: z.any(),
  params: z.any(),
});

const updateSchema = z.object({
  body: z.object({
    detail: z.string().min(3).max(255).optional(),
    ward: z.string().max(120).optional().nullable(),
    district: z.string().max(120).optional().nullable(),
    city: z.string().min(2).max(120).optional(),
    isDefault: z.boolean().optional(),
  }),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

const idParam = z.object({
  body: z.any(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

router.get("/", ctrl.list);
router.post("/", validate(createSchema), ctrl.create);
router.put("/:id", validate(updateSchema), ctrl.update);
router.put("/:id/default", validate(idParam), ctrl.setDefault);
router.delete("/:id", validate(idParam), ctrl.remove);

module.exports = router;