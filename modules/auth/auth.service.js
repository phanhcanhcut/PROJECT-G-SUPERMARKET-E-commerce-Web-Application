// src/modules/auth/auth.service.js
const bcrypt = require("bcrypt");
const { AppError } = require("../../common/errors");
const repo = require("./auth.repo");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("./tokens");

async function register(dto) {
  const exists = await repo.findByEmail(dto.email);
  if (exists) throw new AppError("EMAIL_EXISTS", "Email đã tồn tại", 409);

  const passwordHash = await bcrypt.hash(dto.password, 10);
  const userId = await repo.createUser({
    name: dto.name,
    email: dto.email,
    phone: dto.phone,
    passwordHash,
  });

  return { userId, message: "REGISTERED" };
}

async function login(dto) {
  const user = await repo.findByEmail(dto.email);
  if (!user) throw new AppError("INVALID_CREDENTIALS", "Sai email hoặc mật khẩu", 401);
  if (user.status === "BLOCKED") throw new AppError("USER_BLOCKED", "Tài khoản bị khóa", 403);

  const ok = await bcrypt.compare(dto.password, user.password_hash);
  if (!ok) throw new AppError("INVALID_CREDENTIALS", "Sai email hoặc mật khẩu", 401);

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  return { accessToken, refreshToken, role: user.role };
}

/**
 * Stateless refresh:
 * - verify refresh token
 * - issue new access token
 * - optionally issue new refresh token (rotation stateless vẫn không revoke được token cũ)
 */
async function refresh(dto) {
  let payload;
  try {
    payload = verifyRefreshToken(dto.refreshToken);
  } catch {
    throw new AppError("INVALID_REFRESH_TOKEN", "Refresh token không hợp lệ", 401);
  }

  if (payload.type !== "refresh") throw new AppError("INVALID_REFRESH_TOKEN", "Sai loại token", 401);

  // Optional: check user still exists / not blocked (có DB nhưng không lưu token => vẫn stateless)
  const user = await repo.findById(payload.sub);
  if (!user) throw new AppError("USER_NOT_FOUND", "User không tồn tại", 404);
  if (user.status === "BLOCKED") throw new AppError("USER_BLOCKED", "Tài khoản bị khóa", 403);

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user); // rotation (stateless)

  return { accessToken, refreshToken };
}

async function me(userId) {
  const user = await repo.findById(userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User không tồn tại", 404);
  return user;
}

/**
 * Stateless logout:
 * - server không revoke được refresh token ngay (vì không lưu)
 * - client chỉ cần xóa token/cookie
 */
async function logout() {
  return { message: "LOGGED_OUT" };
}

module.exports = { register, login, refresh, me, logout };