// src/modules/catalog/catalog.service.js
const { AppError } = require("../../common/errors");
const repo = require("./catalog.repo");

function buildTree(categories) {
  const map = new Map();
  categories.forEach((c) => map.set(c.id, { ...c, children: [] }));

  const roots = [];
  for (const c of categories) {
    const node = map.get(c.id);
    if (!c.parentId) {
      roots.push(node);
    } else {
      const parent = map.get(c.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node); // fallback nếu parent thiếu
    }
  }
  return roots;
}

async function getCategories(query) {
  const parentId = query.parentId ?? null;
  const rows = await repo.listCategories({ parentId });
  if (query.tree === 1) {
    // tree mode: cần full list (không theo parentId)
    const all = await repo.listCategories({ parentId: null });
    return buildTree(all);
  }
  return rows;
}

async function getProducts(query) {
  const result = await repo.listProducts(query);
  return {
    items: result.items.map((x) => ({
      ...x,
      sellingPrice: Number(x.sellingPrice),
      price: Number(x.price),
      discountPrice: x.discountPrice !== null ? Number(x.discountPrice) : null,
      stock: Number(x.stock),
      inStock: Number(x.stock) > 0,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: result.total,
  };
}

async function getProduct(productId) {
  const p = await repo.getProductDetail(productId);
  if (!p) throw new AppError("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);
  if (p.status !== "ACTIVE") throw new AppError("PRODUCT_INACTIVE", "Sản phẩm không còn kinh doanh", 422);

  return {
    ...p,
    sellingPrice: Number(p.sellingPrice),
    price: Number(p.price),
    discountPrice: p.discountPrice !== null ? Number(p.discountPrice) : null,
    stock: Number(p.stock),
    inStock: Number(p.stock) > 0,
  };
}

module.exports = { getCategories, getProducts, getProduct };