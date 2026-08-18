// src/common/errors.js
class AppError extends Error {
  constructor(code, message, status = 400, details = []) {
    super(message || code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

module.exports = { AppError };