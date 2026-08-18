
const API_BASE = "http://localhost:8080";
function makeStorage(prefix) {
  const KEY = {
    access: `${prefix}_accessToken`,
    refresh: `${prefix}_refreshToken`,
    role: `${prefix}_role`,
  };
  return {
    get access() { return localStorage.getItem(KEY.access) || ""; },
    set access(v) { localStorage.setItem(KEY.access, v); },
    get refresh() { return localStorage.getItem(KEY.refresh) || ""; },
    set refresh(v) { localStorage.setItem(KEY.refresh, v); },
    get role() { return localStorage.getItem(KEY.role) || ""; },
    set role(v) { localStorage.setItem(KEY.role, v); },
    clear() {
      localStorage.removeItem(KEY.access);
      localStorage.removeItem(KEY.refresh);
      localStorage.removeItem(KEY.role);
    },
  };
}

let refreshPromise = null;
async function rawFetch(path, { method = "GET", body = null, auth = true, storage, headers: extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const hasBody = body !== null && body !== undefined;

  if (!isFormData && !headers["Content-Type"] && hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (auth && storage?.access) {
    headers["Authorization"] = `Bearer ${storage.access}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: hasBody ? (isFormData ? body : JSON.stringify(body)) : null,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error("Yêu cầu quá lâu, vui lòng thử lại.");
    }
    throw new Error("Không kết nối được server.");
  }

  clearTimeout(timeoutId);

  if (res.status === 204 || res.status === 205) return { res, data: null };
  const text = await res.text();
  if (!text) return { res, data: null };
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { res, data };
}
async function doRefreshToken(storage) {
  if (!storage?.refresh) return false;
  const { res, data } = await rawFetch('/api/auth/refresh', { method:'POST', auth:false, storage, body:{ refreshToken: storage.refresh } });
  if (!res.ok || !data?.accessToken || !data?.refreshToken) return false;
  storage.access = data.accessToken; storage.refresh = data.refreshToken; return true;
}
async function refreshToken(storage) {
  if (!storage?.refresh) return false;
  if (!refreshPromise) refreshPromise = doRefreshToken(storage).finally(()=>{ refreshPromise = null; });
  return refreshPromise;
}
function makeError(status, data) {
  const code = data?.error?.code || 'HTTP_ERROR';
  const msg = data?.error?.message || code;
  const err = new Error(`${msg} (HTTP ${status})`);
  err.status = status; err.code = code; err.data = data; return err;
}

function createApi(storage) {
  return async function api(path, opts = {}) {
    const first = await rawFetch(path, { ...opts, storage });

    if (first.res.status === 401 && opts.auth !== false) {
      const ok = await refreshToken(storage);

      if (ok) {
        const retry = await rawFetch(path, { ...opts, storage });

        if (retry.res.status === 401) {
          clearUserSessionEverywhere();
          throw makeError(401, {
            error: {
              code: "UNAUTHORIZED",
              message: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại"
            }
          });
        }

        if (!retry.res.ok) throw makeError(retry.res.status, retry.data);
        return retry.data;
      }

      clearUserSessionEverywhere();
      throw makeError(first.res.status, first.data);
    }

    if (!first.res.ok) throw makeError(first.res.status, first.data);
    return first.data;
  };
}

const storage = makeStorage("user");
function hydrateUserStorageFromFallback() {
  const authRole = String(localStorage.getItem("auth_role") || "").trim().toUpperCase();

  if (!storage.access && authRole !== "ADMIN") {
    storage.access = localStorage.getItem("auth_accessToken") || "";
  }

  if (!storage.refresh && authRole !== "ADMIN") {
    storage.refresh = localStorage.getItem("auth_refreshToken") || "";
  }

  if (!storage.role) {
    if (authRole && authRole !== "ADMIN") {
      storage.role = authRole;
    } else {
      storage.role = localStorage.getItem("user_role") || "";
    }
  }
}

function clearUserSessionEverywhere() {
  [
    "user_accessToken",
    "user_refreshToken",
    "user_role",
    "auth_accessToken",
    "auth_refreshToken",
    "auth_role"
  ].forEach((k) => localStorage.removeItem(k));

  storage.clear();
}
const api = createApi(storage);
const $ = (id) => document.getElementById(id);

const state = {
  page: 1,
  pageSize: 24,
  total: 0,
  categoryId: "",
  categories: [],
  lastProducts: [],
  addresses: [],
  selectedAddressId: null,
  admOrdersPage: 1,
  admOrdersPageSize: 10,
  admOrdersTotal: 0,
  admOrdersView: [],
  admCurrentOrder: null,
  admCustomersPage: 1,
  admCustomersPageSize: 10,
  admCustomersTotal: 0,
  admCustomersView: [],
  admCurrentCustomer: null,
  admInventoryPage: 1,
  admInventoryPageSize: 10,
  admInventoryTotal: 0,
  admInventoryView: [],
  admCouponsPage: 1,
  admCouponsPageSize: 10,
  admCouponsTotal: 0,
  admCouponsView: [],
  admAuditPage: 1,
  admAuditPageSize: 10,
  admAuditTotal: 0,
  admAuditView: [],
  admReportPayload: null,
  admSelectedOrderId: null,
  admSelectedCustomerId: null,
  admSelectedProductId: null,
  admSelectedCouponId: null,
};

/* =========================
   Utils
========================= */
function thongbao(type, title, msg){
  const host = $("toastHost");
  if (!host) return;

  const t = document.createElement("div");
  t.className = `toast ${type||""}`;
  const ico = type === "ok" ? "✓" : type === "warn" ? "!" : "×";
  t.innerHTML = `
    <div class="toast__ico">${ico}</div>
    <div>
      <div class="toast__t">${escapeHtml(title)}</div>
      <div class="toast__m">${escapeHtml(msg||"")}</div>
    </div>
    <button class="toast__x">✕</button>
  `;
  t.querySelector(".toast__x").onclick = () => t.remove();
  host.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

let __loadingCount = 0;

function dangTai(on, text = "Đang xử lý…"){
  const loadingEl = $("loading");
  const loadingTextEl = $("loadingText");

  if (on) {
    __loadingCount += 1;
  } else {
    __loadingCount = Math.max(0, __loadingCount - 1);
  }

  if (loadingEl) {
    loadingEl.classList.toggle("hidden", __loadingCount === 0);
  }
  if (loadingTextEl && on) {
    loadingTextEl.textContent = text;
  }
}

async function runWithButtonLock(btn, fn){
  if (!btn) return await fn();
  if (btn.disabled) return;

  const oldText = btn.textContent;
  btn.disabled = true;
  btn.style.opacity = "0.7";
  btn.style.pointerEvents = "none";

  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.style.opacity = "";
    btn.style.pointerEvents = "";
    btn.textContent = oldText;
  }
}

function debounce(fn, wait = 350){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function toIntOrZero(v){
  const n = Number(v);
  return Number.isInteger(n) ? n : 0;
}

function toNumberOrNull(v){
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDateLoose(v){
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isFinite(d.getTime()) ? d : null;
}

function isHttpUrl(v){
  const s = String(v || "").trim();
  if (!s) return true;
  return /^https?:\/\//i.test(s);
}

function setBtnState(id, enabled, title = ""){
  const btn = $(id);
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = enabled ? "" : title;
}

function markSelectedRows(attr, value){
  document.querySelectorAll(`[${attr}]`).forEach(el => {
    el.classList.toggle("is-active", value !== null && String(el.getAttribute(attr)) === String(value));
  });
}

function syncAdminActionStates(){
  const orderId = toIntOrZero($("admOrderId")?.value || state.admSelectedOrderId || 0);
  const customerId = toIntOrZero($("admCustomerId")?.value || state.admSelectedCustomerId || 0);
  const productId = toIntOrZero($("admInvProductId")?.value || state.admSelectedProductId || 0);
  const couponId = toIntOrZero($("admCUpdId")?.value || state.admSelectedCouponId || 0);

  const nextStatus = $("admNextStatus")?.value || "";
  const patch = {
    addressId: ($("admEditOrderAddressId")?.value || "").trim(),
    paymentStatus: $("admEditOrderPaymentStatus")?.value || "",
    note: ($("admEditOrderNote")?.value || "").trim(),
  };
  const orderPatchValid = (!!orderId) && (
    (patch.addressId === "" || toIntOrZero(patch.addressId) > 0) ||
    patch.paymentStatus !== "" ||
    patch.note !== ""
  ) && !(patch.addressId !== "" && toIntOrZero(patch.addressId) <= 0);

  setBtnState("admBtnOrderDetail", !!orderId, "Chọn một đơn hàng trước.");
  setBtnState("admBtnUpdateStatus", !!orderId && !!nextStatus && !$("admNextStatus")?.disabled, "Chọn đơn hàng và trạng thái hợp lệ.");
  setBtnState("admBtnUpdateOrder", orderPatchValid, "Chọn đơn hàng và nhập thay đổi hợp lệ.");

  setBtnState("admBtnCustomerDetail", !!customerId, "Chọn một người mua trước.");
  setBtnState("admBtnCustomerStatus", !!customerId && !!($("admCustomerNextStatus")?.value || ""), "Chọn người mua và trạng thái.");

  const invQty = toNumberOrNull($("admInvQty")?.value);
  const invDelta = toNumberOrNull($("admInvDelta")?.value);
  const invNote = ($("admInvAdjustNote")?.value || "").trim();
  setBtnState("admBtnInv", !!productId && invQty !== null && Number.isInteger(invQty) && invQty >= 0, "Chọn sản phẩm và nhập số lượng tồn hợp lệ.");
  setBtnState("admBtnInvAdjust", !!productId && invDelta !== null && Number.isInteger(invDelta) && invDelta !== 0 && (!(invDelta < 0) || invNote.length > 0), "Delta phải là số nguyên khác 0; nếu trừ kho hãy nhập ghi chú.");

  const catId = toIntOrZero($("admPCategoryId")?.value);
  const price = toNumberOrNull($("admPPrice")?.value);
  const discount = toNumberOrNull($("admPDiscount")?.value);
  const stock = toNumberOrNull($("admPStock")?.value);
  const sku = ($("admPSku")?.value || "").trim();
  const pName = ($("admPName")?.value || "").trim();
  const img = ($("admPImage1")?.value || "").trim();
  const productCreateValid = isAdminRole() && catId > 0 && pName.length >= 2 && sku.length >= 3 && price !== null && price > 0 && (discount === null || (discount >= 0 && discount < price)) && (stock === null || (Number.isInteger(stock) && stock >= 0)) && isHttpUrl(img);
  setBtnState("admBtnCreateProduct", productCreateValid, "Nhập đủ categoryId, tên, SKU, giá; giá giảm phải nhỏ hơn giá bán.");
  setBtnState("admBtnDeactivateProduct", isAdminRole() && toIntOrZero($("admPDeactivateId")?.value) > 0, "Nhập productId hợp lệ.");

  const cCode = ($("admCCode")?.value || "").trim();
  const cValue = toNumberOrNull($("admCValue")?.value);
  const cMin = toNumberOrNull($("admCMinOrder")?.value);
  const cMax = toNumberOrNull($("admCMaxDiscount")?.value);
  const cStart = parseDateLoose($("admCStartAt")?.value);
  const cEnd = parseDateLoose($("admCEndAt")?.value);
  const cUsage = toNumberOrNull($("admCUsageLimit")?.value);
  const cType = $("admCType")?.value || "PERCENT";
  const createCouponValid = isAdminRole() && cCode.length >= 3 && cValue !== null && cValue > 0 && (cMin === null || cMin >= 0) && (cMax === null || cMax >= 0) && cStart && cEnd && cStart < cEnd && (cUsage === null || (Number.isInteger(cUsage) && cUsage >= 0)) && !(cType === "PERCENT" && cValue > 100);
  setBtnState("admBtnCreateCoupon", createCouponValid, "Nhập coupon hợp lệ; ngày bắt đầu phải trước ngày kết thúc.");

  const cUpdVal = ($("admCUpdValue")?.value || "").trim();
  const cUpdValNum = toNumberOrNull(cUpdVal);
  const cUpdActive = $("admCUpdActive")?.value || "";
  const updateCouponValid = isAdminRole() && couponId > 0 && ((cUpdVal !== "" && cUpdValNum !== null && cUpdValNum > 0) || cUpdActive !== "");
  setBtnState("admBtnUpdateCoupon", updateCouponValid, "Chọn coupon và nhập thay đổi hợp lệ.");
  setBtnState("admBtnDeactivateCoupon", isAdminRole() && couponId > 0, "Chọn coupon trước.");

  const rFrom = parseDateLoose($("admRFrom")?.value);
  const rTo = parseDateLoose($("admRTo")?.value);
  setBtnState("admBtnReport", isAdminRole() && !!rFrom && !!rTo && rFrom <= rTo, "Nhập khoảng thời gian hợp lệ.");
  setBtnState("admBtnExportOrders", state.admOrdersView.length > 0, "Chưa có dữ liệu đơn hàng để xuất.");
  setBtnState("admBtnExportCoupons", isAdminRole() && state.admCouponsView.length > 0, "Chưa có dữ liệu coupon để xuất.");
  setBtnState("admBtnExportReport", isAdminRole() && !!state.admReportPayload && (state.admReportPayload.series || []).length > 0, "Hãy tải báo cáo trước khi xuất.");
  setBtnState("admBtnExportAudit", isAdminRole() && state.admAuditView.length > 0, "Chưa có dữ liệu audit để xuất.");
}

function bindAdminInputEvents(){
  [
    "admOrderId","admNextStatus","admEditOrderAddressId","admEditOrderPaymentStatus","admEditOrderNote",
    "admCustomerId","admCustomerNextStatus",
    "admInvProductId","admInvQty","admInvDelta","admInvAdjustNote",
    "admPCategoryId","admPName","admPSku","admPPrice","admPDiscount","admPStock","admPImage1","admPDeactivateId",
    "admCCode","admCType","admCValue","admCMinOrder","admCMaxDiscount","admCStartAt","admCEndAt","admCUsageLimit","admCIsActive",
    "admCUpdId","admCUpdValue","admCUpdActive","admRFrom","admRTo","admRGroup"
  ].forEach(id => {
    const el = $(id);
    if (!el || el.__admBound) return;
    el.__admBound = true;
    el.addEventListener("input", syncAdminActionStates);
    el.addEventListener("change", syncAdminActionStates);
  });
}

function setSelectedAdmOrder(id){
  const normalized = toIntOrZero(id) || null;
  state.admSelectedOrderId = normalized;
  if ($("admOrderId")) $("admOrderId").value = normalized || "";
  markSelectedRows("data-pick-adm-order", normalized);
  syncAdminActionStates();
}

function setSelectedAdmCustomer(id){
  const normalized = toIntOrZero(id) || null;
  state.admSelectedCustomerId = normalized;
  if ($("admCustomerId")) $("admCustomerId").value = normalized || "";
  markSelectedRows("data-pick-adm-customer", normalized);
  syncAdminActionStates();
}

function setSelectedAdmProduct(id){
  const normalized = toIntOrZero(id) || null;
  state.admSelectedProductId = normalized;
  if ($("admInvProductId")) $("admInvProductId").value = normalized || "";
  markSelectedRows("data-pick-adm-product", normalized);
  syncAdminActionStates();
}

function setSelectedAdmCoupon(id){
  const normalized = toIntOrZero(id) || null;
  state.admSelectedCouponId = normalized;
  if ($("admCUpdId")) $("admCUpdId").value = normalized || "";
  markSelectedRows("data-pick-adm-coupon", normalized);
  syncAdminActionStates();
}

function tien(n){
  return Number(n || 0).toLocaleString("vi-VN");
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function makePreview(text, max = 120){
  if (!text) return "";
  text = String(text).trim();
  if (text.length <= max) return text;
  return text.substring(0, max) + "...";
}

function goToPaymentUrl(url){
  if (!url) {
    throw new Error("Không nhận được payUrl từ backend.");
  }
  window.location.href = url;
}

function orderStatusText(s){
  return {
    NEW: "Chờ admin duyệt",
    CONFIRMED: "Đã duyệt",
    PACKING: "Đang chuẩn bị hàng",
    SHIPPING: "Đang giao hàng",
    DELIVERED: "Đã giao",
    CANCELLED: "Đã hủy"
  }[s] || s;
}

function paymentStatusText(s){
  return {
    PENDING_PAYMENT: "Chưa thanh toán",
    PAID: "Đã thanh toán",
    PAYMENT_FAILED: "Thanh toán lỗi",
    REFUNDED: "Đã hoàn tiền"
  }[s] || s;
}

function customerStatusChip(label, tone = "neutral"){
  const map = {
    ok: { bg:"#ecfdf5", bd:"#bbf7d0", cl:"#166534" },
    warn: { bg:"#fffbeb", bd:"#fde68a", cl:"#92400e" },
    bad: { bg:"#fef2f2", bd:"#fecaca", cl:"#b91c1c" },
    neutral: { bg:"#f8fafc", bd:"#e2e8f0", cl:"#475569" }
  };
  const t = map[tone] || map.neutral;
  return `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:5px 10px;
      border-radius:999px;
      font-size:12px;
      font-weight:800;
      background:${t.bg};
      border:1px solid ${t.bd};
      color:${t.cl};
      white-space:nowrap;
    ">${escapeHtml(label)}</span>
  `;
}

function customerOrderBadge(status){
  if (["CONFIRMED","PACKING","SHIPPING","DELIVERED"].includes(status)) {
    return customerStatusChip(orderStatusText(status), "ok");
  }
  if (status === "CANCELLED") {
    return customerStatusChip(orderStatusText(status), "bad");
  }
  return customerStatusChip(orderStatusText(status), "warn");
}

function customerPaymentBadge(status){
  if (status === "PAID") return customerStatusChip(paymentStatusText(status), "ok");
  if (["PAYMENT_FAILED","REFUNDED"].includes(status)) {
    return customerStatusChip(paymentStatusText(status), "bad");
  }
  return customerStatusChip(paymentStatusText(status), "warn");
}

function buildOrderTimeline(o){
  const paidDone = o.payment_status === "PAID";
  const confirmedDone = ["CONFIRMED","PACKING","SHIPPING","DELIVERED"].includes(o.status);
  const packingDone = ["PACKING","SHIPPING","DELIVERED"].includes(o.status);
  const shippingDone = ["SHIPPING","DELIVERED"].includes(o.status);
  const deliveredDone = o.status === "DELIVERED";

  const paymentLine =
    o.payment_method === "COD"
      ? (paidDone ? "Đã thu tiền COD ✅" : "Thanh toán COD khi giao ⏳")
      : (paidDone ? "Đã thanh toán online ✅" : "Chưa thanh toán online ⏳");

  return `
    <div style="margin:12px 0;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
      <div style="font-weight:800;margin-bottom:8px">Tiến trình đơn hàng</div>
      <div>1. Đã tạo đơn ✅</div>
      <div>2. ${paymentLine}</div>
      <div>3. Admin duyệt đơn ${confirmedDone ? "✅" : "⏳"}</div>
      <div>4. Đang chuẩn bị hàng ${packingDone ? "✅" : "⏳"}</div>
      <div>5. Đang giao hàng ${shippingDone ? "✅" : "⏳"}</div>
      <div>6. Hoàn tất ${deliveredDone ? "✅" : "⏳"}</div>
    </div>
  `;
}

/* =========================
   Auth / Modal / Drawer
========================= */
function normalizeRole(raw){
  const role = String(raw || "").trim().toUpperCase();
  if (role === "ADMIN") return "ADMIN";
  if (["USER","CUSTOMER","MEMBER","CLIENT"].includes(role)) return "USER";
  return "";
}

function roleLabel(role){
  const r = normalizeRole(role);
  return r === "ADMIN" ? "Quản trị viên" : r === "USER" ? "Người dùng" : "Khách";
}

function isAdminRole(){ return normalizeRole(storage.role) === "ADMIN"; }
function isUserRole(){
  if (!storage.access) return false;
  const role = normalizeRole(storage.role);
  return !role || role === "USER";
}
function canUseAdmin(){ return isAdminRole(); }

function setAuthUI(){
  const signed = !!storage.access;
  const role = normalizeRole(storage.role);
  const isUser = signed && (!role || role === "USER");

  if ($("btnLoginOpen")) $("btnLoginOpen").classList.toggle("hidden", signed);
  if ($("btnLogout")) $("btnLogout").classList.toggle("hidden", !signed);
  if ($("btnOrdersOpen")) $("btnOrdersOpen").classList.toggle("hidden", !isUser);
  if ($("btnAddrOpen")) $("btnAddrOpen").classList.toggle("hidden", !isUser);
  if ($("btnCartOpen")) $("btnCartOpen").classList.toggle("hidden", signed && role === "ADMIN");
  if ($("rolePill")) {
    $("rolePill").classList.toggle("hidden", !signed);
    $("rolePill").textContent = signed ? roleLabel(role || "USER") : "";
  }
  if ($("btnAdminOpen")) $("btnAdminOpen").classList.add("hidden");
}

function applyInlineRoleUI(){
  const role = normalizeRole(storage.role) || (storage.access ? "USER" : "GUEST");
  document.body.setAttribute("data-role", role);
  const adminWrap = $("adminSection");
  if (adminWrap) adminWrap.classList.add("hidden");
  document.querySelectorAll("[data-role-scope]").forEach(el => el.classList.add("hidden"));
  if ($("adminRolePill")) $("adminRolePill").textContent = "";
  if ($("adminWelcomeText")) $("adminWelcomeText").textContent = "";
  syncAdminActionStates();
}

function clearCustomerViews(){
  if ($("addrList")) $("addrList").innerHTML = "";
  if ($("myOrdersList")) $("myOrdersList").innerHTML = "";
  if ($("myOrderDetail")) $("myOrderDetail").innerHTML = "Chọn một đơn để xem chi tiết.";
  if ($("cartItems")) $("cartItems").innerHTML = "";
  if ($("cartSubtotal")) $("cartSubtotal").textContent = "0";
  if ($("cartMeta")) $("cartMeta").textContent = "—";
  if ($("cartBadge")) $("cartBadge").classList.add("hidden");
}

function clearAdminViews(){
  ["admOrdersBox","admOrderDetailBox","admCustomersBox","admCustomerDetailBox","admInventoryBox","admCouponsBox","admReportBox","admAuditBox"].forEach(id => {
    if ($(id)) $(id).innerHTML = "";
  });
  ["admOrderId","admCustomerId","admInvProductId","admInvQty","admInvDelta","admEditOrderAddressId","admEditOrderNote","admCUpdId","admCUpdValue"].forEach(id => {
    if ($(id)) $(id).value = "";
  });
  if ($("admEditOrderPaymentStatus")) $("admEditOrderPaymentStatus").value = "";
  if ($("admCustomerNextStatus")) $("admCustomerNextStatus").value = "";
  if ($("admCUpdActive")) $("admCUpdActive").value = "";
  state.admSelectedOrderId = null;
  state.admSelectedCustomerId = null;
  state.admSelectedProductId = null;
  state.admSelectedCouponId = null;
  state.admCurrentOrder = null;
  state.admCurrentCustomer = null;
  if ($("admInvBox")) $("admInvBox").textContent = "";
  if ($("admProdBox")) $("admProdBox").textContent = "";
  if ($("admLog")) $("admLog").textContent = "Sẵn sàng.";
  syncAdminActionStates();
}

let reopenCheckoutAfterAddress = false;

function closeAllModals(exceptId = ""){
  document.querySelectorAll(".modal").forEach((el) => {
    if (el.id !== exceptId) el.classList.add("hidden");
  });
}

function moModal(id){
  const el = $(id);
  if (!el) return;
  dongDrawer();
  closeAllModals(id);
  el.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function dongModal(id){
  const el = $(id);
  if (!el) return;
  el.classList.add("hidden");

  const anyModalOpen = document.querySelector(".modal:not(.hidden)");
  if (!anyModalOpen){
    document.body.style.overflow = "";
  }
}

function moDrawer(){
  if ($("drawerMask")) $("drawerMask").classList.remove("hidden");
  if ($("drawer")) $("drawer").classList.remove("hidden");
}
function dongDrawer(){
  if ($("drawerMask")) $("drawerMask").classList.add("hidden");
  if ($("drawer")) $("drawer").classList.add("hidden");
}

/* =========================
   Pager
========================= */
function tongTrang(){
  return Math.max(1, Math.ceil(state.total / state.pageSize));
}
function capNhatPager(){
  const p = tongTrang();
  if ($("pageLabel")) $("pageLabel").textContent = `Trang ${state.page} / ${p}`;
  if ($("pageLabel2")) $("pageLabel2").textContent = `Trang ${state.page} / ${p}`;
  if ($("btnPrev")) $("btnPrev").disabled = state.page <= 1;
  if ($("btnPrev2")) $("btnPrev2").disabled = state.page <= 1;
  if ($("btnNext")) $("btnNext").disabled = state.page >= p;
  if ($("btnNext2")) $("btnNext2").disabled = state.page >= p;
}

/* =========================
   Categories
========================= */
async function loadCategories(){
  dangTai(true, "Đang tải danh mục…");
  try{
    const tree = await api("/api/categories?tree=1", { auth:false });
    state.categories = tree || [];
    renderCategories();
  }catch(e){
    thongbao("warn","Danh mục", e.message);
  }finally{
    dangTai(false);
  }
}

function renderCategories(){
  const box = $("catList");
  if (!box) return;
  box.innerHTML = "";

  const mk = (node, depth = 0) => {
    const div = document.createElement("div");
    div.className = `catItem ${depth ? "catChild" : ""} ${String(state.categoryId) === String(node.id) ? "active" : ""}`;
    div.innerHTML = `
      <div>
        <div class="catName">${escapeHtml(node.name)}</div>
        <div class="catMeta">${depth ? "Danh mục con" : "Danh mục"}</div>
      </div>
      <div class="catMeta">›</div>
    `;
    div.onclick = () => {
      state.categoryId = String(node.id);
      state.page = 1;
      renderCategories();
      loadProducts();
    };
    box.appendChild(div);
    (node.children || []).forEach(ch => mk(ch, depth + 1));
  };

  const all = document.createElement("div");
  all.className = `catItem ${state.categoryId === "" ? "active" : ""}`;
  all.innerHTML = `
    <div>
      <div class="catName">Tất cả sản phẩm</div>
      <div class="catMeta">Xem mọi mặt hàng</div>
    </div>
    <div class="catMeta">›</div>
  `;
  all.onclick = () => {
    state.categoryId = "";
    state.page = 1;
    renderCategories();
    loadProducts();
  };
  box.appendChild(all);

  state.categories.forEach(c => mk(c, 0));
}

/* =========================
   Products
========================= */
function buildProductQuery(){
  const q = new URLSearchParams();
  q.set("page", String(state.page));
  q.set("pageSize", String(state.pageSize));
  q.set("sort", $("sort")?.value || "newest");

  const keyword = $("q")?.value.trim();
  if (keyword) q.set("keyword", keyword);

  const brand = $("brand")?.value.trim();
  if (brand) q.set("brand", brand);

  const minPrice = $("minPrice")?.value.trim();
  if (minPrice) q.set("minPrice", minPrice);

  const maxPrice = $("maxPrice")?.value.trim();
  if (maxPrice) q.set("maxPrice", maxPrice);

  if (state.categoryId) q.set("categoryId", state.categoryId);

  return q;
}

async function loadProducts(){
  dangTai(true, "Đang tải sản phẩm…");
  try{
    state.pageSize = Number($("pageSize")?.value || 24);
    const q = buildProductQuery();
    const r = await api(`/api/products?${q.toString()}`, { auth:false });

    state.total = Number(r.total || 0);
    state.lastProducts = r.items || [];

    if ($("resultMeta")) {
      $("resultMeta").textContent = `${state.total} sản phẩm • Hiển thị ${(r.items || []).length}`;
    }
    capNhatPager();
    renderGrid();
  }catch(e){
    thongbao("bad","Sản phẩm", e.message);
  }finally{
    dangTai(false);
  }
}

function renderGrid(){
  const grid = $("grid");
  if (!grid) return;

  const items = state.lastProducts;

  if (!items.length){
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--muted)">Không tìm thấy sản phẩm.</div>`;
    return;
  }

  grid.innerHTML = items.map(p => {
    const now = Number(p.sellingPrice);
    const old = p.discountPrice ? Number(p.price) : null;
    const thumb = p.thumbnail
      ? `<img src="${p.thumbnail}" alt="">`
      : `<div style="color:var(--muted);font-size:12px">Chưa có ảnh</div>`;

    return `
      <div class="cardP">
        <div class="cardP__img">${thumb}</div>
        <div class="cardP__body">
          <div class="cardP__name">${escapeHtml(p.name)}</div>
          <div class="cardP__meta">${escapeHtml(p.brand || "")} • SKU ${escapeHtml(p.sku)}</div>
          <div class="badges"></div>
          <div class="cardP__price">
            <div class="priceNow">${tien(now)} ₫</div>
            ${old ? `<div class="priceOld">${tien(old)} ₫</div>` : ``}
          </div>
          <div class="badgeStock">${p.stock > 0 ? `Còn hàng: ${p.stock}` : `Hết hàng`}</div>
          <div class="cardP__actions">
            <input class="inp cardP__qty" id="qty_${p.id}" type="number" min="1" value="1" />
            <button class="btn btn--ghost cardP__btn" data-view="${p.id}">Xem</button>
            <button class="btn btn--primary cardP__btn cardP__btn--add" data-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>Thêm vào giỏ</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!storage.access) return moModal("loginModal");

      const id = Number(btn.getAttribute("data-add"));
      const qty = Number($(`qty_${id}`)?.value || 1);

      try{
        dangTai(true, "Đang thêm vào giỏ…");
        await api("/api/cart/items", { method:"POST", body:{ productId:id, qty } });
        thongbao("ok","Đã thêm vào giỏ", `Số lượng: ${qty}`);
        await loadCart();
        moDrawer();
      }catch(e){
        thongbao("bad","Giỏ hàng", e.message);
      }finally{
        dangTai(false);
      }
    });
  });

  grid.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => openProductView(Number(btn.getAttribute("data-view"))));
  });
}

async function openProductView(productId){
  try{
    dangTai(true, "Đang tải chi tiết…");

    const p = await api(`/api/products/${productId}`, { auth:false });

    if ($("pvTitle")) $("pvTitle").textContent = p.name;
    if ($("pvSub")) $("pvSub").textContent = `SKU ${p.sku} • ${p.brand || ""}`;
    if ($("pvPrice")) $("pvPrice").textContent = `${tien(p.sellingPrice)} ₫`;
    if ($("pvStock")) $("pvStock").textContent = `Tồn kho: ${p.stock}`;

    const desc = p.description || "Sản phẩm chưa có mô tả.";
    const preview = makePreview(desc, 120);

    const pvHintEl = document.querySelector("#pvModal .pv__info .hint");
    const pvDescEl = $("pvDesc");

    if (pvHintEl) pvHintEl.innerHTML = "";
    if (pvDescEl) pvDescEl.innerHTML = escapeHtml(preview);

    if ($("pvImg")) {
      $("pvImg").innerHTML =
        p.images?.[0]?.url
          ? `<img src="${p.images[0].url}" alt="">`
          : `<div class="fallbackImg">🛍️</div>`;
    }

    if ($("pvQty")) $("pvQty").value = 1;

    if ($("btnPvAdd")) {
      $("btnPvAdd").onclick = async () => {
        if (!storage.access) return moModal("loginModal");

        const qty = Number($("pvQty")?.value || 1);

        dangTai(true, "Đang thêm vào giỏ…");
        try{
          await api("/api/cart/items", {
            method:"POST",
            body:{ productId, qty }
          });

          thongbao("ok","Đã thêm vào giỏ", `Số lượng: ${qty}`);
          await loadCart();
          dongModal("pvModal");
          moDrawer();
        }catch(e){
          thongbao("bad","Giỏ hàng", e.message);
        }finally{
          dangTai(false);
        }
      };
    }

    if ($("btnPvGoCart")) {
      $("btnPvGoCart").onclick = () => {
        dongModal("pvModal");
        moDrawer();
      };
    }

    moModal("pvModal");
  }catch(e){
    thongbao("bad","Sản phẩm", e.message);
  }finally{
    dangTai(false);
  }
}

/* =========================
   Cart
========================= */
async function loadCart(){
  if (!storage.access){
    if ($("cartBadge")) $("cartBadge").classList.add("hidden");
    return;
  }

  const r = await api("/api/cart");
  const count = Number(r.summary?.itemCount || 0);

  if ($("cartBadge")) {
    $("cartBadge").textContent = count;
    $("cartBadge").classList.toggle("hidden", count <= 0);
  }

  if ($("cartMeta")) $("cartMeta").textContent = `${r.summary.itemLines} dòng • ${count} món`;
  if ($("cartSubtotal")) $("cartSubtotal").textContent = `${tien(r.summary.subtotal)} ₫`;

  const items = r.items || [];
  if (!$("cartItems")) return;

  $("cartItems").innerHTML = items.length ? items.map(it => `
    <div class="cartItem">
      <div class="cartItem__img"></div>
      <div class="cartItem__mid">
        <div class="cartItem__name">${escapeHtml(it.name)}</div>
        <div class="cartItem__meta">SKU ${escapeHtml(it.sku)} • Đơn giá ${tien(it.unitPrice)} ₫</div>
        <div class="cartItem__row">
          <input class="inp" id="ci_${it.itemId}" type="number" min="1" value="${it.qty}">
          <button class="btn btn--ghost" data-upd="${it.itemId}">Cập nhật</button>
          <button class="btn btn--ghost" data-del="${it.itemId}" style="border-color:#ef4444;color:#ef4444">Xóa</button>
        </div>
      </div>
    </div>
  `).join("") : `<div style="color:var(--muted)">Giỏ hàng trống.</div>`;

  $("cartItems").querySelectorAll("[data-upd]").forEach(btn => {
    btn.onclick = async () => {
      const itemId = Number(btn.getAttribute("data-upd"));
      const qty = Number($(`ci_${itemId}`)?.value || 1);
      dangTai(true, "Đang cập nhật giỏ…");
      try{
        await api(`/api/cart/items/${itemId}`, { method:"PUT", body:{ qty } });
        thongbao("ok","Đã cập nhật", `Số lượng: ${qty}`);
        await loadCart();
      }catch(e){
        thongbao("bad","Giỏ hàng", e.message);
      }finally{
        dangTai(false);
      }
    };
  });

  $("cartItems").querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      const itemId = Number(btn.getAttribute("data-del"));
      dangTai(true, "Đang xóa…");
      try{
        await api(`/api/cart/items/${itemId}`, { method:"DELETE" });
        thongbao("ok","Đã xóa","Đã xóa khỏi giỏ");
        await loadCart();
      }catch(e){
        thongbao("bad","Giỏ hàng", e.message);
      }finally{
        dangTai(false);
      }
    };
  });
}

/* =========================
   Addresses
========================= */

let __addressesPromise = null;

async function loadAddresses(force = false){
  if (!storage.access) return [];

  if (__addressesPromise && !force) {
    return __addressesPromise;
  }

  __addressesPromise = (async () => {
    try{
      const rows = await api("/api/addresses");
      state.addresses = rows || [];
      renderAddresses();
      renderAddressSelect();
      return state.addresses;
    }catch(e){
      state.addresses = [];
      renderAddresses();
      renderAddressSelect();
      thongbao("bad","Địa chỉ", e.message || "Không tải được địa chỉ");
      return [];
    } finally {
      __addressesPromise = null;
    }
  })();

  return __addressesPromise;
}

async function openAddressModal(fromCheckout = false) {
  if (!storage.access) {
    moModal("loginModal");
    return;
  }

  reopenCheckoutAfterAddress = fromCheckout;

  if (fromCheckout) {
    dongModal("checkoutModal");
  }

  moModal("addrModal");

  if ($("addrList")) {
    $("addrList").innerHTML = `<div style="color:var(--muted)">Đang tải địa chỉ...</div>`;
  }

  await loadAddresses();
}

function renderAddresses(){
  const box = $("addrList");
  if (!box) return;

  const items = state.addresses;

  if (!items.length){
    box.innerHTML = `<div style="color:var(--muted)">Chưa có địa chỉ. Hãy thêm mới.</div>`;
    return;
  }

  box.innerHTML = items.map(a => `
    <div class="cartItem" style="align-items:flex-start">
      <div class="cartItem__img"></div>
      <div class="cartItem__mid">
        <div class="cartItem__name">${a.is_default ? "⭐ " : ""}${escapeHtml(a.detail)}</div>
        <div class="cartItem__meta">${escapeHtml(a.ward || "")} • ${escapeHtml(a.district || "")} • ${escapeHtml(a.city)}</div>
        <div class="cartItem__row">
          <button class="btn btn--ghost" data-edit="${a.id}">Sửa</button>
          <button class="btn btn--ghost" data-def="${a.id}">Đặt mặc định</button>
          <button class="btn btn--ghost" data-deladdr="${a.id}" style="border-color:#ef4444;color:#ef4444">Xóa</button>
        </div>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.getAttribute("data-edit"));
      const a = state.addresses.find(x => x.id === id);
      if (!a) return;
      if ($("aId")) $("aId").value = a.id;
      if ($("aDetail")) $("aDetail").value = a.detail || "";
      if ($("aWard")) $("aWard").value = a.ward || "";
      if ($("aDistrict")) $("aDistrict").value = a.district || "";
      if ($("aCity")) $("aCity").value = a.city || "";
    };
  });

  box.querySelectorAll("[data-def]").forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.getAttribute("data-def"));
      dangTai(true, "Đang đặt mặc định…");
      try{
        await api(`/api/addresses/${id}/default`, { method:"PUT" });
        thongbao("ok","Đã đặt mặc định","Địa chỉ đã được cập nhật.");
        await loadAddresses();
      }catch(e){
        thongbao("bad","Địa chỉ", e.message);
      }finally{
        dangTai(false);
      }
    };
  });

  box.querySelectorAll("[data-deladdr]").forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.getAttribute("data-deladdr"));
      if (!confirm("Xóa địa chỉ này?")) return;
      dangTai(true, "Đang xóa…");
      try{
        await api(`/api/addresses/${id}`, { method:"DELETE" });
        thongbao("ok","Đã xóa","Địa chỉ đã được xóa.");
        await loadAddresses();
      }catch(e){
        thongbao("bad","Địa chỉ", e.message);
      }finally{
        dangTai(false);
      }
    };
  });
}

