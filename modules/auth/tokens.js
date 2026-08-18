// src/modules/auth/tokens.js
const jwt = require("jsonwebtoken");

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, type: "access" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TTL || "15m" }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, type: "refresh" },
    process.env.REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TTL || "7d" }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_SECRET);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };