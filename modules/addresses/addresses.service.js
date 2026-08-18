const { AppError } = require("../../common/errors");
const repo = require("./addresses.repo");

async function list(userId) {
  return repo.listByUser(userId);
}

async function create(userId, dto) {
  const id = await repo.createTx({ userId, ...dto });
  return { id, message: "CREATED" };
}

async function update(userId, id, dto) {
  const r = await repo.updateTx({ userId, id, ...dto });
  if (!r.ok) throw new AppError(r.reason, "Không tìm thấy địa chỉ", 404);
  return { message: "UPDATED" };
}

async function setDefault(userId, id) {
  const r = await repo.setDefaultTx({ userId, id });
  if (!r.ok) throw new AppError(r.reason, "Không tìm thấy địa chỉ", 404);
  return { message: "DEFAULT_SET" };
}

async function remove(userId, id) {
  const affected = await repo.remove({ userId, id });
  if (affected !== 1) throw new AppError("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ", 404);
  return { message: "DELETED" };
}

module.exports = { list, create, update, setDefault, remove };