function renderAddressSelect(){
  const sel = $("addressSelect");
  if (!sel) return;

  const items = state.addresses || [];
  const def = items.find(x => x.is_default) || items[0] || null;
  state.selectedAddressId = def ? def.id : null;

  sel.innerHTML = [`<option value="">Nhập địa chỉ mới</option>`, ...items.map(a => `
    <option value="${a.id}" ${def && a.id === def.id ? "selected" : ""}>
      ${a.is_default ? "⭐ " : ""}${a.detail} • ${a.district || ""} • ${a.city}
    </option>
  `)].join("");

  if (def) {
    setCheckoutAddressFields(def);
  }

  sel.onchange = () => {
    state.selectedAddressId = sel.value ? Number(sel.value) : null;
    const picked = items.find(a => Number(a.id) === Number(sel.value));
    if (picked) {
      setCheckoutAddressFields(picked);
    } else {
      setCheckoutAddressFields({});
    }
  };
}

async function saveAddress(){
  const idRaw = $("aId")?.value.trim();
  const payload = {
    detail: $("aDetail")?.value.trim(),
    ward: $("aWard")?.value.trim() || undefined,
    district: $("aDistrict")?.value.trim() || undefined,
    city: $("aCity")?.value.trim(),
    isDefault: false,
  };

  if (!payload.detail || !payload.city){
    return thongbao("warn","Thiếu dữ liệu","detail và city là bắt buộc.");
  }

  dangTai(true, "Đang lưu địa chỉ…");
  try{
    if (!idRaw){
      await api("/api/addresses", { method:"POST", body: payload });
      thongbao("ok","Đã thêm địa chỉ","Thêm mới thành công.");
    } else {
      const id = Number(idRaw);
      await api(`/api/addresses/${id}`, { method:"PUT", body: payload });
      thongbao("ok","Đã cập nhật","Cập nhật thành công.");
    }

    if ($("aId")) $("aId").value = "";
    if ($("aDetail")) $("aDetail").value = "";
    if ($("aWard")) $("aWard").value = "";
    if ($("aDistrict")) $("aDistrict").value = "";
    if ($("aCity")) $("aCity").value = "";

    await loadAddresses(true);

    if (reopenCheckoutAfterAddress) {
      reopenCheckoutAfterAddress = false;
      dongModal("addrModal");
      moModal("checkoutModal");
      prefillCheckoutForm();
    }
  }catch(e){
    thongbao("bad","Địa chỉ", e.message);
  }finally{
    dangTai(false);
  }
}

