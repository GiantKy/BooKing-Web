const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'booking-web-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Helper
function parseRoom(row) {
  if (!row) return null;
  return { ...row, amenities: JSON.parse(row.amenities || '[]'), available: !!row.available };
}

// ============ AUTH ============

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên và mật khẩu!' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu tối thiểu 6 ký tự!' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại!' });

    const hashed = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (fullName, username, password) VALUES (?, ?, ?)').run(username, username, hashed);

    req.session.user = { id: result.lastInsertRowid, fullName: username, username, role: 'user' };
    res.json({ success: true, message: 'Đăng ký thành công!' });
  } catch (e) { res.status(500).json({ success: false, message: 'Lỗi server!' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng!' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng!' });

    req.session.user = { id: user.id, fullName: user.fullName, username: user.username, role: 'user' };
    res.json({ success: true, message: 'Đăng nhập thành công!' });
  } catch (e) { res.status(500).json({ success: false, message: 'Lỗi server!' }); }
});

app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) return res.status(401).json({ success: false, message: 'Tên hoặc mật khẩu admin không đúng!' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Tên hoặc mật khẩu admin không đúng!' });

    req.session.user = { id: admin.id, fullName: admin.fullName, username: admin.username, role: 'admin' };
    res.json({ success: true, message: 'Đăng nhập Admin thành công!' });
  } catch (e) { res.status(500).json({ success: false, message: 'Lỗi server!' }); }
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/auth/me', (req, res) => {
  if (req.session.user) res.json({ success: true, user: req.session.user });
  else res.status(401).json({ success: false });
});

// ============ ROOMS ============
app.get('/api/rooms', (req, res) => {
  const rows = db.prepare('SELECT * FROM rooms ORDER BY id').all();
  res.json({ success: true, rooms: rows.map(parseRoom) });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ success: false, message: 'Không tìm thấy!' });
  res.json({ success: true, room: parseRoom(room) });
});

app.post('/api/rooms', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Không có quyền!' });
  const { name, type, price, capacity, description, image, amenities } = req.body;
  if (!name || !type || !price || !capacity) return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });

  const result = db.prepare('INSERT INTO rooms (name, type, price, capacity, description, amenities, image) VALUES (?,?,?,?,?,?,?)').run(
    name, type, parseInt(price), parseInt(capacity), description || '',
    JSON.stringify(amenities || []),
    image || 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800'
  );
  res.json({ success: true, message: 'Thêm phòng thành công!', room: { id: result.lastInsertRowid } });
});

app.delete('/api/rooms/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Không có quyền!' });
  const info = db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy!' });
  res.json({ success: true, message: 'Xóa phòng thành công!' });
});

// ============ BOOKINGS ============
app.post('/api/bookings', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'user') return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để đặt phòng!' });
  const { roomId, checkIn, checkOut, guests } = req.body;
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return res.status(404).json({ success: false, message: 'Phòng không tồn tại!' });
  const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
  if (nights <= 0) return res.status(400).json({ success: false, message: 'Ngày không hợp lệ!' });

  const totalPrice = room.price * nights;
  db.prepare('INSERT INTO bookings (userId, userName, roomId, roomName, checkIn, checkOut, guests, totalPrice, status) VALUES (?,?,?,?,?,?,?,?,?)').run(
    req.session.user.id, req.session.user.fullName, room.id, room.name, checkIn, checkOut, parseInt(guests), totalPrice, 'pending'
  );
  res.json({ success: true, message: 'Đặt phòng thành công!' });
});

app.get('/api/bookings/my', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const bookings = db.prepare('SELECT * FROM bookings WHERE userId = ? ORDER BY id DESC').all(req.session.user.id);
  res.json({ success: true, bookings });
});

app.get('/api/bookings', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });
  const bookings = db.prepare('SELECT * FROM bookings ORDER BY id DESC').all();
  res.json({ success: true, bookings });
});

app.put('/api/bookings/:id/status', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });
  const info = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy!' });
  res.json({ success: true, message: 'Cập nhật thành công!' });
});

