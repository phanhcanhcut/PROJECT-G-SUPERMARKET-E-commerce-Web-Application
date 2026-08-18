// src/modules/admin/admin.routes.js
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/auth");
const roles = require("../../middlewares/roles");
const validate = require("../../common/validate");

const productsCtrl = require("./admin.products.controller");
const inventoryCtrl = require("./admin.inventory.controller");
const ordersCtrl = require("./admin.orders.controller");
const customersCtrl = require("./admin.customers.controller");
const couponsCtrl = require("./admin.coupons.controller");
const reportsCtrl = require("./admin.reports.controller");
const auditCtrl = require("./admin.audit.controller");

const router = express.Router();
router.use(auth);

const any = z.any();
const idParam = z.object({ body: any, query: any, params: z.object({ id: z.coerce.number().int().positive() }) });

// -------- Products (ADMIN) --------
const createProductSchema = z.object({
  body: z.object({
    product: z.object({
      categoryId: z.coerce.number().int().positive(),
      name: z.string().min(2).max(200),
      sku: z.string().min(2).max(60),
      brand: z.string().max(120).optional(),
      price: z.coerce.number().positive(),
      discountPrice: z.coerce.number().nonnegative().optional(),
      description: z.string().max(2000).optional(),
    }),
    images: z.array(z.string().url().max(500)).optional(),
    initialStock: z.coerce.number().int().min(0).optional(),
  }),
  query: any,
  params: any,
});

const updateProductSchema = z.object({
  body: z.object({
    patch: z.object({
      categoryId: z.coerce.number().int().positive().optional(),
      name: z.string().min(2).max(200).optional(),
      sku: z.string().min(2).max(60).optional(),
      brand: z.string().max(120).optional(),
      price: z.coerce.number().positive().optional(),
      discountPrice: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
      description: z.string().max(2000).optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    }),
    images: z.array(z.string().url().max(500)).optional(),
  }),
  query: any,
  params: z.object({ id: z.coerce.number().int().positive() }),
});

router.post("/products", roles("ADMIN"), validate(createProductSchema), productsCtrl.create);
router.put("/products/:id", roles("ADMIN"), validate(updateProductSchema), productsCtrl.update);
router.delete("/products/:id", roles("ADMIN"), validate(idParam), productsCtrl.deactivate);