/* =========================
   Customer Orders
========================= */
async function loadMyOrders(){
  if (!storage.access) return;
  dangTai(true, "Đang tải đơn hàng…");
  try{
    const r = await api("/api/orders/my?page=1&pageSize=20");
    renderMyOrders(r.items || []);
  }catch(e){
    thongbao("bad","Đơn hàng", e.message);
  }finally{
    dangTai(false);
  }
}

function renderMyOrders(items){
  const box = $("myOrdersList");
  if (!box) return;

  if (!items.length){
    box.innerHTML = `<div style="color:var(--muted)">Bạn chưa có đơn nào.</div>`;
    return;
  }

  box.innerHTML = items.map(o => `
    <div class="cartItem" style="align-items:flex-start">
      <div class="cartItem__img"></div>
      <div class="cartItem__mid">
        <div class="cartItem__name">${escapeHtml(o.order_code)}</div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          ${customerOrderBadge(o.status)}
          ${customerPaymentBadge(o.payment_status)}
          ${customerStatusChip(o.payment_method)}
        </div>

        <div class="cartItem__meta" style="margin-top:8px">
          Tổng: <b>${tien(o.grand_total)} ₫</b>
        </div>

        <div class="cartItem__row">
          <button class="btn btn--ghost" data-od="${escapeHtml(o.order_code)}">Xem chi tiết</button>
          ${
            o.payment_method === "ONLINE" && o.payment_status === "PENDING_PAYMENT"
              ? `<button class="btn btn--primary" data-pay-order="${escapeHtml(o.order_code)}">Thanh toán ngay</button>`
              : ``
          }
        </div>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-od]").forEach(btn => {
    btn.onclick = async () => {
      const code = btn.getAttribute("data-od");
      await loadOrderDetail(code);
    };
  });

  box.querySelectorAll("[data-pay-order]").forEach(btn => {
    btn.onclick = async () => {
      const code = btn.getAttribute("data-pay-order");
      const order = items.find(x => x.order_code === code);
      if (order) {
        await openPaymentStepForOrder(order);
      }
    };
  });
}

async function loadOrderDetail(orderCode){
  dangTai(true, "Đang tải chi tiết…");
  try{
    const o = await api(`/api/orders/${encodeURIComponent(orderCode)}`);
    const items = o.items || [];
    const pay = (o.payments || [])[0];

    const canPayNow =
      o.payment_method === "ONLINE" &&
      o.payment_status === "PENDING_PAYMENT" &&
      o.status !== "CANCELLED";

    if (!$("myOrderDetail")) return;

    $("myOrderDetail").innerHTML = `
      <div style="font-weight:900;font-size:18px">${escapeHtml(o.order_code)}</div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        ${customerOrderBadge(o.status)}
        ${customerPaymentBadge(o.payment_status)}
        ${customerStatusChip(o.payment_method)}
      </div>

      <div style="margin-top:10px">
        Tổng: <b>${tien(o.grand_total)} ₫</b>
        <span style="color:var(--muted)"> (Ship ${tien(o.shipping_fee)} • Giảm ${tien(o.discount_total)})</span>
      </div>

      ${buildOrderTimeline(o)}

      ${
        canPayNow
          ? `
            <div style="margin:12px 0">
              <button id="btnPayThisOrderNow" class="btn btn--primary">Thanh toán ngay cho đơn này</button>
            </div>
          `
          : ``
      }

      <div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px">
        <div style="font-weight:800;margin-bottom:6px">Sản phẩm</div>
        ${items.map(it => `
          <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed #e2e8f0">
            <div>
              <div style="font-weight:700">${escapeHtml(it.name)}</div>
              <div style="color:var(--muted);font-size:12px">SKU ${escapeHtml(it.sku)} • SL ${it.qty}</div>
            </div>
            <div style="text-align:right">
              <div>${tien(it.line_total)} ₫</div>
              <div style="color:var(--muted);font-size:12px">${tien(it.price_snapshot)} ₫/sp</div>
            </div>
          </div>
        `).join("")}
      </div>

      <div style="margin-top:10px;color:var(--muted);font-size:12px">
        Giao dịch:
        ${
          pay
            ? `${escapeHtml(pay.provider)} • ${escapeHtml(pay.txn_ref)} • ${escapeHtml(pay.status)}`
            : "Chưa có"
        }
      </div>
    `;

    if (canPayNow) {
      const btn = $("btnPayThisOrderNow");
      if (btn) {
        btn.onclick = async () => openPaymentStepForOrder(o);
      }
    }
  }catch(e){
    thongbao("bad","Đơn hàng", e.message);
  }finally{
    dangTai(false);
  }
}

async function openPaymentStepForOrder(order){
  if (storage.access) {
    await loadAddresses();
    prefillCheckoutForm();
  }
  if ($("payOrderCode")) $("payOrderCode").value = order.order_code || "";
  if ($("amount")) $("amount").value = order.grand_total || 0;
  if ($("mount")) $("mount").value = order.grand_total || 0;
  if ($("paymentMethod")) $("paymentMethod").value = "ONLINE";
  togglePaymentDemo();
  moModal("checkoutModal");
}

/* =========================
   Checkout / Payment
========================= */
function updateCheckoutStepBadge(){
  const method = $("paymentMethod")?.value;
  const badge = $("step2Badge");
  if (!badge) return;

  if (method === "ONLINE") {
    badge.textContent = "Bước 2 • Thanh toán online";
    badge.style.background = "#eef2ff";
    badge.style.borderColor = "#c7d2fe";
    badge.style.color = "#4338ca";
  } else {
    badge.textContent = "Bước 2 • Bỏ qua vì COD";
    badge.style.background = "#f0fdf4";
    badge.style.borderColor = "#bbf7d0";
    badge.style.color = "#166534";
  }
}

function togglePaymentDemo(){
  const method = $("paymentMethod")?.value;
  const box = $("paymentDemoBox");
  if (box) {
    box.classList.toggle("hidden", method !== "ONLINE");
  }
  updateCheckoutStepBadge();
}


async function placeOrder(){
  if (!storage.access) {
    moModal("loginModal");
    return;
  }

  const form = getCheckoutProfileFromForm();
  if (!form.fullName) return thongbao("warn","Thiếu thông tin","Vui lòng nhập họ và tên người nhận.");
  if (!form.phone) return thongbao("warn","Thiếu thông tin","Vui lòng nhập số điện thoại người nhận.");
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return thongbao("warn","Thiếu thông tin","Email chưa đúng định dạng.");

  const selectedAddressId = Number($("addressSelect")?.value || 0);
  const hasTypedAddress = !!(form.detail || form.ward || form.district || form.city);

  if (!selectedAddressId && !hasTypedAddress) {
    thongbao("warn","Thiếu địa chỉ","Bạn cần thêm hoặc chọn địa chỉ giao hàng trước.");
    await openAddressModal(true);
    return;
  }

  const shippingFee = Number($("shippingFee")?.value || 0);
  const couponCode = $("couponCode")?.value.trim();
  const paymentMethod = $("paymentMethod")?.value;
  const payBox = $("paymentDemoBox");

  dangTai(true, "Đang tạo đơn…");
  try{
    const addressId = await ensureCheckoutAddress(form);
    saveOrderProfile(form);

    const body = { addressId, shippingFee, paymentMethod };
    if (couponCode) body.couponCode = couponCode;

    const r = await api("/api/orders", { method:"POST", body });

    if ($("orderCreated")) {
      $("orderCreated").innerHTML =
        paymentMethod === "ONLINE"
          ? `Đã tạo đơn <b>${r.orderCode}</b>. Đang chuyển sang bước thanh toán VNPAY QR.`
          : `Đã tạo đơn <b>${r.orderCode}</b>. Đây là đơn <b>COD</b>, đơn đang ở trạng thái <b>chờ admin duyệt</b>.`;
    }

    if ($("payOrderCode")) $("payOrderCode").value = r.orderCode;
    if ($("amount")) $("amount").value = r.grandTotal;
    if ($("mount")) $("mount").value = r.grandTotal;

    thongbao("ok","Đặt hàng thành công", `Mã đơn: ${r.orderCode}`);

    await Promise.allSettled([
      loadCart(),
      loadMyOrders()
    ]);

    dongDrawer();

    if (paymentMethod === "ONLINE") {
      if (payBox) {
        payBox.classList.remove("hidden");
        payBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      await createPayment();
      return r;
    }

    if (payBox) payBox.classList.add("hidden");
    return r;
  }catch(e){
    thongbao("bad","Đặt hàng thất bại", e.message || "Không tạo được đơn hàng");
  }finally{
    dangTai(false);
  }
}

async function createPayment(){
  const orderCode = $("payOrderCode")?.value.trim();

  if (!orderCode){
    return thongbao("warn","Thiếu mã đơn","Hãy tạo đơn trước khi thanh toán.");
  }

  dangTai(true, "Đang tạo phiên thanh toán VNPAY QR…");
  try{
    const r = await api("/api/payments/create", {
      method:"POST",
      body:{
        orderCode,
        provider:"vnpay"
      }
    });

    if ($("payInfo")) {
      $("payInfo").textContent = `Đang chuyển sang cổng thanh toán VNPAY QR cho đơn ${orderCode}...`;
    }

    thongbao("ok","Đang chuyển sang VNPAY","Vui lòng hoàn tất thanh toán trên trang VNPAY.");
    goToPaymentUrl(r.payUrl);
  }catch(e){
    thongbao("bad","Tạo thanh toán thất bại", e.message);
  }finally{
    dangTai(false);
  }
}

async function checkPayment(){
  const orderCode = $("payOrderCode")?.value.trim();
  if (!orderCode){
    return thongbao("warn","Thiếu mã đơn","Nhập orderCode để kiểm tra.");
  }

  dangTai(true, "Đang kiểm tra trạng thái…");
  try{
    const r = await api(`/api/payments/status?orderCode=${encodeURIComponent(orderCode)}`);

    if ($("payInfo")) {
      $("payInfo").textContent =
        `Đơn: ${r.orderCode} • ${paymentStatusText(r.paymentStatus)} • Trạng thái đơn: ${orderStatusText(r.orderStatus)}`;
    }

    thongbao("ok","Trạng thái thanh toán", paymentStatusText(r.paymentStatus));
    await loadMyOrders();

    const currentDetailText = $("myOrderDetail")?.textContent || "";
    if (currentDetailText.includes(orderCode)) {
      await loadOrderDetail(orderCode);
    }
  }catch(e){
    thongbao("bad","Kiểm tra thanh toán thất bại", e.message);
  }finally{
    dangTai(false);
  }
}

/* =========================
   Enhancements
========================= */
const RECENT_KEY = "gs_recent_products_v1";
const ORDER_PROFILE_KEY = "gs_checkout_profile_v1";

function getOrderProfile(){
  try { return JSON.parse(localStorage.getItem(ORDER_PROFILE_KEY) || "{}"); } catch { return {}; }
}

function saveOrderProfile(profile){
  localStorage.setItem(ORDER_PROFILE_KEY, JSON.stringify({
    fullName: profile.fullName || "",
    phone: profile.phone || "",
    email: profile.email || "",
    note: profile.note || "",
  }));
}

function setCheckoutAddressFields(address = {}){
  if ($("orderDetail")) $("orderDetail").value = address.detail || "";
  if ($("orderWard")) $("orderWard").value = address.ward || "";
  if ($("orderDistrict")) $("orderDistrict").value = address.district || "";
  if ($("orderCity")) $("orderCity").value = address.city || "";
}

function prefillCheckoutForm(){
  const profile = getOrderProfile();
  if ($("orderFullName")) $("orderFullName").value = profile.fullName || "";
  if ($("orderPhone")) $("orderPhone").value = profile.phone || "";
  if ($("orderEmail")) $("orderEmail").value = profile.email || "";
  if ($("orderNote")) $("orderNote").value = profile.note || "";

  const selected = state.addresses.find(x => Number(x.id) === Number(state.selectedAddressId)) || state.addresses.find(x => x.is_default) || state.addresses[0];
  if (selected) {
    if ($("addressSelect")) $("addressSelect").value = String(selected.id);
    state.selectedAddressId = selected.id;
    setCheckoutAddressFields(selected);
  } else {
    if ($("addressSelect")) $("addressSelect").value = "";
    state.selectedAddressId = null;
    setCheckoutAddressFields({});
  }
}

function getCheckoutProfileFromForm(){
  return {
    fullName: ($("orderFullName")?.value || "").trim(),
    phone: ($("orderPhone")?.value || "").trim(),
    email: ($("orderEmail")?.value || "").trim(),
    note: ($("orderNote")?.value || "").trim(),
    detail: ($("orderDetail")?.value || "").trim(),
    ward: ($("orderWard")?.value || "").trim(),
    district: ($("orderDistrict")?.value || "").trim(),
    city: ($("orderCity")?.value || "").trim(),
  };
}

function isSameAddress(a, form){
  if (!a) return false;
  return ["detail","ward","district","city"].every(k => String(a[k] || "").trim() === String(form[k] || "").trim());
}

async function ensureCheckoutAddress(form){
  const selectedId = Number($("addressSelect")?.value || 0);
  const selectedAddress = state.addresses.find(x => Number(x.id) === selectedId) || null;
  const hasTypedAddress = !!(form.detail || form.ward || form.district || form.city);

  if (selectedAddress && !hasTypedAddress) {
    return selectedAddress.id;
  }

  if (selectedAddress && hasTypedAddress && isSameAddress(selectedAddress, form)) {
    return selectedAddress.id;
  }

  if (!form.detail || !form.city) {
    throw new Error("Vui lòng nhập số nhà/đường và tỉnh/thành phố giao hàng.");
  }

  const created = await api("/api/addresses", {
    method: "POST",
    body: {
      detail: form.detail,
      ward: form.ward || undefined,
      district: form.district || undefined,
      city: form.city,
      isDefault: false,
    }
  });

  const addressId = Number(created?.id || created?.addressId || 0);
  if (!addressId) {
    await loadAddresses();
    const matched = state.addresses.find(a => isSameAddress(a, form));
    if (matched) return matched.id;
    throw new Error("Không lấy được địa chỉ vừa tạo.");
  }
  await loadAddresses();
  return addressId;
}


function iconByName(name = ""){
  const s = name.toLowerCase();
  if (s.includes("sữa") || s.includes("dairy") || s.includes("yog")) return "🥛";
  if (s.includes("đồ uống") || s.includes("drink") || s.includes("trà") || s.includes("nước")) return "🥤";
  if (s.includes("gạo") || s.includes("rice") || s.includes("thực phẩm") || s.includes("food")) return "🍚";
  if (s.includes("bánh") || s.includes("snack") || s.includes("kẹo") || s.includes("cookie")) return "🍪";
  if (s.includes("gia dụng") || s.includes("lau") || s.includes("rửa") || s.includes("home")) return "🧽";
  if (s.includes("trứng") || s.includes("egg")) return "🥚";
  return "🛍️";
}

function stableHot(sku = ""){
  let h = 0;
  for (let i = 0; i < sku.length; i++) h = (h * 31 + sku.charCodeAt(i)) >>> 0;
  return (h % 10) < 2;
}

function isNew(createdAt){
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  const days = (Date.now() - t) / (1000 * 60 * 60 * 24);
  return days <= 7;
}

function salePercent(price, selling){
  const p = Number(price || 0), s = Number(selling || 0);
  if (p > 0 && s > 0 && s < p) return Math.round((1 - s / p) * 100);
  return 0;
}

function getRecent(){
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function setRecent(list){
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
}
function pushRecent(p){
  const list = getRecent();
  const item = {
    id: p.id,
    name: p.name,
    sku: p.sku,
    brand: p.brand || "",
    sellingPrice: p.sellingPrice,
    price: p.price,
    discountPrice: p.discountPrice,
    thumbnail: p.images?.[0]?.url || p.thumbnail || "",
    createdAt: p.createdAt || null
  };
  const filtered = [item, ...list.filter(x => x.id !== item.id)];
  setRecent(filtered);
  renderRecent();
}
function clearRecent(){
  localStorage.removeItem(RECENT_KEY);
  renderRecent();
}

function renderRecent(){
  const box = $("recentBox");
  const section = $("recentSection");
  if (!box || !section) return;

  const list = getRecent();
  section.style.display = list.length ? "block" : "none";
  if (!list.length){
    box.innerHTML = "";
    return;
  }

  box.innerHTML = list.map(p => {
    const thumb = p.thumbnail
      ? `<img src="${p.thumbnail}" alt="">`
      : `<div class="fallbackImg">${iconByName(p.name)}</div>`;
    return `
      <div class="recentCard" data-rid="${p.id}">
        <div class="recentCard__img">${thumb}</div>
        <div class="recentCard__body">
          <div class="recentCard__name">${escapeHtml(p.name)}</div>
          <div class="recentCard__meta">${escapeHtml(p.brand || "")} • SKU ${escapeHtml(p.sku || "")}</div>
          <div class="recentCard__price">${tien(p.sellingPrice)} ₫</div>
        </div>
      </div>
    `;
  }).join("");

  box.querySelectorAll("[data-rid]").forEach(el => {
    el.onclick = () => openProductView(Number(el.getAttribute("data-rid")));
  });
}

/* =========================
   Patch UI
========================= */
const __oldRenderCategories = renderCategories;
renderCategories = function(){
  __oldRenderCategories();

  const items = document.querySelectorAll("#catList .catItem .catName");
  items.forEach(el => {
    const name = el.textContent || "";
    if (!name.startsWith("🛍️") && !name.includes("All") && !name.includes("Tất cả")){
      const emo = iconByName(name);
      el.innerHTML = `<span class="catEmoji">${emo}</span>` + escapeHtml(name);
    }
  });
};

const __oldRenderGrid = renderGrid;
renderGrid = function(){
  __oldRenderGrid();

  document.querySelectorAll(".cardP").forEach(card => {
    const metaEl = card.querySelector(".cardP__meta");
    const priceNowEl = card.querySelector(".priceNow");
    if (!metaEl || !priceNowEl) return;

    const meta = metaEl.textContent || "";
    const skuMatch = meta.match(/SKU\s(.+)$/);
    const sku = skuMatch ? skuMatch[1].trim() : "";
    const p = (state.lastProducts || []).find(x => String(x.sku) === String(sku));
    if (!p) return;

    const sp = salePercent(p.price, p.sellingPrice);
    const hot = stableHot(p.sku || "");
    const fresh = isNew(p.createdAt);

    const badgeBox = card.querySelector(".badges");
    if (badgeBox){
      badgeBox.innerHTML = "";
      if (sp >= 5) badgeBox.innerHTML += `<span class="badge badge--sale">Giảm ${sp}%</span>`;
      if (fresh) badgeBox.innerHTML += `<span class="badge badge--new">Mới</span>`;
      if (hot) badgeBox.innerHTML += `<span class="badge badge--hot">Bán chạy</span>`;
    }

    const imgWrap = card.querySelector(".cardP__img");
    if (imgWrap && !imgWrap.querySelector("img")){
      imgWrap.innerHTML = `<div class="fallbackImg">${iconByName(p.name)}</div>`;
    }
  });
};

const __oldOpenProductView = openProductView;
openProductView = async function(productId){
  await __oldOpenProductView(productId);
  try{
    const p = await api(`/api/products/${productId}`, { auth:false });
    pushRecent(p);
  }catch{}
};

/* =========================
   Inline Admin / Staff Dashboard
========================= */
function admLog(msg, obj){
  const el = $("admLog");
  if (!el) return;
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${msg}` + (obj ? `\n${typeof obj === "string" ? obj : JSON.stringify(obj, null, 2)}` : "");
  el.textContent = `${line}\n${el.textContent || ""}`.trim();
}

function downloadCsv(filename, rows){
  if (!rows || !rows.length) return thongbao("warn", "Xuất CSV", "Không có dữ liệu để xuất.");
  const keys = Array.from(rows.reduce((s, row) => {
    Object.keys(row || {}).forEach(k => s.add(k));
    return s;
  }, new Set()));
  const escCsv = (v) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [keys.join(","), ...rows.map(row => keys.map(k => escCsv(row[k])).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function adminMoney(n){ return tien(n); }
function adminEsc(s){ return escapeHtml(s); }
function safeStringify(v){ try { return typeof v === 'string' ? v : JSON.stringify(v ?? {}); } catch { return String(v ?? ''); } }

function adminUserBadge(status){
  return customerStatusChip(status === "ACTIVE" ? "Đang hoạt động" : "Đã khóa", status === "ACTIVE" ? "ok" : "bad");
}

function getAllowedNextStatuses(order){
  if (!order) return [];
  if (Array.isArray(order.allowedNextStatuses) && order.allowedNextStatuses.length) return order.allowedNextStatuses;
  if (order.status === "NEW") {
    const out = [];
    const canApprove = order.payment_method === "COD" || (order.payment_method === "ONLINE" && order.payment_status === "PAID");
    if (canApprove) out.push("CONFIRMED");
    if (order.payment_status !== "PAID") out.push("CANCELLED");
    return out;
  }
  if (order.status === "CONFIRMED") {
    const out = ["PACKING"];
    if (order.payment_status !== "PAID") out.push("CANCELLED");
    return out;
  }
  if (order.status === "PACKING") return ["SHIPPING"];
  if (order.status === "SHIPPING") return ["DELIVERED"];
  return [];
}

function syncAdmNextStatus(order){
  const sel = $("admNextStatus");
  const btn = $("admBtnUpdateStatus");
  if (!sel) return;
  const nexts = getAllowedNextStatuses(order);
  if (!nexts.length){
    sel.innerHTML = `<option value="">Không có thao tác hợp lệ</option>`;
    sel.disabled = true;
    if (btn) btn.disabled = true;
    return;
  }
  sel.innerHTML = nexts.map(s => `<option value="${s}">${orderStatusText(s)}</option>`).join("");
  sel.disabled = false;
  if (btn) btn.disabled = false;
}

function fillAdmOrderForm(order){
  if (!order) return;
  setSelectedAdmOrder(order.id || order.orderId || "");
  if ($("admEditOrderAddressId")) $("admEditOrderAddressId").value = order.addressId || order.address_id || "";
  if ($("admEditOrderPaymentStatus")) $("admEditOrderPaymentStatus").value = order.payment_status || "";
  if ($("admEditOrderNote")) $("admEditOrderNote").value = order.note || "";
  syncAdmNextStatus(order);
  syncAdminActionStates();
}

function renderAdmPending(items){
  const all = items.filter(o => o.status === "NEW").length;
  const onlinePaid = items.filter(o => o.status === "NEW" && o.payment_method === "ONLINE" && o.payment_status === "PAID").length;
  const cod = items.filter(o => o.status === "NEW" && o.payment_method === "COD").length;
  if ($("admPendingAllCount")) $("admPendingAllCount").textContent = all;
  if ($("admPendingOnlinePaidCount")) $("admPendingOnlinePaidCount").textContent = onlinePaid;
  if ($("admPendingCodCount")) $("admPendingCodCount").textContent = cod;
}

function setAdminPageLabel(id, page, total, pageSize, showing){
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const el = $(id);
  if (!el) return;
  el.textContent = `Trang ${page}/${pages} • Tổng ${total} • Hiển thị ${showing}`;
}

function bindAdminPager(prevId, nextId, page, total, pageSize){
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if ($(prevId)) $(prevId).disabled = page <= 1;
  if ($(nextId)) $(nextId).disabled = page >= pages;
}

function buildAdmOrdersQuery(){
  state.admOrdersPageSize = Number($("admOrdersPageSize")?.value || 10);
  const q = new URLSearchParams({ page: String(state.admOrdersPage), pageSize: String(state.admOrdersPageSize) });
  const pairs = [
    ["status", $("admFilterStatus")?.value],
    ["paymentStatus", $("admFilterPayStatus")?.value],
    ["paymentMethod", $("admFilterPaymentMethod")?.value],
    ["dateFrom", ($("admFilterDateFrom")?.value || "").trim()],
    ["dateTo", ($("admFilterDateTo")?.value || "").trim()],
    ["orderCode", ($("admOrderCodeSearch")?.value || "").trim()],
  ];
  pairs.forEach(([k,v]) => { if (v) q.set(k, v); });
  return q;
}

function renderAdmOrders(items){
  const box = $("admOrdersBox");
  if (!box) return;
  box.innerHTML = items.length ? `
    <div class="adminTableWrap"><table class="adminTable">
      <thead><tr><th>ID</th><th>Mã đơn</th><th>Khách</th><th class="right">Tổng</th><th>Trạng thái</th><th>Thanh toán</th><th>Thao tác</th></tr></thead>
      <tbody>
        ${items.map(o => `
          <tr data-pick-adm-order="${o.id}" class="${String(state.admSelectedOrderId) === String(o.id) ? "is-active" : ""}">
            <td>${o.id}</td>
            <td><b>${adminEsc(o.order_code)}</b><div class="smallText">${new Date(o.created_at).toLocaleString()}</div></td>
            <td>${adminEsc(o.customerName || "—")}<div class="smallText">${adminEsc(o.customerEmail || "")}</div></td>
            <td class="right">${adminMoney(o.grand_total)}</td>
            <td>${customerOrderBadge(o.status)}</td>
            <td>${customerPaymentBadge(o.payment_status)}<div class="smallText">${adminEsc(o.payment_method || "")}</div></td>
            <td><div class="adminActions">${getAllowedNextStatuses(o).map(s => `<button class="btn ${s === "CANCELLED" ? "btn--ghost" : "btn--primary"}" data-adm-order-status="${s}" data-order-id="${o.id}">${orderStatusText(s)}</button>`).join("") || `<span class="smallText">—</span>`}</div></td>
          </tr>
        `).join("")}
      </tbody>
    </table></div>
  ` : `<div class="smallText">Không có đơn hàng.</div>`;

  box.querySelectorAll("[data-pick-adm-order]").forEach(tr => {
    tr.onclick = async (e) => {
      if (e.target?.closest("button[data-adm-order-status]")) return;
      setSelectedAdmOrder(tr.getAttribute("data-pick-adm-order"));
      await loadAdmOrderDetail();
    };
  });

  box.querySelectorAll("button[data-adm-order-status]").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      setSelectedAdmOrder(btn.getAttribute("data-order-id"));
      if ($("admNextStatus")) $("admNextStatus").value = btn.getAttribute("data-adm-order-status");
      syncAdminActionStates();
      await updateAdmOrderStatus();
    };
  });

  syncAdminActionStates();
}

async function loadAdmOrders(reset=false){
  if (!canUseAdmin()) return;
  if (reset) state.admOrdersPage = 1;
  dangTai(true, "Đang tải đơn quản trị…");
  try{
    const r = await api(`/api/admin/orders?${buildAdmOrdersQuery().toString()}`);
    state.admOrdersTotal = Number(r.total || 0);
    state.admOrdersView = r.items || [];
    renderAdmPending(state.admOrdersView);
    renderAdmOrders(state.admOrdersView);
    setAdminPageLabel("admOrdersPageLabel", state.admOrdersPage, state.admOrdersTotal, state.admOrdersPageSize, state.admOrdersView.length);
    bindAdminPager("admBtnPrevOrders", "admBtnNextOrders", state.admOrdersPage, state.admOrdersTotal, state.admOrdersPageSize);
  }catch(e){
    thongbao("bad","Đơn hàng quản trị", e.message);
  }finally{ dangTai(false); }
}

async function loadAdmOrderDetail(){
  const id = Number($("admOrderId")?.value || state.admSelectedOrderId || 0);
  if (!id) return thongbao("warn","Thiếu orderId","Hãy chọn một đơn hàng.");
  setSelectedAdmOrder(id);
  dangTai(true, "Đang tải chi tiết đơn…");
  try{
    const o = await api(`/api/admin/orders/${id}`);
    state.admCurrentOrder = o;
    fillAdmOrderForm(o);
    const items = (o.items || []).map(it => `
      <tr><td>${adminEsc(it.name || "")}</td><td>${adminEsc(it.sku || "")}</td><td class="right">${it.qty}</td><td class="right">${adminMoney(it.price_snapshot)}</td><td class="right">${adminMoney(it.line_total)}</td></tr>
    `).join("");
    const pays = (o.payments || []).map(p => `
      <tr><td>${adminEsc(p.provider || "")}</td><td>${adminEsc(p.txn_ref || "")}</td><td>${adminEsc(p.status || "")}</td><td class="right">${adminMoney(p.amount)}</td><td>${new Date(p.created_at).toLocaleString()}</td></tr>
    `).join("");
    $("admOrderDetailBox").innerHTML = `
      <div class="adminDetailCard">
        <div class="adminDetailTop">
          <div>
            <div class="adminDetailTitle">${adminEsc(o.order_code)}</div>
            <div class="smallText">Khách: ${adminEsc(o.customerName || "—")} • ${adminEsc(o.customerEmail || "")}</div>
          </div>
          <div class="adminBadgeRow">${customerOrderBadge(o.status)} ${customerPaymentBadge(o.payment_status)}</div>
        </div>
        <div class="adminStatsRow">
          <div><b>Tổng:</b> ${adminMoney(o.grand_total)}</div>
          <div><b>Ship:</b> ${adminMoney(o.shipping_fee)}</div>
          <div><b>Giảm:</b> ${adminMoney(o.discount_total)}</div>
          <div><b>Địa chỉ:</b> ${o.addressId || "—"}</div>
        </div>
        <div class="smallText" style="margin-top:8px">${adminEsc(o.note || "Không có ghi chú")}</div>
        <div class="adminSplit">
          <div>
            <div class="adminSubTitle">Sản phẩm</div>
            <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Tên</th><th>SKU</th><th class="right">SL</th><th class="right">Đơn giá</th><th class="right">Thành tiền</th></tr></thead><tbody>${items || `<tr><td colspan="5">Không có dữ liệu</td></tr>`}</tbody></table></div>
          </div>
          <div>
            <div class="adminSubTitle">Giao dịch</div>
            <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Cổng</th><th>Txn</th><th>Trạng thái</th><th class="right">Số tiền</th><th>Thời gian</th></tr></thead><tbody>${pays || `<tr><td colspan="5">Chưa có giao dịch</td></tr>`}</tbody></table></div>
          </div>
        </div>
      </div>`;
  }catch(e){ thongbao("bad","Chi tiết đơn", e.message); }
  finally{ dangTai(false); }
}

async function updateAdmOrderStatus(){
  const id = Number($("admOrderId")?.value || 0);
  const status = $("admNextStatus")?.value || "";
  if (!id || !status) return thongbao("warn","Thiếu dữ liệu","Chọn đơn và trạng thái hợp lệ.");
  dangTai(true, "Đang cập nhật trạng thái đơn…");
  try{
    await api(`/api/admin/orders/${id}/status`, { method:"PUT", body:{ status } });
    thongbao("ok","Đã cập nhật trạng thái", `Đơn #${id} → ${orderStatusText(status)}`);
    admLog("Order status updated", { id, status });
    await loadAdmOrders(false);
    await loadAdmOrderDetail();
  }catch(e){ thongbao("bad","Cập nhật trạng thái", e.message); }
  finally{ dangTai(false); }
}

async function updateAdmOrderPatch(){
  const id = Number($("admOrderId")?.value || 0);
  if (!id) return thongbao("warn","Thiếu orderId","Hãy chọn một đơn.");
  const patch = {};
  const addressIdRaw = ($("admEditOrderAddressId")?.value || "").trim();
  const paymentStatus = $("admEditOrderPaymentStatus")?.value || "";
  const note = ($("admEditOrderNote")?.value || "").trim();
  if (addressIdRaw) {
    const addressId = Number(addressIdRaw);
    if (!Number.isInteger(addressId) || addressId <= 0) return thongbao("warn","Sửa đơn","addressId phải là số nguyên dương.");
    patch.addressId = addressId;
  }
  if (paymentStatus) patch.paymentStatus = paymentStatus;
  if (note !== "") patch.note = note;
  if (!Object.keys(patch).length) return thongbao("warn","Không có thay đổi","Nhập ít nhất một trường để lưu.");
  dangTai(true, "Đang lưu sửa đơn…");
  try{
    await api(`/api/admin/orders/${id}`, { method:"PUT", body:{ patch } });
    thongbao("ok","Đã lưu sửa đơn", `Đơn #${id}`);
    admLog("Order updated", { id, patch });
    await loadAdmOrders(false);
    await loadAdmOrderDetail();
  }catch(e){ thongbao("bad","Sửa đơn", e.message); }
  finally{ dangTai(false); }
}

function buildAdmCustomersQuery(){
  state.admCustomersPageSize = Number($("admCustomersPageSize")?.value || 10);
  const q = new URLSearchParams({ page: String(state.admCustomersPage), pageSize: String(state.admCustomersPageSize) });
  const keyword = ($("admCustomerKeyword")?.value || "").trim();
  const status = $("admCustomerStatusFilter")?.value || "";
  if (keyword) q.set("keyword", keyword);
  if (status) q.set("status", status);
  return q;
}

function renderAdmCustomers(items){
  const box = $("admCustomersBox");
  if (!box) return;
  box.innerHTML = items.length ? `
    <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>ID</th><th>Người mua</th><th>Liên hệ</th><th>Đơn</th><th>Tổng chi</th><th>Trạng thái</th></tr></thead><tbody>
      ${items.map(c => `
        <tr data-pick-adm-customer="${c.id}" class="${String(state.admSelectedCustomerId) === String(c.id) ? "is-active" : ""}">
          <td>${c.id}</td>
          <td><b>${adminEsc(c.name || "")}</b><div class="smallText">${adminEsc(c.email || "")}</div></td>
          <td>${adminEsc(c.phone || "")}</td>
          <td>${c.ordersCount || 0}<div class="smallText">${c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleString() : "Chưa có đơn"}</div></td>
          <td>${adminMoney(c.totalSpent || 0)}</td>
          <td>${adminUserBadge(c.status || "ACTIVE")}</td>
        </tr>`).join("")}
    </tbody></table></div>` : `<div class="smallText">Không có người mua.</div>`;

  box.querySelectorAll("[data-pick-adm-customer]").forEach(tr => {
    tr.onclick = async () => {
      setSelectedAdmCustomer(tr.getAttribute("data-pick-adm-customer"));
      await loadAdmCustomerDetail();
    };
  });
  syncAdminActionStates();
}

async function loadAdmCustomers(reset=false){
  if (!canUseAdmin()) return;
  if (reset) state.admCustomersPage = 1;
  dangTai(true, "Đang tải người mua…");
  try{
    const r = await api(`/api/admin/customers?${buildAdmCustomersQuery().toString()}`);
    state.admCustomersTotal = Number(r.total || 0);
    state.admCustomersView = r.items || [];
    renderAdmCustomers(state.admCustomersView);
    setAdminPageLabel("admCustomersPageLabel", state.admCustomersPage, state.admCustomersTotal, state.admCustomersPageSize, state.admCustomersView.length);
    bindAdminPager("admBtnPrevCustomers", "admBtnNextCustomers", state.admCustomersPage, state.admCustomersTotal, state.admCustomersPageSize);
    markSelectedRows("data-pick-adm-customer", state.admSelectedCustomerId);
  }catch(e){ thongbao("bad","Người mua", e.message); }
  finally{ syncAdminActionStates(); dangTai(false); }
}

async function loadAdmCustomerDetail(){
  const id = Number($("admCustomerId")?.value || state.admSelectedCustomerId || 0);
  if (!id) return thongbao("warn","Thiếu customerId","Hãy chọn một người mua.");
  setSelectedAdmCustomer(id);
  dangTai(true, "Đang tải chi tiết người mua…");
  try{
    const c = await api(`/api/admin/customers/${id}`);
    state.admCurrentCustomer = c;
    setSelectedAdmCustomer(c.id || id);
    if ($("admCustomerNextStatus")) $("admCustomerNextStatus").value = c.status || "";
    const addresses = (c.addresses || []).map(a => `<li>[${a.id}] ${adminEsc(a.detail || "")}, ${adminEsc(a.ward || "")}, ${adminEsc(a.district || "")}, ${adminEsc(a.city || "")}</li>`).join("");
    const recent = (c.recentOrders || []).map(o => `<tr><td>${adminEsc(o.order_code)}</td><td>${new Date(o.created_at).toLocaleString()}</td><td>${customerOrderBadge(o.status)}</td><td>${customerPaymentBadge(o.payment_status)}</td><td class="right">${adminMoney(o.grand_total)}</td></tr>`).join("");
    $("admCustomerDetailBox").innerHTML = `
      <div class="adminDetailCard">
        <div class="adminDetailTop"><div><div class="adminDetailTitle">${adminEsc(c.name || "")}</div><div class="smallText">${adminEsc(c.email || "")} • ${adminEsc(c.phone || "")}</div></div><div>${adminUserBadge(c.status || "ACTIVE")}</div></div>
        <div class="adminStatsRow"><div><b>Tổng chi:</b> ${adminMoney(c.totalSpent || 0)}</div><div><b>Số đơn:</b> ${c.ordersCount || 0}</div></div>
        <div class="adminSubTitle">Địa chỉ</div>
        <ul class="adminList">${addresses || `<li>Chưa có địa chỉ</li>`}</ul>
        <div class="adminSubTitle">10 đơn gần nhất</div>
        <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Mã đơn</th><th>Thời gian</th><th>Trạng thái</th><th>Thanh toán</th><th class="right">Tổng</th></tr></thead><tbody>${recent || `<tr><td colspan="5">Chưa có đơn</td></tr>`}</tbody></table></div>
      </div>`;
  }catch(e){ thongbao("bad","Chi tiết người mua", e.message); }
  finally{ dangTai(false); }
}

async function updateAdmCustomerStatus(){
  const id = Number($("admCustomerId")?.value || 0);
  const status = $("admCustomerNextStatus")?.value || "";
  if (!id || !status) return thongbao("warn","Thiếu dữ liệu","Chọn người mua và trạng thái.");
  dangTai(true, "Đang cập nhật người mua…");
  try{
    await api(`/api/admin/customers/${id}/status`, { method:"PUT", body:{ status } });
    thongbao("ok","Đã cập nhật người mua", `${id} → ${status}`);
    admLog("Customer updated", { id, status });
    await loadAdmCustomers(false);
    await loadAdmCustomerDetail();
  }catch(e){ thongbao("bad","Cập nhật người mua", e.message); }
  finally{ dangTai(false); }
}

function buildAdmInventoryQuery(){
  state.admInventoryPageSize = Number($("admInventoryPageSize")?.value || 10);
  const q = new URLSearchParams({ page: String(state.admInventoryPage), pageSize: String(state.admInventoryPageSize) });
  const keyword = ($("admInventoryKeyword")?.value || "").trim();
  const status = $("admInventoryStatus")?.value || "";
  const low = ($("admInventoryLowStock")?.value || "").trim();
  if (keyword) q.set("keyword", keyword);
  if (status) q.set("status", status);
  if (low !== "") q.set("lowStockBelow", low);
  return q;
}

function renderAdmInventory(items){
  const box = $("admInventoryBox");
  if (!box) return;
  box.innerHTML = items.length ? `
    <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>ID</th><th>SKU</th><th>Sản phẩm</th><th class="right">Giá bán</th><th class="right">Tồn</th><th>Trạng thái</th></tr></thead><tbody>
      ${items.map(p => `
        <tr data-pick-adm-product="${p.id}" class="${String(state.admSelectedProductId) === String(p.id) ? "is-active" : ""}">
          <td>${p.id}</td>
          <td>${adminEsc(p.sku || "")}</td>
          <td><b>${adminEsc(p.name || "")}</b><div class="smallText">${adminEsc(p.brand || "")}</div></td>
          <td class="right">${adminMoney(p.discountPrice || p.price || 0)}</td>
          <td class="right">${p.quantity}</td>
          <td>${p.status === "ACTIVE" ? customerStatusChip("Đang bán", "ok") : customerStatusChip("Ngừng bán", "bad")}</td>
        </tr>`).join("")}
    </tbody></table></div>` : `<div class="smallText">Không có dữ liệu tồn kho.</div>`;
  box.querySelectorAll("[data-pick-adm-product]").forEach(tr => {
    tr.onclick = () => {
      const id = tr.getAttribute("data-pick-adm-product");
      const item = state.admInventoryView.find(x => String(x.id) === String(id));
      setSelectedAdmProduct(id);
      if (item && $("admInvQty")) $("admInvQty").value = item.quantity;
      syncAdminActionStates();
    };
  });
  syncAdminActionStates();
}

async function loadAdmInventory(reset=false){
  if (!canUseAdmin()) return;
  if (reset) state.admInventoryPage = 1;
  dangTai(true, "Đang tải tồn kho…");
  try{
    const r = await api(`/api/admin/inventory?${buildAdmInventoryQuery().toString()}`);
    state.admInventoryTotal = Number(r.total || 0);
    state.admInventoryView = r.items || [];
    renderAdmInventory(state.admInventoryView);
    setAdminPageLabel("admInventoryPageLabel", state.admInventoryPage, state.admInventoryTotal, state.admInventoryPageSize, state.admInventoryView.length);
    bindAdminPager("admBtnPrevInventory", "admBtnNextInventory", state.admInventoryPage, state.admInventoryTotal, state.admInventoryPageSize);
    markSelectedRows("data-pick-adm-product", state.admSelectedProductId);
  }catch(e){ thongbao("bad","Tồn kho", e.message); }
  finally{ syncAdminActionStates(); dangTai(false); }
}

async function updateAdmInventory(){
  const productId = Number($("admInvProductId")?.value || 0);
  const quantity = Number($("admInvQty")?.value);
  if (!productId || Number.isNaN(quantity) || !Number.isInteger(quantity) || quantity < 0) return thongbao("warn","Dữ liệu kho","Nhập productId và số lượng nguyên ≥ 0.");
  dangTai(true, "Đang cập nhật tồn kho…");
  try{
    const r = await api(`/api/admin/inventory/${productId}`, { method:"PUT", body:{ quantity } });
    if ($("admInvBox")) $("admInvBox").textContent = `Đã cập nhật product ${productId}: ${r.oldQty} → ${r.newQty}`;
    thongbao("ok","Đã cập nhật tồn kho", `Product ${productId}: ${r.oldQty} → ${r.newQty}`);
    await loadAdmInventory(false);
  }catch(e){ thongbao("bad","Cập nhật tồn kho", e.message); }
  finally{ dangTai(false); }
}

async function adjustAdmInventory(){
  const productId = Number($("admInvProductId")?.value || 0);
  const delta = Number($("admInvDelta")?.value);
  const note = ($("admInvAdjustNote")?.value || "").trim();
  if (!productId || !Number.isInteger(delta) || delta === 0) return thongbao("warn","Dữ liệu kho","Nhập delta nguyên khác 0.");
  if (delta < 0 && !note) return thongbao("warn","Dữ liệu kho","Khi trừ kho hãy nhập ghi chú.");
  dangTai(true, "Đang điều chỉnh tồn kho…");
  try{
    const r = await api(`/api/admin/inventory/${productId}/adjust`, { method:"POST", body:{ delta, note } });
    if ($("admInvBox")) $("admInvBox").textContent = `Đã điều chỉnh product ${productId}: ${r.oldQty} ${delta > 0 ? '+' : ''}${r.delta} = ${r.newQty}`;
    thongbao("ok","Đã điều chỉnh tồn kho", `Product ${productId}: ${r.oldQty} → ${r.newQty}`);
    await loadAdmInventory(false);
  }catch(e){ thongbao("bad","Điều chỉnh tồn kho", e.message); }
  finally{ dangTai(false); }
}

async function createAdmProduct(){
  if (!isAdminRole()) return thongbao("warn","Quyền hạn","Chỉ ADMIN mới được tạo sản phẩm.");
  const product = {
    categoryId: Number($("admPCategoryId")?.value || 0),
    name: ($("admPName")?.value || "").trim(),
    sku: ($("admPSku")?.value || "").trim(),
    brand: ($("admPBrand")?.value || "").trim() || undefined,
    price: Number($("admPPrice")?.value || 0),
    discountPrice: ($("admPDiscount")?.value || "").trim() === "" ? undefined : Number($("admPDiscount")?.value || 0),
    description: ($("admPDescription")?.value || "").trim() || undefined,
  };
  const initialStock = ($("admPStock")?.value || "").trim() === "" ? undefined : Number($("admPStock")?.value || 0);
  const img1 = ($("admPImage1")?.value || "").trim();
  if (!product.categoryId || !product.name || !product.sku || !product.price) return thongbao("warn","Tạo sản phẩm","Thiếu categoryId / tên / SKU / giá.");
  if (product.price <= 0) return thongbao("warn","Tạo sản phẩm","Giá phải lớn hơn 0.");
  if (product.discountPrice !== undefined && (!(product.discountPrice >= 0) || product.discountPrice >= product.price)) return thongbao("warn","Tạo sản phẩm","Giá giảm phải nhỏ hơn giá bán.");
  if (initialStock !== undefined && (!Number.isInteger(initialStock) || initialStock < 0)) return thongbao("warn","Tạo sản phẩm","Tồn kho ban đầu phải là số nguyên ≥ 0.");
  if (img1 && !isHttpUrl(img1)) return thongbao("warn","Tạo sản phẩm","Link ảnh phải bắt đầu bằng http:// hoặc https://.");
  dangTai(true, "Đang tạo sản phẩm…");
  try{
    const r = await api(`/api/admin/products`, { method:"POST", body:{ product, initialStock, images: img1 ? [img1] : [] } });
    if ($("admProdBox")) $("admProdBox").textContent = `Đã tạo sản phẩm #${r.productId || "?"}`;
    ["admPName","admPSku","admPBrand","admPPrice","admPDiscount","admPStock","admPImage1","admPDescription"].forEach(id => { if ($(id)) $(id).value = ""; });
    thongbao("ok","Đã tạo sản phẩm", product.name);
    admLog("Product created", r);
    syncAdminActionStates();
  }catch(e){ thongbao("bad","Tạo sản phẩm", e.message); }
  finally{ dangTai(false); }
}

async function deactivateAdmProduct(){
  if (!isAdminRole()) return thongbao("warn","Quyền hạn","Chỉ ADMIN mới được ngừng bán sản phẩm.");
  const id = Number($("admPDeactivateId")?.value || 0);
  if (!id) return thongbao("warn","Ngừng bán","Nhập productId.");
  dangTai(true, "Đang ngừng bán sản phẩm…");
  try{
    await api(`/api/admin/products/${id}`, { method:"DELETE" });
    if ($("admProdBox")) $("admProdBox").textContent = `Đã ngừng bán sản phẩm #${id}`;
    thongbao("ok","Đã ngừng bán", `Product #${id}`);
    admLog("Product deactivated", { id });
  }catch(e){ thongbao("bad","Ngừng bán sản phẩm", e.message); }
  finally{ dangTai(false); }
}

function buildAdmCouponsQuery(){
  state.admCouponsPageSize = Number($("admCouponsPageSize")?.value || 10);
  const q = new URLSearchParams({ page: String(state.admCouponsPage), pageSize: String(state.admCouponsPageSize) });
  const isActive = $("admCouponActive")?.value || "";
  if (isActive !== "") q.set("isActive", isActive);
  return q;
}

function renderAdmCoupons(items){
  const box = $("admCouponsBox");
  if (!box) return;
  box.innerHTML = items.length ? `
    <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>ID</th><th>Mã</th><th>Loại</th><th>Giá trị</th><th>Hiệu lực</th><th>Dùng</th><th>Trạng thái</th></tr></thead><tbody>
      ${items.map(c => `
        <tr data-pick-adm-coupon="${c.id}" class="${String(state.admSelectedCouponId) === String(c.id) ? "is-active" : ""}">
          <td>${c.id}</td>
          <td><b>${adminEsc(c.code)}</b></td>
          <td>${adminEsc(c.type)}</td>
          <td>${adminEsc(c.value)}</td>
          <td><div class="smallText">${adminEsc(c.start_at || "")}</div><div class="smallText">${adminEsc(c.end_at || "")}</div></td>
          <td>${c.used_count || 0}/${c.usage_limit || 0}</td>
          <td>${c.is_active ? customerStatusChip("Đang bật", "ok") : customerStatusChip("Đã tắt", "bad")}</td>
        </tr>`).join("")}
    </tbody></table></div>` : `<div class="smallText">Không có coupon.</div>`;
  box.querySelectorAll("[data-pick-adm-coupon]").forEach(tr => {
    tr.onclick = () => {
      const id = tr.getAttribute("data-pick-adm-coupon");
      setSelectedAdmCoupon(id);
      const row = state.admCouponsView.find(x => String(x.id) === String(id));
      if (row && $("admCUpdValue")) $("admCUpdValue").value = row.value;
      if (row && $("admCUpdActive")) $("admCUpdActive").value = String(!!row.is_active);
      syncAdminActionStates();
    };
  });
  syncAdminActionStates();
}

async function loadAdmCoupons(reset=false){
  if (!isAdminRole()) return;
  if (reset) state.admCouponsPage = 1;
  dangTai(true, "Đang tải coupon…");
  try{
    const r = await api(`/api/admin/coupons?${buildAdmCouponsQuery().toString()}`);
    state.admCouponsTotal = Number(r.total || 0);
    state.admCouponsView = r.items || [];
    renderAdmCoupons(state.admCouponsView);
    setAdminPageLabel("admCouponsPageLabel", state.admCouponsPage, state.admCouponsTotal, state.admCouponsPageSize, state.admCouponsView.length);
    bindAdminPager("admBtnPrevCoupons", "admBtnNextCoupons", state.admCouponsPage, state.admCouponsTotal, state.admCouponsPageSize);
    markSelectedRows("data-pick-adm-coupon", state.admSelectedCouponId);
  }catch(e){ thongbao("bad","Coupon", e.message); }
  finally{ syncAdminActionStates(); dangTai(false); }
}

async function createAdmCoupon(){
  if (!isAdminRole()) return thongbao("warn","Quyền hạn","Chỉ ADMIN mới được tạo coupon.");
  const body = {
    code: ($("admCCode")?.value || "").trim(),
    type: $("admCType")?.value || "PERCENT",
    value: Number($("admCValue")?.value || 0),
    minOrder: ($("admCMinOrder")?.value || "").trim() === "" ? undefined : Number($("admCMinOrder")?.value || 0),
    maxDiscount: ($("admCMaxDiscount")?.value || "").trim() === "" ? null : Number($("admCMaxDiscount")?.value || 0),
    startAt: ($("admCStartAt")?.value || "").trim(),
    endAt: ($("admCEndAt")?.value || "").trim(),
    usageLimit: ($("admCUsageLimit")?.value || "").trim() === "" ? undefined : Number($("admCUsageLimit")?.value || 0),
    isActive: ($("admCIsActive")?.value || "1") === "1",
  };
  if (!body.code || !body.value || !body.startAt || !body.endAt) return thongbao("warn","Tạo coupon","Thiếu code / value / startAt / endAt.");
  if (body.value <= 0) return thongbao("warn","Tạo coupon","Giá trị coupon phải lớn hơn 0.");
  if (body.type === "PERCENT" && body.value > 100) return thongbao("warn","Tạo coupon","Coupon phần trăm không thể vượt quá 100.");
  const startDate = parseDateLoose(body.startAt);
  const endDate = parseDateLoose(body.endAt);
  if (!startDate || !endDate || startDate >= endDate) return thongbao("warn","Tạo coupon","Khoảng thời gian hiệu lực không hợp lệ.");
  dangTai(true, "Đang tạo coupon…");
  try{
    await api(`/api/admin/coupons`, { method:"POST", body });
    thongbao("ok","Đã tạo coupon", body.code);
    ["admCCode","admCValue","admCMinOrder","admCMaxDiscount","admCStartAt","admCEndAt","admCUsageLimit"].forEach(id => { if ($(id)) $(id).value = ""; });
    admLog("Coupon created", body);
    await loadAdmCoupons(true);
  }catch(e){ thongbao("bad","Tạo coupon", e.message); }
  finally{ dangTai(false); }
}

async function updateAdmCoupon(){
  const id = Number($("admCUpdId")?.value || 0);
  if (!id) return thongbao("warn","Cập nhật coupon","Nhập couponId.");
  const body = {};
  const valueRaw = ($("admCUpdValue")?.value || "").trim();
  const activeRaw = $("admCUpdActive")?.value || "";
  if (valueRaw !== "") {
    body.value = Number(valueRaw);
    if (!(body.value > 0)) return thongbao("warn","Cập nhật coupon","Giá trị mới phải lớn hơn 0.");
  }
  if (activeRaw !== "") body.isActive = activeRaw === "true";
  if (!Object.keys(body).length) return thongbao("warn","Cập nhật coupon","Chưa có trường nào để cập nhật.");
  dangTai(true, "Đang cập nhật coupon…");
  try{
    await api(`/api/admin/coupons/${id}`, { method:"PUT", body });
    thongbao("ok","Đã cập nhật coupon", `#${id}`);
    admLog("Coupon updated", { id, body });
    await loadAdmCoupons(false);
    syncAdminActionStates();
  }catch(e){ thongbao("bad","Cập nhật coupon", e.message); }
  finally{ dangTai(false); }
}

async function deactivateAdmCoupon(){
  const id = Number($("admCUpdId")?.value || 0);
  if (!id) return thongbao("warn","Tắt coupon","Nhập couponId.");
  dangTai(true, "Đang tắt coupon…");
  try{
    await api(`/api/admin/coupons/${id}`, { method:"DELETE" });
    thongbao("ok","Đã tắt coupon", `#${id}`);
    admLog("Coupon deactivated", { id });
    if ($("admCUpdActive")) $("admCUpdActive").value = "false";
    await loadAdmCoupons(false);
  }catch(e){ thongbao("bad","Tắt coupon", e.message); }
  finally{ dangTai(false); }
}

async function loadAdmReport(){
  if (!isAdminRole()) return;
  const from = ($("admRFrom")?.value || "").trim();
  const to = ($("admRTo")?.value || "").trim();
  const groupBy = $("admRGroup")?.value || "day";
  if (!from || !to) return thongbao("warn","Báo cáo doanh thu","Nhập from/to.");
  const fromDate = parseDateLoose(from);
  const toDate = parseDateLoose(to);
  if (!fromDate || !toDate || fromDate > toDate) return thongbao("warn","Báo cáo doanh thu","Khoảng thời gian không hợp lệ.");
  dangTai(true, "Đang tải báo cáo…");
  try{
    const r = await api(`/api/admin/reports/revenue?${new URLSearchParams({ from, to, groupBy }).toString()}`);
    state.admReportPayload = r;
    const seriesRows = (r.series || []).map(x => `<tr><td>${adminEsc(x.label || x.bucket || "")}</td><td class="right">${adminMoney(x.revenue || 0)}</td><td class="right">${x.orders || 0}</td></tr>`).join("");
    const byPay = (r.byPaymentMethod || []).map(x => `<li>${adminEsc(x.payment_method || "")}: <b>${adminMoney(x.revenue || 0)}</b> • ${x.orders || 0} đơn</li>`).join("");
    const top = (r.topProducts || []).map(x => `<li>${adminEsc(x.name || "")}: <b>${x.qty || 0}</b> sản phẩm • ${adminMoney(x.revenue || 0)}</li>`).join("");
    $("admReportBox").innerHTML = `
      <div class="adminStatsRow">
        <div class="metricCard"><div class="metricCard__label">Tổng doanh thu</div><div class="metricCard__value">${adminMoney(r.totalRevenue || 0)}</div></div>
        <div class="metricCard"><div class="metricCard__label">Tổng đơn</div><div class="metricCard__value">${r.totalOrders || 0}</div></div>
        <div class="metricCard"><div class="metricCard__label">AOV</div><div class="metricCard__value">${adminMoney(r.avgOrderValue || 0)}</div></div>
      </div>
      <div class="adminSplit">
        <div>
          <div class="adminSubTitle">Chuỗi doanh thu</div>
          <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Mốc</th><th class="right">Doanh thu</th><th class="right">Đơn</th></tr></thead><tbody>${seriesRows || `<tr><td colspan="3">Không có dữ liệu</td></tr>`}</tbody></table></div>
        </div>
        <div>
          <div class="adminSubTitle">Theo phương thức thanh toán</div>
          <ul class="adminList">${byPay || `<li>Không có dữ liệu</li>`}</ul>
          <div class="adminSubTitle">Top sản phẩm</div>
          <ul class="adminList">${top || `<li>Không có dữ liệu</li>`}</ul>
        </div>
      </div>`;
  }catch(e){ thongbao("bad","Báo cáo doanh thu", e.message); }
  finally{ dangTai(false); }
}

function buildAdmAuditQuery(){
  state.admAuditPageSize = Number($("admAuditPageSize")?.value || 10);
  const q = new URLSearchParams({ page: String(state.admAuditPage), pageSize: String(state.admAuditPageSize) });
  const actorId = ($("admAActor")?.value || "").trim();
  const action = ($("admAAction")?.value || "").trim();
  const from = ($("admAFrom")?.value || "").trim();
  const to = ($("admATo")?.value || "").trim();
  if (actorId) q.set("actorId", actorId);
  if (action) q.set("action", action);
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return q;
}

function renderAdmAudit(items){
  const box = $("admAuditBox");
  if (!box) return;
  box.innerHTML = items.length ? `
    <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Thời gian</th><th>Actor</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead><tbody>
      ${items.map(a => `
        <tr>
          <td>${new Date(a.created_at).toLocaleString()}</td>
          <td>${adminEsc(a.actorName || a.actor_id || "")}</td>
          <td>${adminEsc(a.action || "")}</td>
          <td>${adminEsc(a.target_type || "")} #${adminEsc(a.target_id || "")}</td>
          <td><pre class="codeLite">${adminEsc(typeof a.metadata === "string" ? a.metadata : JSON.stringify(a.metadata || {}, null, 2))}</pre></td>
        </tr>`).join("")}
    </tbody></table></div>` : `<div class="smallText">Không có nhật ký thao tác.</div>`;
}

async function loadAdmAudit(reset=false){
  if (!isAdminRole()) return;
  if (reset) state.admAuditPage = 1;
  dangTai(true, "Đang tải audit log…");
  try{
    const r = await api(`/api/admin/audit-logs?${buildAdmAuditQuery().toString()}`);
    state.admAuditTotal = Number(r.total || 0);
    state.admAuditView = r.items || [];
    renderAdmAudit(state.admAuditView);
    setAdminPageLabel("admAuditPageLabel", state.admAuditPage, state.admAuditTotal, state.admAuditPageSize, state.admAuditView.length);
    bindAdminPager("admBtnPrevAudit", "admBtnNextAudit", state.admAuditPage, state.admAuditTotal, state.admAuditPageSize);
  }catch(e){ thongbao("bad","Audit log", e.message); }
  finally{ dangTai(false); }
}

async function loadAdminBootstrap(force=false){
  if (!canUseAdmin()) return;

  await loadAdmOrders(force);

  setTimeout(() => loadAdmCustomers(force).catch(() => {}), 50);
  setTimeout(() => loadAdmInventory(force).catch(() => {}), 100);

  if (isAdminRole()) {
    setTimeout(() => loadAdmCoupons(force).catch(() => {}), 150);
    setTimeout(() => loadAdmAudit(force).catch(() => {}), 200);
  }
}

function exportAdmOrders(){
  if (!state.admOrdersView.length) return thongbao("warn","Xuất đơn hàng","Chưa có dữ liệu để xuất.");
  downloadCsv(`orders-${Date.now()}.csv`, state.admOrdersView.map(o => ({ id:o.id, order_code:o.order_code, customer:o.customerName, email:o.customerEmail, grand_total:o.grand_total, status:o.status, payment_status:o.payment_status, payment_method:o.payment_method, created_at:o.created_at })));
}
function exportAdmCoupons(){
  if (!state.admCouponsView.length) return thongbao("warn","Xuất coupon","Chưa có dữ liệu để xuất.");
  downloadCsv(`coupons-${Date.now()}.csv`, state.admCouponsView.map(c => ({ id:c.id, code:c.code, type:c.type, value:c.value, min_order:c.min_order, max_discount:c.max_discount, start_at:c.start_at, end_at:c.end_at, usage_limit:c.usage_limit, used_count:c.used_count, is_active:c.is_active })));
}
function exportAdmReport(){
  if (!state.admReportPayload || !(state.admReportPayload.series || []).length) return thongbao("warn","Xuất báo cáo","Hãy tải báo cáo trước.");
  downloadCsv(`report-${Date.now()}.csv`, (state.admReportPayload.series || []).map(x => ({ bucket:x.label || x.bucket, revenue:x.revenue, orders:x.orders })));
}
function exportAdmAudit(){
  if (!state.admAuditView.length) return thongbao("warn","Xuất audit","Chưa có dữ liệu để xuất.");
  downloadCsv(`audit-${Date.now()}.csv`, state.admAuditView.map(a => ({ created_at:a.created_at, actor:a.actorName || a.actor_id, action:a.action, target_type:a.target_type, target_id:a.target_id, metadata: safeStringify(a.metadata) })));
}

function bindInlineAdminEvents(){
  if ($("btnAdminOpen")) $("btnAdminOpen").onclick = () => $("adminSection")?.scrollIntoView({ behavior:"smooth", block:"start" });
  if ($("admBtnRefresh")) $("admBtnRefresh").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdminBootstrap(false); }); };

  if ($("admBtnOrders")) $("admBtnOrders").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmOrders(true); }); };
  if ($("admBtnPrevOrders")) $("admBtnPrevOrders").onclick = () => { state.admOrdersPage = Math.max(1, state.admOrdersPage - 1); loadAdmOrders(false); };
  if ($("admBtnNextOrders")) $("admBtnNextOrders").onclick = () => { state.admOrdersPage += 1; loadAdmOrders(false); };
  if ($("admBtnOrderDetail")) $("admBtnOrderDetail").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmOrderDetail(); }); };
  if ($("admBtnUpdateStatus")) $("admBtnUpdateStatus").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await updateAdmOrderStatus(); }); };
  if ($("admBtnUpdateOrder")) $("admBtnUpdateOrder").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await updateAdmOrderPatch(); }); };
  if ($("admBtnExportOrders")) $("admBtnExportOrders").onclick = exportAdmOrders;
  if ($("admBtnPendingAll")) $("admBtnPendingAll").onclick = () => { if ($("admFilterStatus")) $("admFilterStatus").value = "NEW"; if ($("admFilterPayStatus")) $("admFilterPayStatus").value = ""; if ($("admFilterPaymentMethod")) $("admFilterPaymentMethod").value = ""; loadAdmOrders(true); };
  if ($("admBtnPendingOnlinePaid")) $("admBtnPendingOnlinePaid").onclick = () => { if ($("admFilterStatus")) $("admFilterStatus").value = "NEW"; if ($("admFilterPayStatus")) $("admFilterPayStatus").value = "PAID"; if ($("admFilterPaymentMethod")) $("admFilterPaymentMethod").value = "ONLINE"; loadAdmOrders(true); };
  if ($("admBtnPendingCOD")) $("admBtnPendingCOD").onclick = () => { if ($("admFilterStatus")) $("admFilterStatus").value = "NEW"; if ($("admFilterPayStatus")) $("admFilterPayStatus").value = "PENDING_PAYMENT"; if ($("admFilterPaymentMethod")) $("admFilterPaymentMethod").value = "COD"; loadAdmOrders(true); };

  if ($("admBtnCustomers")) $("admBtnCustomers").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmCustomers(true); }); };
  if ($("admBtnPrevCustomers")) $("admBtnPrevCustomers").onclick = () => { state.admCustomersPage = Math.max(1, state.admCustomersPage - 1); loadAdmCustomers(false); };
  if ($("admBtnNextCustomers")) $("admBtnNextCustomers").onclick = () => { state.admCustomersPage += 1; loadAdmCustomers(false); };
  if ($("admBtnCustomerDetail")) $("admBtnCustomerDetail").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmCustomerDetail(); }); };
  if ($("admBtnCustomerStatus")) $("admBtnCustomerStatus").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await updateAdmCustomerStatus(); }); };

  if ($("admBtnInventoryList")) $("admBtnInventoryList").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmInventory(true); }); };
  if ($("admBtnPrevInventory")) $("admBtnPrevInventory").onclick = () => { state.admInventoryPage = Math.max(1, state.admInventoryPage - 1); loadAdmInventory(false); };
  if ($("admBtnNextInventory")) $("admBtnNextInventory").onclick = () => { state.admInventoryPage += 1; loadAdmInventory(false); };
  if ($("admBtnInv")) $("admBtnInv").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await updateAdmInventory(); }); };
  if ($("admBtnInvAdjust")) $("admBtnInvAdjust").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await adjustAdmInventory(); }); };

  if ($("admBtnCreateProduct")) $("admBtnCreateProduct").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await createAdmProduct(); }); };
  if ($("admBtnDeactivateProduct")) $("admBtnDeactivateProduct").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await deactivateAdmProduct(); }); };

  if ($("admBtnCoupons")) $("admBtnCoupons").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmCoupons(true); }); };
  if ($("admBtnPrevCoupons")) $("admBtnPrevCoupons").onclick = () => { state.admCouponsPage = Math.max(1, state.admCouponsPage - 1); loadAdmCoupons(false); };
  if ($("admBtnNextCoupons")) $("admBtnNextCoupons").onclick = () => { state.admCouponsPage += 1; loadAdmCoupons(false); };
  if ($("admBtnCreateCoupon")) $("admBtnCreateCoupon").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await createAdmCoupon(); }); };
  if ($("admBtnUpdateCoupon")) $("admBtnUpdateCoupon").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await updateAdmCoupon(); }); };
  if ($("admBtnDeactivateCoupon")) $("admBtnDeactivateCoupon").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await deactivateAdmCoupon(); }); };
  if ($("admBtnExportCoupons")) $("admBtnExportCoupons").onclick = exportAdmCoupons;

  if ($("admBtnReport")) $("admBtnReport").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmReport(); }); };
  if ($("admBtnExportReport")) $("admBtnExportReport").onclick = exportAdmReport;

  if ($("admBtnAudit")) $("admBtnAudit").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await loadAdmAudit(true); }); };
  if ($("admBtnPrevAudit")) $("admBtnPrevAudit").onclick = () => { state.admAuditPage = Math.max(1, state.admAuditPage - 1); loadAdmAudit(false); };
  if ($("admBtnNextAudit")) $("admBtnNextAudit").onclick = () => { state.admAuditPage += 1; loadAdmAudit(false); };
  if ($("admBtnExportAudit")) $("admBtnExportAudit").onclick = exportAdmAudit;

  bindAdminInputEvents();
  syncAdminActionStates();
}

