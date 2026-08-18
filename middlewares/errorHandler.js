// src/middlewares/errorHandler.js
const { AppError } = require("../common/errors");

module.exports = (err, req, res, _next) => {
  // MySQL stored procedure SIGNAL thường ra lỗi với:
  // err.sqlState === '45000' và err.message === 'OUT_OF_STOCK' ...
  if (err && err.sqlState === "45000") {
    const code = err.message || "BUSINESS_ERROR";
    return res.status(422).json({ error: { code, message: code } });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  const status = err.status || 500;
  return res.status(status).json({
    error: { code: err.code || "INTERNAL_ERROR", message: err.message || "Internal Server Error" },
  });
};