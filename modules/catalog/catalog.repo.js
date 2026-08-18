// src/modules/catalog/catalog.repo.js
const { pool } = require("../../infra/db/mysql");

// Categories
async function listCategories({ parentId }) {
  if (parentId === null || parentId === undefined) {
    const [rows] = await pool.query(
      `SELECT id, name, parent_id AS parentId, created_at AS createdAt
       FROM categories
       ORDER BY parent_id IS NULL DESC, name ASC`
    );
    return rows;
  }

  const [rows] = await pool.query(
    `SELECT id, name, parent_id AS parentId, created_at AS createdAt
     FROM categories
     WHERE parent_id = ?
     ORDER BY name ASC`,
    [parentId]
  );
  return rows;
}

// Products list with filters
async function listProducts({
  keyword,
  categoryId,
  brand,
  minPrice,
  maxPrice,
  sort,
  page,
  pageSize,
}) {
  const offset = (page - 1) * pageSize;

  // selling price expression
  const sellExpr = "COALESCE(p.discount_price, p.price)";

  const where = ["p.status='ACTIVE'"];
  const params = [];

  if (keyword) {
    // basic LIKE search (đồ án)
    where.push("(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)");
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  if (categoryId) {
    where.push("p.category_id = ?");
    params.push(categoryId);
  }

  if (brand) {
    where.push("p.brand = ?");
    params.push(brand);
  }

  if (minPrice !== null && minPrice !== undefined) {
    where.push(`${sellExpr} >= ?`);
    params.push(minPrice);
  }

  if (maxPrice !== null && maxPrice !== undefined) {
    where.push(`${sellExpr} <= ?`);
    params.push(maxPrice);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  let orderBy = "p.created_at DESC";
  if (sort === "price_asc") orderBy = `${sellExpr} ASC, p.id DESC`;
  if (sort === "price_desc") orderBy = `${sellExpr} DESC, p.id DESC`;
  if (sort === "name_asc") orderBy = `p.name ASC, p.id DESC`;
  if (sort === "newest") orderBy = `p.created_at DESC`;

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM products p
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT
        p.id,
        p.category_id AS categoryId,
        c.name AS categoryName,
        p.name,
        p.sku,
        p.brand,
        p.price,
        p.discount_price AS discountPrice,
        ${sellExpr} AS sellingPrice,
        p.status,
        p.created_at AS createdAt,
        i.quantity AS stock,
        (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS thumbnail
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN inventory i ON i.product_id = p.id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { total: Number(countRow.total), items: rows };
}

// Product detail
async function getProductDetail(productId) {
  const [rows] = await pool.query(
    `SELECT
        p.id,
        p.category_id AS categoryId,
        c.name AS categoryName,
        p.name,
        p.sku,
        p.brand,
        p.price,
        p.discount_price AS discountPrice,
        COALESCE(p.discount_price, p.price) AS sellingPrice,
        p.description,
        p.status,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        i.quantity AS stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN inventory i ON i.product_id = p.id
     WHERE p.id = ?
     LIMIT 1`,
    [productId]
  );

  const p = rows[0];
  if (!p) return null;

  const [images] = await pool.query(
    `SELECT id, url, sort_order AS sortOrder
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  );

  return { ...p, images };
}

module.exports = { listCategories, listProducts, getProductDetail };