async function registerUser(){
  const name = $("regName")?.value.trim();
  const email = $("regEmail")?.value.trim();
  const phone = $("regPhone")?.value.trim();
  const password = $("regPassword")?.value || "";
  const password2 = $("regPassword2")?.value || "";

  if (!name || !email || !password) return thongbao("warn", "Đăng ký", "Hãy nhập họ tên, email và mật khẩu.");
  if (password.length < 8) return thongbao("warn", "Đăng ký", "Mật khẩu cần ít nhất 8 ký tự.");
  if (password !== password2) return thongbao("warn", "Đăng ký", "Mật khẩu nhập lại chưa khớp.");

  dangTai(true, "Đang tạo tài khoản…");
  try {
    const payload = { name, email, password };
    if (phone) payload.phone = phone;
    const r = await api("/api/auth/register", { method: "POST", auth: false, body: payload });

    if (r?.accessToken) {
      const resolvedRole = normalizeRole(r.role || r.user?.role || "USER");
      if (resolvedRole === "ADMIN") {
      localStorage.setItem("admin_accessToken", r.accessToken || "");
      localStorage.setItem("admin_refreshToken", r.refreshToken || "");
      localStorage.setItem("admin_role", "ADMIN");

      localStorage.setItem("auth_accessToken", r.accessToken || "");
      localStorage.setItem("auth_refreshToken", r.refreshToken || "");
      localStorage.setItem("auth_role", "ADMIN");
    } else {
      storage.access = r.accessToken;
      storage.refresh = r.refreshToken;
      storage.role = resolvedRole || "USER";
    }
      dongModal("registerModal");
      setAuthUI();
      applyInlineRoleUI();
      thongbao("ok", "Đăng ký thành công", roleLabel(resolvedRole || "USER"));
      await loadCart();
      await loadAddresses();
      await loadMyOrders();
    } else {
      thongbao("ok", "Đăng ký thành công", "Bạn có thể đăng nhập bằng tài khoản vừa tạo.");
      if ($("email")) $("email").value = email;
      if ($("password")) $("password").value = password;
      dongModal("registerModal");
      moModal("loginModal");
    }
  } catch (e) {
    thongbao("bad", "Đăng ký thất bại", e.message);
  } finally {
    dangTai(false);
  }
}

