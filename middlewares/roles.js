// src/middlewares/roles.js
module.exports = (...allowed) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No auth" } });
  if (!allowed.includes(req.user.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "No permission" } });
  next();
};