app.delete('/api/bookings/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Xóa thành công!' });
});

// ============ ADMIN STATS ============
app.get('/api/admin/stats', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });
  const totalRooms = db.prepare('SELECT COUNT(*) as c FROM rooms').get().c;
  const totalBookings = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(totalPrice),0) as s FROM bookings WHERE status='confirmed'").get().s;
  const pendingBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='pending'").get().c;
  const confirmedBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='confirmed'").get().c;
  const cancelledBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='cancelled'").get().c;
  // Count rooms that are currently booked
  const bookedRooms = db.prepare("SELECT COUNT(DISTINCT roomId) as c FROM bookings WHERE status IN ('pending','confirmed')").get().c;

  res.json({ success: true, stats: { totalRooms, totalBookings, totalUsers, totalRevenue, pendingBookings, confirmedBookings, cancelledBookings, bookedRooms } });
});

// Admin: list all users
app.get('/api/admin/users', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });
  const users = db.prepare('SELECT id, fullName, username, phone, createdAt FROM users ORDER BY id DESC').all();
  // Attach booking count to each user
  const stmtCount = db.prepare('SELECT COUNT(*) as c FROM bookings WHERE userId = ?');
  const result = users.map(u => ({ ...u, bookingCount: stmtCount.get(u.id).c }));
  res.json({ success: true, users: result });
});

// ============ CHAT ============
app.post('/api/chat/send', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  const { message, toUserId } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ success: false, message: 'Tin nhắn trống!' });

  db.prepare('INSERT INTO chat_messages (fromUserId, fromUserName, fromRole, toUserId, message) VALUES (?,?,?,?,?)').run(
    req.session.user.id, req.session.user.fullName, req.session.user.role, toUserId || 0, message.trim()
  );
  res.json({ success: true });
});

app.get('/api/chat/messages/:userId', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const userId = parseInt(req.params.userId);

  if (req.session.user.role === 'user') {
    const msgs = db.prepare("SELECT * FROM chat_messages WHERE (fromUserId = ? AND fromRole = 'user') OR (toUserId = ? AND fromRole = 'admin') ORDER BY id").all(req.session.user.id, req.session.user.id);
    return res.json({ success: true, messages: msgs });
  }

  const msgs = db.prepare("SELECT * FROM chat_messages WHERE (fromUserId = ? AND fromRole = 'user') OR (toUserId = ? AND fromRole = 'admin') ORDER BY id").all(userId, userId);
  res.json({ success: true, messages: msgs });
});

app.get('/api/chat/conversations', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });
  const convs = db.prepare(`
    SELECT DISTINCT fromUserId as userId, fromUserName as userName
    FROM chat_messages WHERE fromRole = 'user'
    GROUP BY fromUserId
    ORDER BY MAX(id) DESC
  `).all();

  const result = convs.map(c => {
    const lastMsg = db.prepare("SELECT message, timestamp FROM chat_messages WHERE (fromUserId = ? AND fromRole = 'user') OR (toUserId = ? AND fromRole = 'admin') ORDER BY id DESC LIMIT 1").get(c.userId, c.userId);
    const total = db.prepare("SELECT COUNT(*) as c FROM chat_messages WHERE (fromUserId = ? AND fromRole = 'user') OR (toUserId = ? AND fromRole = 'admin')").get(c.userId, c.userId).c;
    return { ...c, lastMessage: lastMsg ? lastMsg.message : '', lastTime: lastMsg ? lastMsg.timestamp : '', totalMessages: total };
  });
  res.json({ success: true, conversations: result });
});

// ============ PAGES ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login-user.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login-admin.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard-user.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard-admin.html')));

app.listen(PORT, () => {
  console.log(`\n🏨 Booking Website is running!`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`💾 Database: booking.db (SQLite)`);
  console.log(`\n📧 Demo User: user1 / 123456`);
  console.log(`📧 Demo Admin: admin / admin\n`);
});