// -------- Inventory (ADMIN/STAFF) --------
const listInventorySchema = z.object({
  body: any,
  params: any,
  query: z.object({
    keyword: z.string().max(200).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    lowStockBelow: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const updateInvSchema = z.object({
  body: z.object({ quantity: z.coerce.number().int().min(0) }),
  query: any,
  params: z.object({ productId: z.coerce.number().int().positive() }),
});

const adjustInvSchema = z.object({
  body: z.object({ delta: z.coerce.number().int().refine(v => v !== 0, "delta must not be 0"), note: z.string().max(500).optional() }),
  query: any,
  params: z.object({ productId: z.coerce.number().int().positive() }),
});

router.get("/inventory", roles("ADMIN", "STAFF"), validate(listInventorySchema), inventoryCtrl.list);
router.put("/inventory/:productId", roles("ADMIN", "STAFF"), validate(updateInvSchema), inventoryCtrl.update);
router.post("/inventory/:productId/adjust", roles("ADMIN", "STAFF"), validate(adjustInvSchema), inventoryCtrl.adjust);

// -------- Orders (ADMIN/STAFF) --------
const listOrdersSchema = z.object({
  body: any,
  params: any,
  query: z.object({
    status: z.enum(["NEW", "CONFIRMED", "PACKING", "SHIPPING", "DELIVERED", "CANCELLED"]).optional(),
    paymentStatus: z.enum(["PENDING_PAYMENT", "PAID", "PAYMENT_FAILED", "REFUNDED"]).optional(),
    paymentMethod: z.enum(["ONLINE", "COD"]).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    orderCode: z.string().max(30).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const orderIdParam = z.object({ body: any, query: any, params: z.object({ id: z.coerce.number().int().positive() }) });

const updateOrderSchema = z.object({
  body: z.object({
    patch: z.object({
      addressId: z.coerce.number().int().positive().optional(),
      paymentStatus: z.enum(["PENDING_PAYMENT", "PAID", "PAYMENT_FAILED", "REFUNDED"]).optional(),
      note: z.string().max(255).nullable().optional(),
    }),
  }),
  query: any,
  params: z.object({ id: z.coerce.number().int().positive() }),
});

const updateOrderStatusSchema = z.object({
  body: z.object({ status: z.enum(["NEW", "CONFIRMED", "PACKING", "SHIPPING", "DELIVERED", "CANCELLED"]) }),
  query: any,
  params: z.object({ id: z.coerce.number().int().positive() }),
});

router.get("/orders", roles("ADMIN", "STAFF"), validate(listOrdersSchema), ordersCtrl.list);
router.get("/orders/:id", roles("ADMIN", "STAFF"), validate(orderIdParam), ordersCtrl.detail);
router.put("/orders/:id", roles("ADMIN", "STAFF"), validate(updateOrderSchema), ordersCtrl.update);
router.put("/orders/:id/status", roles("ADMIN", "STAFF"), validate(updateOrderStatusSchema), ordersCtrl.updateStatus);

// -------- Customers / Buyers (ADMIN/STAFF) --------
const listCustomersSchema = z.object({
  body: any,
  params: any,
  query: z.object({
    keyword: z.string().max(200).optional(),
    status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const customerIdParam = z.object({ body: any, query: any, params: z.object({ id: z.coerce.number().int().positive() }) });
const updateCustomerStatusSchema = z.object({
  body: z.object({ status: z.enum(["ACTIVE", "BLOCKED"]) }),
  query: any,
  params: z.object({ id: z.coerce.number().int().positive() }),
});

router.get("/customers", roles("ADMIN", "STAFF"), validate(listCustomersSchema), customersCtrl.list);
router.get("/customers/:id", roles("ADMIN", "STAFF"), validate(customerIdParam), customersCtrl.detail);
router.put("/customers/:id/status", roles("ADMIN", "STAFF"), validate(updateCustomerStatusSchema), customersCtrl.updateStatus);

// -------- Coupons (ADMIN) --------
const listCouponsSchema = z.object({
  body: any,
  params: any,
  query: z.object({
    isActive: z.coerce.number().int().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const createCouponSchema = z.object({
  body: z.object({
    code: z.string().min(2).max(40),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.coerce.number().positive(),
    minOrder: z.coerce.number().nonnegative().optional(),
    maxDiscount: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    startAt: z.string(),
    endAt: z.string(),
    usageLimit: z.coerce.number().int().min(0).optional(),
    isActive: z.coerce.boolean().optional().default(true),
  }),
  query: any,
  params: any,
});

const updateCouponSchema = z.object({
  body: z.object({
    code: z.string().min(2).max(40).optional(),
    type: z.enum(["PERCENT", "FIXED"]).optional(),
    value: z.coerce.number().positive().optional(),
    minOrder: z.coerce.number().nonnegative().optional(),
    maxDiscount: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    usageLimit: z.coerce.number().int().min(0).optional(),
    isActive: z.coerce.boolean().optional(),
  }),
  query: any,
  params: z.object({ id: z.coerce.number().int().positive() }),
});

router.get("/coupons", roles("ADMIN"), validate(listCouponsSchema), couponsCtrl.list);
router.post("/coupons", roles("ADMIN"), validate(createCouponSchema), couponsCtrl.create);
router.put("/coupons/:id", roles("ADMIN"), validate(updateCouponSchema), couponsCtrl.update);
router.delete("/coupons/:id", roles("ADMIN"), validate(idParam), couponsCtrl.deactivate);

// -------- Reports (ADMIN) --------
const revenueSchema = z.object({
  body: any,
  params: any,
  query: z.object({ from: z.string(), to: z.string(), groupBy: z.enum(["day", "month"]).default("day") }),
});
router.get("/reports/revenue", roles("ADMIN"), validate(revenueSchema), reportsCtrl.revenue);

// -------- Audit logs (ADMIN) --------
const auditSchema = z.object({
  body: any,
  params: any,
  query: z.object({
    actorId: z.coerce.number().int().positive().optional(),
    action: z.string().max(60).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});
router.get("/audit-logs", roles("ADMIN"), validate(auditSchema), auditCtrl.list);

module.exports = router;
