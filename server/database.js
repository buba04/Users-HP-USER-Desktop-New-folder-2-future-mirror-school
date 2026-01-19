const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
console.log('Initializing database at:', dbPath);

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Database file opened/created successfully');
  }
});

// Initialize database
db.serialize(() => {
  // Users table (Admin/Staff)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Students table
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    sex TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    religion TEXT NOT NULL,
    religion_other TEXT,
    class_enrolled TEXT NOT NULL,
    photo_path TEXT,
    birth_certificate_path TEXT,
    parent_name TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    alternative_phone TEXT,
    email TEXT,
    home_address TEXT NOT NULL,
    state TEXT NOT NULL,
    lga TEXT NOT NULL,
    has_medical_condition INTEGER DEFAULT 0,
    medical_condition_details TEXT,
    has_disability INTEGER DEFAULT 0,
    disability_type TEXT,
    disability_details TEXT,
    emergency_instructions TEXT,
    consent_given INTEGER DEFAULT 0,
    parent_signature TEXT NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    academic_session TEXT,
    created_by INTEGER,
    updated_at DATETIME,
    is_deleted INTEGER DEFAULT 0
  )`);

  // Audit logs table
  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    user_id INTEGER,
    username TEXT,
    ip_address TEXT,
    user_agent TEXT,
    method TEXT,
    path TEXT,
    status_code INTEGER,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Failed login attempts table
  db.run(`CREATE TABLE IF NOT EXISTS failed_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    ip_address TEXT,
    attempt_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create default admin user (username: admin, password: admin123)
  const defaultPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) 
    VALUES (?, ?, ?)`, ['admin', defaultPassword, 'admin'], (err) => {
    if (err) {
      console.error('Error creating default admin:', err);
    } else {
      console.log('Default admin user created (username: admin, password: admin123)');
    }
  });
});

module.exports = db;
