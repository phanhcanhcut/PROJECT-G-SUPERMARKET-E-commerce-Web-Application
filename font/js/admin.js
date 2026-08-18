import { createApi } from './api.js';
import { makeStorage } from './storage.js';
import {
  clearAllAuthSessions,
  getActiveSession,
  normalizeRole,
  redirectByRole,
  saveAuthSession,
  syncStorageWithActive,
} from './auth-session.js';
import { API_BASE } from './config.js';

const CONFIG = {
  authPath: '/api/auth',
  adminPath: '/api/admin',
};

const adminStorage = makeStorage('admin');
syncStorageWithActive(adminStorage, 'admin');
const api = createApi(adminStorage);

const $ = (id) => document.getElementById(id);
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  auth: {
    accessToken: '',
    refreshToken: '',
    role: '',
    me: null,
  },
  orders: { page: 1, pageSize: 10, total: 0, items: [] },
  customers: { page: 1, pageSize: 10, total: 0, items: [] },
  inventory: { page: 1, pageSize: 10, total: 0, items: [] },
  coupons: { page: 1, pageSize: 10, total: 0, items: [] },
  audit: { page: 1, pageSize: 10, total: 0, items: [] },
  reports: null,
};

function syncAuthState() {
  const active = getActiveSession();
  state.auth.accessToken = adminStorage.access || active?.accessToken || '';
  state.auth.refreshToken = adminStorage.refresh || active?.refreshToken || '';
  state.auth.role = normalizeRole(active?.role || adminStorage.role || '');
  return active;
}

syncAuthState();

function clearTokens() {
  state.auth.me = null;
  clearAllAuthSessions();
  syncAuthState();
}

async function request(path, options = {}) {
  const next = { ...options };
  if (typeof next.body === 'string') {
    try {
      next.body = JSON.parse(next.body);
    } catch {
      // giữ nguyên nếu body không phải JSON string
    }
  }

  try {
    const data = await api(path, next);
    syncAuthState();
    return data;
  } catch (error) {
    syncAuthState();
    throw error;
  }
}


function buildQuery(input) {
  const params = new URLSearchParams();

  Object.entries(input || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return;
      params.set(key, trimmed);
      return;
    }
    params.set(key, String(value));
  });

  return params;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('vi-VN').format(n);
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `${new Intl.NumberFormat('vi-VN').format(n)} đ`;
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return String(value);
  }
}

