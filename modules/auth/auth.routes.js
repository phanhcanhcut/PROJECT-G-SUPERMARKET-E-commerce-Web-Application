// src/modules/auth/auth.routes.js
const express = require("express");
const { z } = require("zod");
const validate = require("../../common/validate");
const auth = require("../../middlewares/auth");
const ctrl = require("./auth.controller");

const router = express.Router();

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(160),
    phone: z.string().max(20).optional(),
    password: z.string().min(8).max(72),
  }),
  query: z.any(),
  params: z.any(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(160),
    password: z.string().min(1).max(72),
  }),
  query: z.any(),
  params: z.any(),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(20),
  }),
  query: z.any(),
  params: z.any(),
});

router.post("/register", validate(registerSchema), ctrl.register);
router.post("/login", validate(loginSchema), ctrl.login);
router.post("/refresh", validate(refreshSchema), ctrl.refresh);

router.get("/me", auth, ctrl.me);
router.post("/logout", auth, ctrl.logout);

module.exports = router;