/* =========================
   Events
========================= */
if ($("btnBrowse")) {
  $("btnBrowse").onclick = () => {
    const layout = document.querySelector(".layout");
    if (!layout) return;
    window.scrollTo({ top: layout.offsetTop - 70, behavior:"smooth" });
  };
}

if ($("btnDeals")) $("btnDeals").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { $("q").value = "snack"; state.page = 1; await loadProducts(); }); };
if ($("btnSearch")) $("btnSearch").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { state.page = 1; await loadProducts(); }); };
if ($("q")) {
  $("q").addEventListener("keydown", (e)=>{ if(e.key === "Enter"){ state.page = 1; loadProducts(); } });
  $("q").addEventListener("input", debounce(() => {
    state.page = 1;
    loadProducts();
  }, 400));
}

if ($("btnApply")) $("btnApply").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { state.page = 1; await loadProducts(); }); };
if ($("btnReset")) {
  $("btnReset").onclick = () => {
    if ($("brand")) $("brand").value = "";
    if ($("minPrice")) $("minPrice").value = "";
    if ($("maxPrice")) $("maxPrice").value = "";
    if ($("sort")) $("sort").value = "newest";
    if ($("pageSize")) $("pageSize").value = "24";
    state.categoryId = "";
    state.page = 1;
    renderCategories();
    loadProducts();
  };
}

