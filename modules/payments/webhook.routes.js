// src/modules/payments/webhook.routes.js
const express = require("express");
const ctrl = require("./webhook.controller");

const router = express.Router();
router.post("/:provider", express.json({ limit: "1mb" }), ctrl.handleWebhook);

module.exports = router;