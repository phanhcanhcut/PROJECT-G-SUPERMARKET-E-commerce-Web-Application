// src/common/validate.js
module.exports = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });
  if (!result.success) {
    const err = new Error("VALIDATION_ERROR");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    err.details = result.error.issues;
    return next(err);
  }
  req.validated = result.data;
  next();
};