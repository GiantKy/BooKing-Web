// ============ UTILITY FUNCTIONS ============

function formatPrice(price) {
  return new Intl.NumberFormat('vi-VN').format(price) + '₫';
}

function statusText(status) {
  const map = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', cancelled: 'Đã hủy' };
  return map[status] || status;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ============ AUTH ============

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.success) return data.user;
    return null;
  } catch (e) { return null; }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

// ============ ROOMS (Homepage) ============

let allRooms = [];

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    if (data.success) {
      allRooms = data.rooms;
      renderRooms(allRooms);
    }
  } catch (e) {
    console.error('Error loading rooms:', e);
  }
}

function renderRooms(rooms) {
  const grid = document.getElementById('roomsGrid');
  if (!grid) return;
  if (rooms.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;padding:60px 0">Không tìm thấy phòng phù hợp.</p>';
    return;
  }
  grid.innerHTML = rooms.map(r => `
    <div class="room-card">
      <div class="room-card-img">
        <img src="${r.image}" alt="${r.name}" loading="lazy">
        <span class="room-type">${r.type}</span>
      </div>
      <div class="room-card-body">
        <h3>${r.name}</h3>
        <p class="room-desc">${r.description}</p>
        <div class="room-amenities">
          ${r.amenities.slice(0, 4).map(a => `<span>${a}</span>`).join('')}
          ${r.amenities.length > 4 ? `<span>+${r.amenities.length - 4}</span>` : ''}
        </div>
        <div class="room-card-footer">
          <div class="room-price">${formatPrice(r.price)}<small>/đêm</small></div>
          <button class="btn btn-primary btn-sm" onclick="openBookingModal(${r.id}, '${r.name.replace(/'/g, "\\'")}', ${r.price})">Đặt ngay</button>
        </div>
      </div>
    </div>
  `).join('');
}

function searchRooms() {
  const type = document.getElementById('searchType').value;
  let filtered = allRooms;
  if (type) filtered = filtered.filter(r => r.type === type);
  renderRooms(filtered);
  document.getElementById('rooms').scrollIntoView({ behavior: 'smooth' });
}

// ============ BOOKING MODAL ============

let currentBookingRoom = null;

function openBookingModal(roomId, roomName, price) {
  currentBookingRoom = { id: roomId, name: roomName, price: price };
  document.getElementById('bookRoomId').value = roomId;
  document.getElementById('bookRoomName').value = roomName;

  // Set default dates
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const checkInEl = document.getElementById('bookCheckIn');
  const checkOutEl = document.getElementById('bookCheckOut');
  checkInEl.value = formatDateInput(tomorrow);
  checkOutEl.value = formatDateInput(dayAfter);
  checkInEl.min = formatDateInput(today);
  checkOutEl.min = formatDateInput(tomorrow);

  updateBookingTotal();

  // Attach listeners for price calculation
  checkInEl.onchange = () => {
    const ci = new Date(checkInEl.value);
    const next = new Date(ci); next.setDate(next.getDate() + 1);
    checkOutEl.min = formatDateInput(next);
    if (new Date(checkOutEl.value) <= ci) checkOutEl.value = formatDateInput(next);
    updateBookingTotal();
  };
  checkOutEl.onchange = updateBookingTotal;

  const alert = document.getElementById('bookingAlert');
  if (alert) alert.style.display = 'none';
  document.getElementById('bookingModal').classList.add('active');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
}

function updateBookingTotal() {
  if (!currentBookingRoom) return;
  const checkIn = new Date(document.getElementById('bookCheckIn').value);
  const checkOut = new Date(document.getElementById('bookCheckOut').value);
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  const total = nights > 0 ? currentBookingRoom.price * nights : 0;
  document.getElementById('bookTotal').value = nights > 0 ? `${formatPrice(total)} (${nights} đêm)` : '---';
}

async function submitBooking(e) {
  e.preventDefault();
  const alert = document.getElementById('bookingAlert');

  const roomId = document.getElementById('bookRoomId').value;
  const checkIn = document.getElementById('bookCheckIn').value;
  const checkOut = document.getElementById('bookCheckOut').value;
  const guests = document.getElementById('bookGuests').value;

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, checkIn, checkOut, guests })
    });
    const data = await res.json();
    if (data.success) {
      closeBookingModal();
      showToast(data.message, 'success');
      // Reload if on dashboard
      if (typeof loadUserDashboard === 'function') loadUserDashboard();
    } else {
      if (data.message.includes('đăng nhập')) {
        window.location.href = '/login';
        return;
      }
      alert.textContent = data.message;
      alert.style.display = 'block';
    }
  } catch (err) {
    alert.textContent = 'Lỗi kết nối server!';
    alert.style.display = 'block';
  }
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============ NAV AUTH STATE ============

(async function updateNavAuth() {
  const navAuth = document.getElementById('navAuth');
  if (!navAuth) return;
  const user = await checkAuth();
  if (user) {
    if (user.role === 'admin') {
      navAuth.innerHTML = `
        <a href="/admin/dashboard" class="btn btn-accent btn-sm">📊 Dashboard</a>
        <button class="btn btn-secondary btn-sm" onclick="logout()">Đăng xuất</button>
      `;
    } else {
      // Avatar dropdown for regular users
      const initial = user.fullName ? user.fullName.charAt(0).toUpperCase() : '?';
      navAuth.innerHTML = `
        <div class="nav-avatar-wrap" id="navAvatarWrap">
          <button class="nav-avatar-btn" id="navAvatarBtn" onclick="toggleAvatarDropdown()" title="${user.fullName}">
            <span class="nav-avatar-circle">${initial}</span>
            <span class="nav-avatar-name">${user.fullName}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="nav-avatar-dropdown" id="navAvatarDropdown">
            <div class="nav-dropdown-header">
              <span class="nav-dropdown-avatar">${initial}</span>
              <div>
                <div class="nav-dropdown-name">${user.fullName}</div>
                <div class="nav-dropdown-role">Thành viên</div>
              </div>
            </div>
            <div class="nav-dropdown-divider"></div>
            <a href="/dashboard" class="nav-dropdown-item">
              <span>📊</span> Dashboard
            </a>
            <a href="/dashboard" class="nav-dropdown-item" onclick="setTimeout(()=>document.querySelector('[onclick*=\\'bookings\\']')?.click(),500)">
              <span>📋</span> Lịch sử đặt phòng
            </a>
            <a href="/dashboard" class="nav-dropdown-item" onclick="setTimeout(()=>document.querySelector('[onclick*=\\'rooms\\']')?.click(),500)">
              <span>🏨</span> Đặt phòng
            </a>
            <div class="nav-dropdown-divider"></div>
            <button class="nav-dropdown-item nav-dropdown-logout" onclick="logout()">
              <span>🚪</span> Đăng xuất
            </button>
          </div>
        </div>
      `;

      // Close dropdown when clicking outside
      document.addEventListener('click', function(e) {
        const wrap = document.getElementById('navAvatarWrap');
        if (wrap && !wrap.contains(e.target)) {
          document.getElementById('navAvatarDropdown')?.classList.remove('show');
        }
      });

      // Show chat widget button on homepage
      const chatBtn = document.getElementById('chatWidgetBtn');
      if (chatBtn) chatBtn.style.display = 'flex';
    }
  }
})();

function toggleAvatarDropdown() {
  const dropdown = document.getElementById('navAvatarDropdown');
  if (dropdown) dropdown.classList.toggle('show');
}
