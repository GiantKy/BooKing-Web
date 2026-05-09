const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'booking.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ============ CREATE TABLES ============
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    price INTEGER NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 2,
    description TEXT DEFAULT '',
    amenities TEXT DEFAULT '[]',
    image TEXT DEFAULT '',
    available INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    userName TEXT NOT NULL,
    roomId INTEGER NOT NULL,
    roomName TEXT NOT NULL,
    checkIn TEXT NOT NULL,
    checkOut TEXT NOT NULL,
    guests INTEGER DEFAULT 2,
    totalPrice INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (roomId) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fromUserId INTEGER NOT NULL,
    fromUserName TEXT NOT NULL,
    fromRole TEXT NOT NULL,
    toUserId INTEGER DEFAULT 0,
    message TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now'))
  );
`);

// ============ SEED DATA ============
function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (fullName, username, password) VALUES (?, ?, ?)');
    insertUser.run('Nguyen Van A', 'user1', bcrypt.hashSync('123456', 10));
  }

  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (adminCount === 0) {
    const insertAdmin = db.prepare('INSERT INTO admins (fullName, username, password) VALUES (?, ?, ?)');
    insertAdmin.run('Admin Master', 'admin', bcrypt.hashSync('admin', 10));
  }

  const roomCount = db.prepare('SELECT COUNT(*) as c FROM rooms').get().c;
  if (roomCount === 0) {
    const insertRoom = db.prepare('INSERT INTO rooms (name, type, price, capacity, description, amenities, image) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const rooms = [
      ['Phòng Deluxe Ocean View', 'Deluxe', 2500000, 2, 'Phòng sang trọng với tầm nhìn ra biển, nội thất cao cấp, ban công riêng.', '["WiFi","Điều hòa","Minibar","Ban công","Bồn tắm"]', 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800'],
      ['Phòng Superior City View', 'Superior', 1800000, 2, 'Phòng tiện nghi với view thành phố, thiết kế hiện đại.', '["WiFi","Điều hòa","Minibar","TV 55\\""]', 'https://images.unsplash.com/photo-1590490360182-c33d955c4644?w=800'],
      ['Phòng Family Suite', 'Suite', 4200000, 4, 'Suite rộng rãi cho gia đình, 2 phòng ngủ, phòng khách riêng.', '["WiFi","Điều hòa","Minibar","Bếp nhỏ","Phòng khách","Ban công"]', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800'],
      ['Phòng Standard Twin', 'Standard', 1200000, 2, 'Phòng tiêu chuẩn với 2 giường đơn, phù hợp cho bạn bè.', '["WiFi","Điều hòa","TV 42\\""]', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800'],
      ['Phòng Presidential Suite', 'Presidential', 8500000, 4, 'Suite tổng thống đẳng cấp nhất, 120m², butler riêng.', '["WiFi","Điều hòa","Minibar","Jacuzzi","Phòng khách","Butler"]', 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800'],
      ['Phòng Honeymoon Suite', 'Suite', 5500000, 2, 'Suite lãng mạn dành cho cặp đôi, hoa tươi và nến thơm.', '["WiFi","Điều hòa","Minibar","Jacuzzi","Ban công"]', 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800'],
    ];
    for (const r of rooms) insertRoom.run(...r);

    // Seed a demo booking
    const insertBooking = db.prepare('INSERT INTO bookings (userId, userName, roomId, roomName, checkIn, checkOut, guests, totalPrice, status) VALUES (?,?,?,?,?,?,?,?,?)');
    insertBooking.run(1, 'Nguyen Van A', 1, 'Phòng Deluxe Ocean View', '2026-05-15', '2026-05-18', 2, 7500000, 'confirmed');
  }
}

seedData();

// ============ HELPER: parse room amenities ============
function parseRoom(row) {
  if (!row) return null;
  return { ...row, amenities: JSON.parse(row.amenities || '[]'), available: !!row.available };
}

module.exports = db;