if ($("btnPrev")) $("btnPrev").onclick = () => { state.page = Math.max(1, state.page - 1); loadProducts(); };
if ($("btnNext")) $("btnNext").onclick = () => { state.page = Math.min(tongTrang(), state.page + 1); loadProducts(); };
if ($("btnPrev2")) $("btnPrev2").onclick = $("btnPrev")?.onclick;
if ($("btnNext2")) $("btnNext2").onclick = $("btnNext")?.onclick;

if ($("btnLoginOpen")) $("btnLoginOpen").onclick = () => moModal("loginModal");
if ($("btnLoginClose")) $("btnLoginClose").onclick = () => dongModal("loginModal");
if ($("btnOpenRegister")) $("btnOpenRegister").onclick = () => { dongModal("loginModal"); moModal("registerModal"); };
if ($("btnRegisterClose")) $("btnRegisterClose").onclick = () => dongModal("registerModal");
if ($("btnRegister")) $("btnRegister").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await registerUser(); }); };
if ($("loginModal")) $("loginModal").addEventListener("click", (e)=>{ if(e.target.id === "loginModal") dongModal("loginModal"); });
if ($("registerModal")) $("registerModal").addEventListener("click", (e)=>{ if(e.target.id === "registerModal") dongModal("registerModal"); });

