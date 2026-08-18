// src/modules/cart/cart.service.js
const { AppError } = require("../../common/errors");
const repo = require("./cart.repo");

function assertActiveProduct(p) {
  if (!p) throw new AppError("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);
  if (p.status !== "ACTIVE") throw new AppError("PRODUCT_INACTIVE", "Sản phẩm không còn kinh doanh", 422);
}

function assertQty(qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new AppError("INVALID_QTY", "Số lượng phải > 0", 400);
}

async function getCart(userId) {
  return repo.getCartByUser(userId);
}

async function addItem(userId, { productId, qty }) {
  assertQty(qty);

  const cartId = await repo.ensureCart(userId);
  const product = await repo.getProductForCart(productId);
  assertActiveProduct(product);

  const stock = Number(product.stock);
  const unitPrice = Number(product.sellingPrice);

  const existing = await repo.getExistingCartLine(cartId, productId);
  const currentQty = existing ? Number(existing.qty) : 0;
  const newQty = currentQty + qty;

  if (newQty > stock) throw new AppError("OUT_OF_STOCK", "Số lượng vượt quá tồn kho", 422);

  if (!existing) {
    await repo.insertCartItem({ cartId, productId, qty, unitPrice });
  } else {
    await repo.updateCartItem({ itemId: existing.id, qty: newQty, unitPrice });
  }

  return repo.getCartByUser(userId);
}

async function updateQty(userId, itemId, { qty }) {
  assertQty(qty);

  const item = await repo.getCartItemForUser(userId, itemId);
  if (!item) throw new AppError("ITEM_NOT_FOUND", "Không tìm thấy item trong giỏ", 404);

  const product = await repo.getProductForCart(item.product_id);
  assertActiveProduct(product);

  const stock = Number(product.stock);
  const unitPrice = Number(product.sellingPrice);

  if (qty > stock) throw new AppError("OUT_OF_STOCK", "Số lượng vượt quá tồn kho", 422);

  const affected = await repo.updateCartItem({ itemId, qty, unitPrice });
  if (affected !== 1) throw new AppError("UPDATE_FAILED", "Không cập nhật được giỏ hàng", 500);

  return repo.getCartByUser(userId);
}

async function removeItem(userId, itemId) {
  const affected = await repo.deleteCartItem(userId, itemId);
  if (affected !== 1) throw new AppError("ITEM_NOT_FOUND", "Không tìm thấy item trong giỏ", 404);
  return repo.getCartByUser(userId);
}

module.exports = { getCart, addItem, updateQty, removeItem };