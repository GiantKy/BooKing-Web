const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// ============ DATABASE PATH ============
// Database is stored in data/ folder (separate from code)
// This ensures data persists even when code is updated or server/ is modified
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'booking.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ============ AUTO BACKUP ============
// Create a backup every time the server starts (keep last 5 backups)
function createBackup() {
  if (!fs.existsSync(DB_PATH)) return;
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `booking_backup_${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  
  try {
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`💾 Backup created: ${backupName}`);
    
    // Keep only last 5 backups
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('booking_backup_') && f.endsWith('.db'))
      .sort()
      .reverse();
    
    if (backups.length > 5) {
      for (let i = 5; i < backups.length; i++) {
        fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
      }
      console.log(`🗑️  Old backups cleaned (kept last 5)`);
    }
  } catch (e) {
    console.warn('⚠️  Backup failed:', e.message);
  }
}

// Create backup before opening database
createBackup();

// ============ OPEN DATABASE ============
const db = new Database(DB_PATH);

// Enable WAL mode for better performance & crash safety
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============ CREATE TABLES (IF NOT EXISTS) ============
// These only create tables if they don't already exist
// Existing data is NEVER deleted or modified
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

// ============ SEED DEFAULT DATA (only on first run) ============
// This ONLY inserts data when tables are completely empty
// Once users/admins/rooms exist, this function does NOTHING
function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    console.log('📝 First run detected - creating demo user...');
    const insertUser = db.prepare('INSERT INTO users (fullName, username, password) VALUES (?, ?, ?)');
    insertUser.run('Nguyen Van A', 'user1', bcrypt.hashSync('123456', 10));
  }

  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (adminCount === 0) {
    console.log('📝 First run detected - creating admin account...');
    const insertAdmin = db.prepare('INSERT INTO admins (fullName, username, password) VALUES (?, ?, ?)');
    insertAdmin.run('Admin Master', 'admin', bcrypt.hashSync('admin', 10));
  }

  const roomCount = db.prepare('SELECT COUNT(*) as c FROM rooms').get().c;
  if (roomCount === 0) {
    console.log('📝 First run detected - creating demo rooms...');
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

// Log database stats on startup
const stats = {
  users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  admins: db.prepare('SELECT COUNT(*) as c FROM admins').get().c,
  rooms: db.prepare('SELECT COUNT(*) as c FROM rooms').get().c,
  bookings: db.prepare('SELECT COUNT(*) as c FROM bookings').get().c,
  messages: db.prepare('SELECT COUNT(*) as c FROM chat_messages').get().c,
};
console.log(`📊 Database loaded: ${stats.users} users, ${stats.admins} admins, ${stats.rooms} rooms, ${stats.bookings} bookings, ${stats.messages} messages`);

module.exports = db;
