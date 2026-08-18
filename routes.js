// src/routes.js
const authRoutes = require("./modules/auth/auth.routes");
const catalogRoutes = require("./modules/catalog/catalog.routes");
const cartRoutes = require("./modules/cart/cart.routes");
const orderRoutes = require("./modules/orders/orders.routes");
const paymentsRoutes = require("./modules/payments/payments.routes");
const webhookRoutes = require("./modules/payments/webhook.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const addressesRoutes = require("./modules/addresses/addresses.routes");
module.exports = function mountRoutes(app) {
  // Public + Customer
  app.use("/api/auth", authRoutes);
  app.use("/api", catalogRoutes); // /categories, /products
  app.use("/api/cart", cartRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/payments", paymentsRoutes);

  // Payment gateway webhook (public)
  app.use("/api/payments/webhook", webhookRoutes);

  // Admin
  app.use("/api/admin", adminRoutes);

  //address
  app.use("/api/addresses", addressesRoutes);
};

