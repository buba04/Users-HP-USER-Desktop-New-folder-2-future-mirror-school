const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

const router = express.Router();

// Track failed login attempts
const trackFailedLogin = (username, ip) => {
  db.run('INSERT INTO failed_logins (username, ip_address) VALUES (?, ?)', [username, ip]);
  
  // Check for suspicious activity (5+ failed attempts in last 15 minutes)
  db.get(`SELECT COUNT(*) as count FROM failed_logins 
    WHERE (username = ? OR ip_address = ?) 
    AND attempt_time > datetime('now', '-15 minutes')`, 
    [username, ip], (err, result) => {
      if (result && result.count >= 5) {
        console.warn(`⚠️ Security Alert: ${result.count} failed login attempts from ${ip} for user ${username}`);
      }
    });
};

// Login with security enhancements
router.post('/login', auditLog('LOGIN_ATTEMPT'), (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!username || !password) {
    trackFailedLogin(username || 'unknown', ip);
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      trackFailedLogin(username, ip);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      trackFailedLogin(username, ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) {
        trackFailedLogin(username, ip);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Successful login
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Log successful login
      db.run('INSERT INTO audit_logs (action, user_id, username, ip_address, method, path, status_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['LOGIN_SUCCESS', user.id, user.username, ip, 'POST', '/api/auth/login', 200]);

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    });
  });
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    }
  });
});

module.exports = router;