function toCsv(rows) {
  if (!rows?.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((key) => {
          const raw = row[key] ?? '';
          const value = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(',')
    );
  }
  return lines.join('\n');
}

function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  if (!csv) {
    log('Không có dữ liệu để xuất CSV.');
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function log(message, type = 'info') {
  const box = $('log');
  if (!box) return;
  const time = new Date().toLocaleTimeString('vi-VN');
  const prefix = type === 'error' ? '[LỖI]' : type === 'success' ? '[OK]' : '[INFO]';
  box.textContent = `${time} ${prefix} ${message}\n${box.textContent}`.trim();
}

function setAuthUI(isLoggedIn) {
  const authPill = $('authPill');
  const btnLogout = $('btnLogout');
  const btnUserMenu = $('btnUserMenu');
  if (!authPill || !btnLogout || !btnUserMenu) return;

  if (isLoggedIn) {
    authPill.className = 'status-pill';
    authPill.innerHTML = `<span class="dot"></span> ${escapeHtml(state.auth.role || 'Đã đăng nhập')}`;
    btnLogout.style.display = 'inline-flex';
    btnUserMenu.textContent = state.auth.me?.name || 'Tài khoản';
  } else {
    authPill.className = 'status-pill status-pill--danger';
    authPill.innerHTML = '<span class="dot"></span> Chưa đăng nhập';
    btnLogout.style.display = 'none';
    btnUserMenu.textContent = 'Người dùng';
  }
}

async function login() {
  const email = $('email')?.value.trim();
  const password = $('password')?.value.trim();
  if (!email || !password) {
    alert('Nhập email và mật khẩu');
    return;
  }

  try {
    const data = await request(`${CONFIG.authPath}/login`, {
      method: 'POST',
      auth: false,
      body: { email, password },
    });

    const role = normalizeRole(data.role || '');
    if (role !== 'ADMIN') {
      alert('Tài khoản này không có quyền truy cập trang quản trị.');
      return;
    }

    saveAuthSession({
      role,
      accessToken: data.accessToken || '',
      refreshToken: data.refreshToken || '',
    });
    syncStorageWithActive(adminStorage, 'admin');
    syncAuthState();

    await fetchMe();
    setAuthUI(true);
    hideUserMenu();
    log('Đăng nhập thành công.', 'success');
    await bootstrapAuthenticated();
  } catch (error) {
    log(error.message || 'Đăng nhập thất bại.', 'error');
    alert(error.payload?.error?.message || error.payload?.message || error.message || 'Đăng nhập thất bại');
  }
}

async function fetchMe() {
  syncStorageWithActive(adminStorage, 'admin');
  syncAuthState();
  const me = await request(`${CONFIG.authPath}/me`);
  state.auth.me = me;
  return me;
}

async function logout() {
  try {
    if (state.auth.accessToken) {
      await request(`${CONFIG.authPath}/logout`, { method: 'POST' }).catch(() => null);
    }
  } finally {
    clearTokens();

    [
      'gs_admin_access_token',
      'gs_admin_refresh_token',
      'gs_admin_role',
      'admin_accessToken',
      'admin_refreshToken',
      'admin_role',
      'auth_accessToken',
      'auth_refreshToken',
      'auth_role',
    ].forEach((key) => localStorage.removeItem(key));

    setAuthUI(false);
    hideUserMenu();

    window.location.replace('./index.html');
  }
}

function getOrderQuery(extra = {}) {
  return buildQuery({
    status: $('filterStatus')?.value,
    paymentStatus: $('filterPayStatus')?.value,
    paymentMethod: $('filterPaymentMethod')?.value,
    dateFrom: $('filterDateFrom')?.value,
    dateTo: $('filterDateTo')?.value,
    orderCode: $('orderCodeSearch')?.value,
    page: state.orders.page,
    pageSize: Number($('ordersPageSize')?.value || state.orders.pageSize || 10),
    ...extra,
  });
}

async function fetchOrderTotal(extra = {}) {
  const params = getOrderQuery({ page: 1, pageSize: 1, ...extra });
  const data = await request(`${CONFIG.adminPath}/orders?${params.toString()}`);
  return Number(data.total || 0);
}

function updateOrdersPager() {
  const totalPages = Math.max(1, Math.ceil((state.orders.total || 0) / (state.orders.pageSize || 10)));
  $('ordersPageLabel').innerHTML = `<span class="dot"></span> Trang ${state.orders.page}/${totalPages} • Tổng ${state.orders.total}`;
}

function renderOrdersTable(items) {
  const box = $('ordersBox');
  if (!items?.length) {
    box.innerHTML = '<div class="muted">Không có đơn hàng phù hợp.</div>';
    return;
  }

  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Mã đơn</th>
          <th>Khách hàng</th>
          <th>Tổng tiền</th>
          <th>Thanh toán</th>
          <th>Trạng thái</th>
          <th>Tạo lúc</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr data-order-id="${item.id}" style="cursor:pointer">
            <td>${escapeHtml(item.id)}</td>
            <td><strong>${escapeHtml(item.order_code)}</strong></td>
            <td>
              <div>${escapeHtml(item.customerName || '')}</div>
              <div class="muted">${escapeHtml(item.customerEmail || '')}</div>
            </td>
            <td>${formatMoney(item.grand_total)}</td>
            <td>${escapeHtml(item.payment_method)} / ${escapeHtml(item.payment_status)}</td>
            <td>${escapeHtml(item.status)}</td>
            <td>${formatDate(item.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  qsa('tbody tr', box).forEach((tr) => {
    tr.addEventListener('click', async () => {
      $('orderId').value = tr.dataset.orderId;
      await loadOrderDetail(tr.dataset.orderId);
    });
  });
}

async function loadPendingStats() {
  try {
    const [all, onlinePaid, cod] = await Promise.all([
      fetchOrderTotal({ status: 'NEW' }),
      fetchOrderTotal({ status: 'NEW', paymentMethod: 'ONLINE', paymentStatus: 'PAID' }),
      fetchOrderTotal({ status: 'NEW', paymentMethod: 'COD' }),
    ]);

    $('pendingAllCount').textContent = String(all);
    $('pendingOnlinePaidCount').textContent = String(onlinePaid);
    $('pendingCodCount').textContent = String(cod);
  } catch (error) {
    log(`Không tải được số liệu chờ duyệt: ${error.message}`, 'error');
  }
}

async function loadOrders() {
  state.orders.pageSize = Number($('ordersPageSize')?.value || 10);
  try {
    const data = await request(`${CONFIG.adminPath}/orders?${getOrderQuery().toString()}`);
    state.orders.total = Number(data.total || 0);
    state.orders.items = data.items || [];
    renderOrdersTable(state.orders.items);
    updateOrdersPager();
  } catch (error) {
    $('ordersBox').innerHTML = `<div class="muted">Lỗi tải đơn hàng: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải đơn hàng: ${error.message}`, 'error');
  }
}

function renderAllowedStatuses(list = []) {
  const select = $('nextStatus');
  if (!select) return;
  if (!list.length) {
    select.innerHTML = '<option value="">Không có thao tác hợp lệ</option>';
    return;
  }
  select.innerHTML = '<option value="">Chọn trạng thái</option>' + list.map((s) => `<option value="${s}">${s}</option>`).join('');
}

function syncOrderEditForm(order) {
  $('editOrderAddressId').value = order.addressId || '';
  $('editOrderPaymentStatus').value = order.payment_status || '';
  $('editOrderNote').value = order.note || '';
}

async function loadOrderDetail(orderId) {
  if (!orderId) return;
  try {
    const order = await request(`${CONFIG.adminPath}/orders/${orderId}`);
    renderAllowedStatuses(order.allowedNextStatuses || []);
    syncOrderEditForm(order);
    $('orderDetailBox').innerHTML = `
      <div class="stack-md">
        <div><strong>Mã đơn:</strong> ${escapeHtml(order.order_code)}</div>
        <div><strong>Khách hàng:</strong> ${escapeHtml(order.customerName || '')} • ${escapeHtml(order.customerEmail || '')} • ${escapeHtml(order.customerPhone || '')}</div>
        <div><strong>Địa chỉ:</strong> ${escapeHtml(order.address_detail || '')}, ${escapeHtml(order.ward || '')}, ${escapeHtml(order.district || '')}, ${escapeHtml(order.city || '')}</div>
        <div><strong>Thanh toán:</strong> ${escapeHtml(order.payment_method)} / ${escapeHtml(order.payment_status)} • <strong>Trạng thái:</strong> ${escapeHtml(order.status)}</div>
        <div><strong>Ghi chú:</strong> ${escapeHtml(order.note || '—')}</div>
        <div><strong>Tổng tiền:</strong> ${formatMoney(order.grand_total)} (Tạm tính ${formatMoney(order.subtotal)} • Ship ${formatMoney(order.shipping_fee)} • Giảm ${formatMoney(order.discount_total)})</div>

        <div>
          <strong>Sản phẩm:</strong>
          <table style="margin-top:10px">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Tên</th>
                <th>SL</th>
                <th>Giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map((item) => `
                <tr>
                  <td>${escapeHtml(item.sku || '')}</td>
                  <td>${escapeHtml(item.name || '')}</td>
                  <td>${escapeHtml(item.qty)}</td>
                  <td>${formatMoney(item.price_snapshot)}</td>
                  <td>${formatMoney(item.line_total)}</td>
                </tr>
              `).join('') || '<tr><td colspan="5">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>
        </div>

        <div>
          <strong>Lịch sử thanh toán:</strong>
          <table style="margin-top:10px">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Mã giao dịch</th>
                <th>Trạng thái</th>
                <th>Số tiền</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              ${(order.payments || []).map((pay) => `
                <tr>
                  <td>${escapeHtml(pay.provider || '')}</td>
                  <td>${escapeHtml(pay.txn_ref || '')}</td>
                  <td>${escapeHtml(pay.status || '')}</td>
                  <td>${formatMoney(pay.amount)}</td>
                  <td>${formatDate(pay.created_at)}</td>
                </tr>
              `).join('') || '<tr><td colspan="5">Chưa có thanh toán</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    $('orderDetailBox').innerHTML = `<div class="muted">Lỗi tải chi tiết đơn: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải chi tiết đơn ${orderId}: ${error.message}`, 'error');
  }
}

async function updateOrderStatus() {
  const orderId = $('orderId')?.value.trim();
  const status = $('nextStatus')?.value;
  if (!orderId || !status) {
    alert('Chọn orderId và trạng thái hợp lệ');
    return;
  }

  try {
    await request(`${CONFIG.adminPath}/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    log(`Đã cập nhật trạng thái đơn #${orderId} -> ${status}`, 'success');
    await Promise.all([loadOrders(), loadOrderDetail(orderId), loadPendingStats()]);
  } catch (error) {
    log(`Cập nhật trạng thái thất bại: ${error.message}`, 'error');
    alert(error.payload?.message || error.message);
  }
}

async function updateOrder() {
  const orderId = $('orderId')?.value.trim();
  if (!orderId) {
    alert('Chưa có orderId');
    return;
  }

  const patch = {};
  if ($('editOrderAddressId')?.value.trim()) patch.addressId = Number($('editOrderAddressId').value.trim());
  if ($('editOrderPaymentStatus')?.value) patch.paymentStatus = $('editOrderPaymentStatus').value;
  patch.note = $('editOrderNote')?.value ?? '';

  try {
    await request(`${CONFIG.adminPath}/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ patch }),
    });
    log(`Đã cập nhật đơn #${orderId}`, 'success');
    await Promise.all([loadOrders(), loadOrderDetail(orderId)]);
  } catch (error) {
    log(`Cập nhật đơn thất bại: ${error.message}`, 'error');
    alert(error.payload?.message || error.message);
  }
}

function getCustomersQuery() {
  return buildQuery({
    keyword: $('customerKeyword')?.value,
    status: $('customerStatusFilter')?.value,
    page: state.customers.page,
    pageSize: Number($('customersPageSize')?.value || 10),
  });
}

function updateCustomersPager() {
  const totalPages = Math.max(1, Math.ceil((state.customers.total || 0) / (state.customers.pageSize || 10)));
  $('customersPageLabel').innerHTML = `<span class="dot"></span> Trang ${state.customers.page}/${totalPages} • Tổng ${state.customers.total}`;
}

function renderCustomersTable(items) {
  const box = $('customersBox');
  if (!items?.length) {
    box.innerHTML = '<div class="muted">Không có người mua.</div>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Tên</th>
          <th>Email</th>
          <th>SĐT</th>
          <th>Trạng thái</th>
          <th>Đơn</th>
          <th>Tổng chi</th>
          <th>Đơn gần nhất</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr data-customer-id="${item.id}" style="cursor:pointer">
            <td>${item.id}</td>
            <td>${escapeHtml(item.name || '')}</td>
            <td>${escapeHtml(item.email || '')}</td>
            <td>${escapeHtml(item.phone || '')}</td>
            <td>${escapeHtml(item.status || '')}</td>
            <td>${formatNumber(item.ordersCount)}</td>
            <td>${formatMoney(item.totalSpent)}</td>
            <td>${formatDate(item.lastOrderAt)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  qsa('tbody tr', box).forEach((tr) => tr.addEventListener('click', async () => {
    $('customerId').value = tr.dataset.customerId;
    await loadCustomerDetail(tr.dataset.customerId);
  }));
}

async function loadCustomers() {
  state.customers.pageSize = Number($('customersPageSize')?.value || 10);
  try {
    const data = await request(`${CONFIG.adminPath}/customers?${getCustomersQuery().toString()}`);
    state.customers.total = Number(data.total || 0);
    state.customers.items = data.items || [];
    renderCustomersTable(state.customers.items);
    updateCustomersPager();
  } catch (error) {
    $('customersBox').innerHTML = `<div class="muted">Lỗi tải người mua: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải người mua: ${error.message}`, 'error');
  }
}

async function loadCustomerDetail(customerId) {
  if (!customerId) return;
  try {
    const customer = await request(`${CONFIG.adminPath}/customers/${customerId}`);
    $('customerNextStatus').value = customer.status || '';
    $('customerDetailBox').innerHTML = `
      <div class="stack-md">
        <div><strong>${escapeHtml(customer.name || '')}</strong> • ${escapeHtml(customer.email || '')} • ${escapeHtml(customer.phone || '')}</div>
        <div><strong>Trạng thái:</strong> ${escapeHtml(customer.status || '')} • <strong>Đơn hàng:</strong> ${formatNumber(customer.ordersCount)} • <strong>Tổng chi:</strong> ${formatMoney(customer.totalSpent)}</div>
        <div><strong>Địa chỉ:</strong></div>
        <ul>
          ${(customer.addresses || []).map((a) => `<li>${escapeHtml(a.detail || '')}, ${escapeHtml(a.ward || '')}, ${escapeHtml(a.district || '')}, ${escapeHtml(a.city || '')}${a.is_default ? ' (Mặc định)' : ''}</li>`).join('') || '<li>Không có địa chỉ</li>'}
        </ul>
        <div><strong>10 đơn gần nhất:</strong></div>
        <table>
          <thead><tr><th>Mã đơn</th><th>Ngày</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th></tr></thead>
          <tbody>
            ${(customer.recentOrders || []).map((o) => `
              <tr>
                <td>${escapeHtml(o.order_code)}</td>
                <td>${formatDate(o.created_at)}</td>
                <td>${formatMoney(o.grand_total)}</td>
                <td>${escapeHtml(o.payment_method)} / ${escapeHtml(o.payment_status)}</td>
                <td>${escapeHtml(o.status)}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">Chưa có đơn</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    $('customerDetailBox').innerHTML = `<div class="muted">Lỗi tải chi tiết người mua: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải chi tiết người mua: ${error.message}`, 'error');
  }
}

async function updateCustomerStatus() {
  const customerId = $('customerId')?.value.trim();
  const status = $('customerNextStatus')?.value;
  if (!customerId || !status) {
    alert('Chọn customerId và trạng thái');
    return;
  }
  try {
    await request(`${CONFIG.adminPath}/customers/${customerId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    log(`Đã đổi trạng thái người mua #${customerId} -> ${status}`, 'success');
    await Promise.all([loadCustomers(), loadCustomerDetail(customerId)]);
  } catch (error) {
    log(`Đổi trạng thái người mua thất bại: ${error.message}`, 'error');
    alert(error.payload?.message || error.message);
  }
}

function getInventoryQuery() {
  return buildQuery({
    keyword: $('inventoryKeyword')?.value,
    status: $('inventoryStatus')?.value,
    lowStockBelow: $('inventoryLowStock')?.value,
    page: state.inventory.page,
    pageSize: Number($('inventoryPageSize')?.value || 10),
  });
}

function updateInventoryPager() {
  const totalPages = Math.max(1, Math.ceil((state.inventory.total || 0) / (state.inventory.pageSize || 10)));
  $('inventoryPageLabel').innerHTML = `<span class="dot"></span> Trang ${state.inventory.page}/${totalPages} • Tổng ${state.inventory.total}`;
}

function renderInventoryTable(items) {
  const box = $('inventoryBox');
  if (!items?.length) {
    box.innerHTML = '<div class="muted">Không có dữ liệu tồn kho.</div>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Tên</th>
          <th>SKU</th>
          <th>Brand</th>
          <th>Giá</th>
          <th>Giảm</th>
          <th>Tồn</th>
          <th>Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr data-product-id="${item.id}" data-qty="${item.quantity}" style="cursor:pointer">
            <td>${item.id}</td>
            <td>${escapeHtml(item.name || '')}</td>
            <td>${escapeHtml(item.sku || '')}</td>
            <td>${escapeHtml(item.brand || '')}</td>
            <td>${formatMoney(item.price)}</td>
            <td>${item.discountPrice == null ? '—' : formatMoney(item.discountPrice)}</td>
            <td>${formatNumber(item.quantity)}</td>
            <td>${escapeHtml(item.status || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  qsa('tbody tr', box).forEach((tr) => tr.addEventListener('click', () => {
    $('invProductId').value = tr.dataset.productId;
    $('invQty').value = tr.dataset.qty;
  }));
}

async function loadInventory() {
  state.inventory.pageSize = Number($('inventoryPageSize')?.value || 10);
  try {
    const data = await request(`${CONFIG.adminPath}/inventory?${getInventoryQuery().toString()}`);
    state.inventory.total = Number(data.total || 0);
    state.inventory.items = data.items || [];
    renderInventoryTable(state.inventory.items);
    updateInventoryPager();
  } catch (error) {
    $('inventoryBox').innerHTML = `<div class="muted">Lỗi tải tồn kho: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải tồn kho: ${error.message}`, 'error');
  }
}

async function updateInventoryQty() {
  const productId = $('invProductId')?.value.trim();
  const quantity = Number($('invQty')?.value);
  if (!productId || Number.isNaN(quantity)) {
    alert('Nhập productId và số lượng hợp lệ');
    return;
  }
  try {
    const data = await request(`${CONFIG.adminPath}/inventory/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
    $('invBox').textContent = `Đã cập nhật tồn kho sản phẩm #${productId}: ${data.oldQty} → ${data.newQty}`;
    log(`Đã set tồn kho sản phẩm #${productId} = ${quantity}`, 'success');
    await loadInventory();
  } catch (error) {
    $('invBox').textContent = error.payload?.message || error.message;
    log(`Lỗi cập nhật tồn kho: ${error.message}`, 'error');
  }
}

async function adjustInventory() {
  const productId = $('invProductId')?.value.trim();
  const delta = Number($('invDelta')?.value);
  const note = $('invAdjustNote')?.value.trim();
  if (!productId || Number.isNaN(delta) || delta === 0) {
    alert('Nhập productId và delta hợp lệ');
    return;
  }
  try {
    const data = await request(`${CONFIG.adminPath}/inventory/${productId}/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta, note }),
    });
    $('invBox').textContent = `Điều chỉnh tồn kho #${productId}: ${data.oldQty} ${delta > 0 ? '+' : ''}${delta} = ${data.newQty}`;
    log(`Điều chỉnh tồn kho sản phẩm #${productId}: ${delta}`, 'success');
    await loadInventory();
  } catch (error) {
    $('invBox').textContent = error.payload?.message || error.message;
    log(`Lỗi điều chỉnh tồn kho: ${error.message}`, 'error');
  }
}

async function createProduct() {
  const categoryId = Number($('pCategoryId')?.value);
  const name = $('pName')?.value.trim();
  const sku = $('pSku')?.value.trim();
  const brand = $('pBrand')?.value.trim();
  const price = Number($('pPrice')?.value);
  const discountPrice = $('pDiscount')?.value.trim();
  const initialStock = Number($('pStock')?.value || 0);
  const image1 = $('pImage1')?.value.trim();

  if (!categoryId || !name || !sku || Number.isNaN(price)) {
    alert('Nhập đủ categoryId, tên, SKU, giá');
    return;
  }

  try {
    const data = await request(`${CONFIG.adminPath}/products`, {
      method: 'POST',
      body: JSON.stringify({
        product: {
          categoryId,
          name,
          sku,
          brand: brand || undefined,
          price,
          discountPrice: discountPrice === '' ? undefined : Number(discountPrice),
        },
        images: image1 ? [image1] : [],
        initialStock,
      }),
    });
    $('prodBox').textContent = `Đã tạo sản phẩm mới #${data.productId}`;
    log(`Đã tạo sản phẩm #${data.productId}`, 'success');
    await loadInventory();
  } catch (error) {
    $('prodBox').textContent = error.payload?.message || error.message;
    log(`Lỗi tạo sản phẩm: ${error.message}`, 'error');
  }
}

async function deactivateProduct() {
  const productId = $('pDeactivateId')?.value.trim();
  if (!productId) {
    alert('Nhập productId');
    return;
  }
  try {
    await request(`${CONFIG.adminPath}/products/${productId}`, { method: 'DELETE' });
    $('prodBox').textContent = `Đã ngừng bán sản phẩm #${productId}`;
    log(`Đã ngừng bán sản phẩm #${productId}`, 'success');
    await loadInventory();
  } catch (error) {
    $('prodBox').textContent = error.payload?.message || error.message;
    log(`Lỗi ngừng bán sản phẩm: ${error.message}`, 'error');
  }
}

function getCouponsQuery() {
  return buildQuery({
    isActive: $('couponActive')?.value,
    page: state.coupons.page,
    pageSize: Number($('couponsPageSize')?.value || 10),
  });
}

function updateCouponsPager() {
  const totalPages = Math.max(1, Math.ceil((state.coupons.total || 0) / (state.coupons.pageSize || 10)));
  $('couponsPageLabel').innerHTML = `<span class="dot"></span> Trang ${state.coupons.page}/${totalPages} • Tổng ${state.coupons.total}`;
}

function renderCouponsTable(items) {
  const box = $('couponsBox');
  if (!items?.length) {
    box.innerHTML = '<div class="muted">Không có coupon.</div>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Code</th>
          <th>Loại</th>
          <th>Giá trị</th>
          <th>Min order</th>
          <th>Max discount</th>
          <th>Hiệu lực</th>
          <th>Active</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr data-coupon-id="${item.id}" data-value="${item.value}" data-active="${item.is_active ? 'true' : 'false'}" style="cursor:pointer">
            <td>${item.id}</td>
            <td><strong>${escapeHtml(item.code)}</strong></td>
            <td>${escapeHtml(item.type)}</td>
            <td>${formatNumber(item.value)}</td>
            <td>${formatMoney(item.min_order)}</td>
            <td>${item.max_discount == null ? '—' : formatMoney(item.max_discount)}</td>
            <td>${formatDate(item.start_at)} → ${formatDate(item.end_at)}</td>
            <td>${item.is_active ? 'Bật' : 'Tắt'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  qsa('tbody tr', box).forEach((tr) => tr.addEventListener('click', () => {
    $('cUpdId').value = tr.dataset.couponId;
    $('cUpdValue').value = tr.dataset.value;
    $('cUpdActive').value = tr.dataset.active;
  }));
}

async function loadCoupons() {
  state.coupons.pageSize = Number($('couponsPageSize')?.value || 10);
  try {
    const data = await request(`${CONFIG.adminPath}/coupons?${getCouponsQuery().toString()}`);
    state.coupons.total = Number(data.total || 0);
    state.coupons.items = data.items || [];
    renderCouponsTable(state.coupons.items);
    updateCouponsPager();
  } catch (error) {
    $('couponsBox').innerHTML = `<div class="muted">Lỗi tải coupon: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải coupon: ${error.message}`, 'error');
  }
}

async function createCoupon() {
  const code = prompt('Coupon code?');
  if (!code) return;
  const type = (prompt('Loại coupon? PERCENT hoặc FIXED', 'PERCENT') || 'PERCENT').toUpperCase();
  const value = Number(prompt('Giá trị?', '10'));
  const minOrder = Number(prompt('Đơn tối thiểu?', '0'));
  const maxDiscountRaw = prompt('Giảm tối đa? để trống nếu không có', '');
  const startAt = prompt('Bắt đầu (YYYY-MM-DD HH:mm:ss)', new Date().toISOString().slice(0, 19).replace('T', ' '));
  const endAt = prompt('Kết thúc (YYYY-MM-DD HH:mm:ss)', '2030-12-31 23:59:59');
  const usageLimit = Number(prompt('Giới hạn lượt dùng?', '0'));

  try {
    const data = await request(`${CONFIG.adminPath}/coupons`, {
      method: 'POST',
      body: JSON.stringify({
        code,
        type,
        value,
        minOrder,
        maxDiscount: maxDiscountRaw === '' ? null : Number(maxDiscountRaw),
        startAt,
        endAt,
        usageLimit,
        isActive: true,
      }),
    });
    log(`Đã tạo coupon #${data.couponId}`, 'success');
    await loadCoupons();
  } catch (error) {
    log(`Lỗi tạo coupon: ${error.message}`, 'error');
    alert(error.payload?.message || error.message);
  }
}

async function updateCoupon() {
  const couponId = $('cUpdId')?.value.trim();
  if (!couponId) {
    alert('Nhập couponId');
    return;
  }
  const body = {};
  if ($('cUpdValue')?.value.trim()) body.value = Number($('cUpdValue').value.trim());
  if ($('cUpdActive')?.value) body.isActive = $('cUpdActive').value === 'true';

  try {
    await request(`${CONFIG.adminPath}/coupons/${couponId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    log(`Đã cập nhật coupon #${couponId}`, 'success');
    await loadCoupons();
  } catch (error) {
    log(`Lỗi cập nhật coupon: ${error.message}`, 'error');
    alert(error.payload?.message || error.message);
  }
}

async function deactivateCoupon() {
  const couponId = $('cUpdId')?.value.trim();
  if (!couponId) {
    alert('Nhập couponId');
    return;
  }
  try {
    await request(`${CONFIG.adminPath}/coupons/${couponId}`, { method: 'DELETE' });
    log(`Đã tắt coupon #${couponId}`, 'success');
    await loadCoupons();
  } catch (error) {
    log(`Lỗi tắt coupon: ${error.message}`, 'error');
    alert(error.payload?.message || error.message);
  }
}

async function loadReport() {
  const from = $('rFrom')?.value.trim();
  const to = $('rTo')?.value.trim();
  const groupBy = $('rGroup')?.value || 'day';
  if (!from || !to) {
    alert('Nhập từ ngày và đến ngày');
    return;
  }
  try {
    const data = await request(`${CONFIG.adminPath}/reports/revenue?${new URLSearchParams({ from, to, groupBy }).toString()}`);
    state.reports = data;
    $('reportBox').innerHTML = `
      <div class="stack-md">
        <div><strong>Tổng doanh thu:</strong> ${formatMoney(data.totalRevenue)} • <strong>Tổng đơn:</strong> ${formatNumber(data.totalOrders)} • <strong>AOV:</strong> ${formatMoney(data.avgOrderValue)}</div>

        <div>
          <strong>Chuỗi doanh thu:</strong>
          <table style="margin-top:10px">
            <thead><tr><th>Kỳ</th><th>Số đơn</th><th>Doanh thu</th></tr></thead>
            <tbody>
              ${(data.series || []).map((s) => `<tr><td>${escapeHtml(s.bucket)}</td><td>${formatNumber(s.ordersCount)}</td><td>${formatMoney(s.revenue)}</td></tr>`).join('') || '<tr><td colspan="3">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>
        </div>

        <div>
          <strong>Theo phương thức thanh toán:</strong>
          <table style="margin-top:10px">
            <thead><tr><th>Phương thức</th><th>Số đơn</th><th>Doanh thu</th></tr></thead>
            <tbody>
              ${(data.byPaymentMethod || []).map((s) => `<tr><td>${escapeHtml(s.payment_method)}</td><td>${formatNumber(s.ordersCount)}</td><td>${formatMoney(s.revenue)}</td></tr>`).join('') || '<tr><td colspan="3">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>
        </div>

        <div>
          <strong>Top sản phẩm:</strong>
          <table style="margin-top:10px">
            <thead><tr><th>SKU</th><th>Tên</th><th>SL bán</th><th>Doanh thu</th></tr></thead>
            <tbody>
              ${(data.topProducts || []).map((p) => `<tr><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(p.name)}</td><td>${formatNumber(p.totalQty)}</td><td>${formatMoney(p.revenue)}</td></tr>`).join('') || '<tr><td colspan="4">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    log('Đã tải báo cáo doanh thu.', 'success');
  } catch (error) {
    $('reportBox').innerHTML = `<div class="muted">Lỗi tải báo cáo: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải báo cáo: ${error.message}`, 'error');
  }
}

function getAuditQuery() {
  return buildQuery({
    actorId: $('aActor')?.value,
    action: $('aAction')?.value,
    from: $('aFrom')?.value,
    to: $('aTo')?.value,
    page: state.audit.page,
    pageSize: Number($('auditPageSize')?.value || 10),
  });
}

function updateAuditPager() {
  const label = $('auditPageLabel');
  if (!label) return;
  const totalPages = Math.max(1, Math.ceil((state.audit.total || 0) / (state.audit.pageSize || 10)));
  label.innerHTML = `<span class="dot"></span> Trang ${state.audit.page}/${totalPages} • Tổng ${state.audit.total}`;
}

function renderAuditTable(items) {
  const box = $('auditBox');
  if (!box) return;
  if (!items?.length) {
    box.innerHTML = '<div class="muted">Không có nhật ký thao tác.</div>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Target</th>
          <th>Metadata</th>
          <th>Thời gian</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>${item.id}</td>
            <td>${escapeHtml(item.actorId)}</td>
            <td>${escapeHtml(item.action)}</td>
            <td>${escapeHtml(item.targetType || '')} #${escapeHtml(item.targetId || '')}</td>
            <td><code>${escapeHtml(item.metadata || '')}</code></td>
            <td>${formatDate(item.createdAt)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadAudit() {
  const box = $('auditBox');
  if (!box) return;
  state.audit.pageSize = Number($('auditPageSize')?.value || 10);
  try {
    const data = await request(`${CONFIG.adminPath}/audit-logs?${getAuditQuery().toString()}`);
    state.audit.total = Number(data.total || 0);
    state.audit.items = data.items || [];
    renderAuditTable(state.audit.items);
    updateAuditPager();
  } catch (error) {
    $('auditBox').innerHTML = `<div class="muted">Lỗi tải audit log: ${escapeHtml(error.message)}</div>`;
    log(`Lỗi tải audit log: ${error.message}`, 'error');
  }
}

function filterOrdersQuick(kind) {
  $('filterStatus').value = 'NEW';
  $('filterPayStatus').value = '';
  $('filterPaymentMethod').value = '';
  if (kind === 'onlinePaid') {
    $('filterPaymentMethod').value = 'ONLINE';
    $('filterPayStatus').value = 'PAID';
  }
  if (kind === 'cod') {
    $('filterPaymentMethod').value = 'COD';
  }
  state.orders.page = 1;
  loadOrders();
}

function hideUserMenu() {
  $('userMenu')?.classList.remove('show');
}

function bindUserMenu() {
  const btn = $('btnUserMenu');
  const menu = $('userMenu');
  if (!btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.userMenuWrap')) hideUserMenu();
  });
}

function bindSidebar() {
  const sidebar = $('sidebar');
  const sidebarBackdrop = $('sidebarBackdrop');
  const btnMenuToggle = $('btnMenuToggle');

  function toggleSidebar(forceClose = false) {
    if (!sidebar || !sidebarBackdrop || !btnMenuToggle) return;
    const willShow = forceClose ? false : !sidebar.classList.contains('show');
    sidebar.classList.toggle('show', willShow);
    sidebarBackdrop.classList.toggle('show', willShow);
    btnMenuToggle.setAttribute('aria-expanded', String(willShow));
  }

  btnMenuToggle?.addEventListener('click', () => toggleSidebar());
  sidebarBackdrop?.addEventListener('click', () => toggleSidebar(true));
  qsa('.nav__item').forEach((link) => {
    link.addEventListener('click', () => {
      qsa('.nav__item').forEach((a) => a.classList.remove('active'));
      link.classList.add('active');
      if (window.innerWidth <= 980) toggleSidebar(true);
    });
  });
}

function bindTopSearch() {
  const input = $('topSearch');
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const term = input.value.trim();
    if (!term) return;
    $('orderCodeSearch').value = term;
    $('customerKeyword').value = term;
    $('inventoryKeyword').value = term;
    state.orders.page = 1;
    state.customers.page = 1;
    state.inventory.page = 1;
    loadOrders();
    loadCustomers();
    loadInventory();
  });
}

function bindExports() {
  $('btnExportOrders')?.addEventListener('click', () => {
    downloadCsv('orders.csv', (state.orders.items || []).map((i) => ({
      id: i.id,
      order_code: i.order_code,
      customerName: i.customerName,
      customerEmail: i.customerEmail,
      grand_total: i.grand_total,
      payment_method: i.payment_method,
      payment_status: i.payment_status,
      status: i.status,
      created_at: i.created_at,
    })));
  });

  $('btnExportCoupons')?.addEventListener('click', () => {
    downloadCsv('coupons.csv', state.coupons.items || []);
  });

  $('btnExportReport')?.addEventListener('click', () => {
    if (!state.reports) {
      log('Hãy tải báo cáo trước khi xuất CSV.');
      return;
    }
    downloadCsv('revenue-series.csv', state.reports.series || []);
  });

  $('btnExportAudit')?.addEventListener('click', () => {
    downloadCsv('audit-logs.csv', state.audit.items || []);
  });
}

function bindPagination() {
  $('btnPrevOrdersA')?.addEventListener('click', () => {
    if (state.orders.page > 1) {
      state.orders.page -= 1;
      loadOrders();
    }
  });
  $('btnNextOrdersA')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((state.orders.total || 0) / (state.orders.pageSize || 10)));
    if (state.orders.page < totalPages) {
      state.orders.page += 1;
      loadOrders();
    }
  });

  $('btnPrevCustomers')?.addEventListener('click', () => {
    if (state.customers.page > 1) {
      state.customers.page -= 1;
      loadCustomers();
    }
  });
  $('btnNextCustomers')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((state.customers.total || 0) / (state.customers.pageSize || 10)));
    if (state.customers.page < totalPages) {
      state.customers.page += 1;
      loadCustomers();
    }
  });

  $('btnPrevInventory')?.addEventListener('click', () => {
    if (state.inventory.page > 1) {
      state.inventory.page -= 1;
      loadInventory();
    }
  });
  $('btnNextInventory')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((state.inventory.total || 0) / (state.inventory.pageSize || 10)));
    if (state.inventory.page < totalPages) {
      state.inventory.page += 1;
      loadInventory();
    }
  });

  $('btnPrevCoupons')?.addEventListener('click', () => {
    if (state.coupons.page > 1) {
      state.coupons.page -= 1;
      loadCoupons();
    }
  });
  $('btnNextCoupons')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((state.coupons.total || 0) / (state.coupons.pageSize || 10)));
    if (state.coupons.page < totalPages) {
      state.coupons.page += 1;
      loadCoupons();
    }
  });

  $('btnPrevAudit')?.addEventListener('click', () => {
    if (state.audit.page > 1) {
      state.audit.page -= 1;
      loadAudit();
    }
  });
  $('btnNextAudit')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((state.audit.total || 0) / (state.audit.pageSize || 10)));
    if (state.audit.page < totalPages) {
      state.audit.page += 1;
      loadAudit();
    }
  });
}

function bindMainActions() {
  $('btnLogin')?.addEventListener('click', login);
  $('btnLogout')?.addEventListener('click', logout);

  $('btnPendingAll')?.addEventListener('click', () => filterOrdersQuick('all'));
  $('btnPendingOnlinePaid')?.addEventListener('click', () => filterOrdersQuick('onlinePaid'));
  $('btnPendingCOD')?.addEventListener('click', () => filterOrdersQuick('cod'));

  $('btnOrders')?.addEventListener('click', () => { state.orders.page = 1; loadOrders(); });
  $('ordersPageSize')?.addEventListener('change', () => { state.orders.page = 1; loadOrders(); });
  $('btnOrderDetail')?.addEventListener('click', () => loadOrderDetail($('orderId')?.value.trim()));
  $('btnUpdateStatus')?.addEventListener('click', updateOrderStatus);
  $('btnUpdateOrder')?.addEventListener('click', updateOrder);

  $('btnCustomers')?.addEventListener('click', () => { state.customers.page = 1; loadCustomers(); });
  $('customersPageSize')?.addEventListener('change', () => { state.customers.page = 1; loadCustomers(); });
  $('btnCustomerDetail')?.addEventListener('click', () => loadCustomerDetail($('customerId')?.value.trim()));
  $('btnCustomerStatus')?.addEventListener('click', updateCustomerStatus);

  $('btnInventoryList')?.addEventListener('click', () => { state.inventory.page = 1; loadInventory(); });
  $('inventoryPageSize')?.addEventListener('change', () => { state.inventory.page = 1; loadInventory(); });
  $('btnInv')?.addEventListener('click', updateInventoryQty);
  $('btnInvAdjust')?.addEventListener('click', adjustInventory);

  $('btnCreateProduct')?.addEventListener('click', createProduct);
  $('btnDeactivateProduct')?.addEventListener('click', deactivateProduct);

  $('btnCoupons')?.addEventListener('click', () => { state.coupons.page = 1; loadCoupons(); });
  $('couponsPageSize')?.addEventListener('change', () => { state.coupons.page = 1; loadCoupons(); });
  $('btnCreateCoupon')?.addEventListener('click', createCoupon);
  $('btnUpdateCoupon')?.addEventListener('click', updateCoupon);
  $('btnDeactivateCoupon')?.addEventListener('click', deactivateCoupon);

  $('btnReport')?.addEventListener('click', loadReport);
  $('btnAudit')?.addEventListener('click', () => { state.audit.page = 1; loadAudit(); });
  $('auditPageSize')?.addEventListener('change', () => { state.audit.page = 1; loadAudit(); });
}

async function bootstrapAuthenticated() {
  await Promise.allSettled([
    loadPendingStats(),
    loadOrders(),
    loadCustomers(),
    loadInventory(),
    loadCoupons(),
  ]);
}

async function initAuthFromStorage() {
  const active = syncAuthState();
  if (!active?.accessToken) {
    setAuthUI(false);
    return;
  }
  if (normalizeRole(active.role) !== 'ADMIN') {
    redirectByRole(active.role, { USER: './index.html', STAFF: './staff.html', ADMIN: './admin.html' });
    return;
  }
  try {
    syncStorageWithActive(adminStorage, 'admin');
    await fetchMe();
    setAuthUI(true);
    await bootstrapAuthenticated();
  } catch (_error) {
    clearTokens();
    setAuthUI(false);
  }
}

function initDefaults() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d, end = false) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${end ? '23:59:59' : '00:00:00'}`;
  if ($('rFrom') && !$('rFrom').value) $('rFrom').value = fmt(firstDay);
  if ($('rTo') && !$('rTo').value) $('rTo').value = fmt(now, true);
}

function activateSection(sectionName) {
  state.currentSection = sectionName;

  qsa('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === sectionName);
  });

  qsa('.content-section').forEach((section) => {
    section.classList.toggle('active', section.dataset.section === sectionName);
  });

  if (!state.auth.accessToken) return;

  if (sectionName === 'orders') {
    loadPendingStats();
    loadOrders();
  } else if (sectionName === 'customers') {
    loadCustomers();
  } else if (sectionName === 'inventory') {
    loadInventory();
  } else if (sectionName === 'products') {
    loadInventory();
  } else if (sectionName === 'coupons') {
    loadCoupons();
  } else if (sectionName === 'reports') {
    // chờ bấm nút Xem mới tải báo cáo
  }
}

function bindTabs() {
  qsa('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sectionName = btn.dataset.section;
      if (!sectionName) return;
      activateSection(sectionName);
    });
  });
}

function init() {
  bindUserMenu();
  bindTabs();
  bindTopSearch();
  bindExports();
  bindPagination();
  bindMainActions();
  initDefaults();
  activateSection('orders');
  setAuthUI(false);
  initAuthFromStorage();
}

function guardAdmin() {
  const active = getActiveSession();

  if (active && active.role && active.role !== 'ADMIN') {
    redirectByRole(active.role, {
      USER: './index.html',
      STAFF: './staff.html',
      ADMIN: './admin.html',
    });
    return false;
  }

  return true;
}

if (guardAdmin()) {
  init();
}