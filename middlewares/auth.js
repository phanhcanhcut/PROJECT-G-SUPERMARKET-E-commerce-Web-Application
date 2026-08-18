const { verifyAccessToken } = require("../modules/auth/tokens");

module.exports = function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing bearer token" }
      });
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyAccessToken(token);

    if (payload.type !== "access") {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid token type" }
      });
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid token" }
    });
  }
};