if ($("btnLogin")) {
  $("btnLogin").onclick = async (e) => {
    await runWithButtonLock(e.currentTarget, async () => {
      const email = $("email")?.value.trim();
      const password = $("password")?.value;
      dangTai(true, "Đang đăng nhập…");
      try{
        const r = await api("/api/auth/login", { method:"POST", auth:false, body:{ email, password } });
        const resolvedRole = normalizeRole(r.role || r.user?.role || "USER");

        if (resolvedRole === "ADMIN") {
          localStorage.removeItem("user_accessToken");
          localStorage.removeItem("user_refreshToken");
          localStorage.removeItem("user_role");

          localStorage.setItem("admin_accessToken", r.accessToken || "");
          localStorage.setItem("admin_refreshToken", r.refreshToken || "");
          localStorage.setItem("admin_role", "ADMIN");

          localStorage.setItem("auth_accessToken", r.accessToken || "");
          localStorage.setItem("auth_refreshToken", r.refreshToken || "");
          localStorage.setItem("auth_role", "ADMIN");
        } else {
          storage.access = r.accessToken || "";
          storage.refresh = r.refreshToken || "";
          storage.role = resolvedRole || "USER";

          localStorage.setItem("auth_accessToken", storage.access);
          localStorage.setItem("auth_refreshToken", storage.refresh);
          localStorage.setItem("auth_role", storage.role);
        }
        setAuthUI();
        applyInlineRoleUI();
        dongModal("loginModal");
        thongbao("ok","Đăng nhập thành công", roleLabel(resolvedRole || "USER"));
        if (resolvedRole === "ADMIN") {
          window.location.href = "./admin.html";
          return;
        }
        clearAdminViews();
        await loadCart();
        await loadAddresses();
        await loadMyOrders();
      }catch(e){
        thongbao("bad","Đăng nhập thất bại", e.message);
      }finally{
        dangTai(false);
      }
    });
  };
}

if ($("btnLogout")) {
  $("btnLogout").onclick = () => {
    clearUserSessionEverywhere();
    setAuthUI();
    applyInlineRoleUI();
    clearCustomerViews();
    clearAdminViews();
    thongbao("warn","Đã đăng xuất","");
  };
}

if ($("btnOrdersOpen")) {
  $("btnOrdersOpen").onclick = async () => {
    if(!storage.access) return moModal("loginModal");
    if (!isUserRole()) return;

    moModal("myOrdersModal");
    if ($("myOrdersList")) {
      $("myOrdersList").innerHTML = `<div style="color:var(--muted)">Đang tải đơn hàng...</div>`;
    }

    try {
      await loadMyOrders();
    } catch (e) {
      thongbao("bad", "Đơn hàng", e.message || "Không tải được đơn hàng");
    }
  };
}
if ($("btnMyOrdersClose")) $("btnMyOrdersClose").onclick = () => dongModal("myOrdersModal");
if ($("btnMyOrdersRefresh")) $("btnMyOrdersRefresh").onclick = () => loadMyOrders();

if ($("btnAddrOpen")) {
  $("btnAddrOpen").onclick = () => {
    openAddressModal(false);
  };
}
if ($("btnAddrClose")) $("btnAddrClose").onclick = () => dongModal("addrModal");
if ($("btnAddrRefresh")) $("btnAddrRefresh").onclick = () => loadAddresses(true);
if ($("btnAddrSave")) $("btnAddrSave").onclick = () => saveAddress();

if ($("btnCartOpen")) {
  $("btnCartOpen").onclick = async () => {
    if(!storage.access) return moModal("loginModal");

    moDrawer();
    if ($("cartItems")) {
      $("cartItems").innerHTML = `<div style="color:var(--muted)">Đang tải giỏ hàng...</div>`;
    }

    try {
      await loadCart();
    } catch (e) {
      thongbao("bad", "Giỏ hàng", e.message || "Không tải được giỏ hàng");
    }
  };
}
if ($("btnCartClose")) $("btnCartClose").onclick = dongDrawer;
if ($("drawerMask")) $("drawerMask").onclick = dongDrawer;

if ($("btnCheckoutOpen")) {
  $("btnCheckoutOpen").onclick = async () => {
    if(!storage.access) return moModal("loginModal");

    dongDrawer();
    moModal("checkoutModal");
    togglePaymentDemo();

    if ($("addressSelect")) {
      $("addressSelect").innerHTML = `<option value="">Đang tải địa chỉ...</option>`;
    }

    prefillCheckoutForm();

    try {
      await loadAddresses();
      prefillCheckoutForm();
    } catch (e) {
      thongbao("bad", "Địa chỉ", e.message || "Không tải được địa chỉ");
    }
  };
}
if ($("btnCheckoutClose")) $("btnCheckoutClose").onclick = () => dongModal("checkoutModal");

if ($("btnCreateOrder")) $("btnCreateOrder").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await placeOrder(); }); };
if ($("btnCreatePayment")) $("btnCreatePayment").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await createPayment(); }); };
if ($("btnPayStatus")) $("btnPayStatus").onclick = async (e) => { await runWithButtonLock(e.currentTarget, async () => { await checkPayment(); }); };
if ($("paymentMethod")) $("paymentMethod").addEventListener("change", togglePaymentDemo);

if ($("btnPvClose")) $("btnPvClose").onclick = () => dongModal("pvModal");
if ($("pvModal")) $("pvModal").addEventListener("click", (e)=>{ if(e.target.id === "pvModal") dongModal("pvModal"); });

const promoMilk = $("promoMilk");
const promoSnack = $("promoSnack");
const promoRice = $("promoRice");
if (promoMilk) promoMilk.onclick = () => { if ($("q")) $("q").value = "sữa"; state.page = 1; loadProducts(); };
if (promoSnack) promoSnack.onclick = () => { if ($("q")) $("q").value = "snack"; state.page = 1; loadProducts(); };
if (promoRice) promoRice.onclick = () => { if ($("q")) $("q").value = "gạo"; state.page = 1; loadProducts(); };

const btnClearRecent = $("btnClearRecent");
if (btnClearRecent) btnClearRecent.onclick = clearRecent;

/* =========================
   Boot
========================= */
async function boot(){
  hydrateUserStorageFromFallback();

  if (storage.access && !normalizeRole(storage.role)) {
    storage.role = "USER";
  }
  setAuthUI();
  applyInlineRoleUI();
  bindInlineAdminEvents();
  bindAdminInputEvents();
  syncAdminActionStates();
  await loadCategories();
  await loadProducts();
  togglePaymentDemo();
  renderRecent();
  if (storage.access && normalizeRole(storage.role) === "ADMIN") {
    window.location.href = "./admin.html";
    return;
  }
  if (storage.access){
    await Promise.allSettled([
      loadCart(),
      loadAddresses(),
      loadMyOrders()
    ]);
    prefillCheckoutForm();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

