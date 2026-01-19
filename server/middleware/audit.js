const db = require('../database');

// Audit log middleware
const auditLog = (action, details = {}) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log after response is sent
      const userId = req.user?.id || null;
      const username = req.user?.username || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent') || 'unknown';
      const timestamp = new Date().toISOString();
      
      // Create audit log entry
      const logEntry = {
        action,
        userId,
        username,
        ip,
        userAgent,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        details: JSON.stringify(details),
        timestamp
      };
      
      // Insert into audit_logs table
      db.run(`INSERT INTO audit_logs (
        action, user_id, username, ip_address, user_agent, 
        method, path, status_code, details, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        logEntry.action,
        logEntry.userId,
        logEntry.username,
        logEntry.ip,
        logEntry.userAgent,
        logEntry.method,
        logEntry.path,
        logEntry.statusCode,
        logEntry.details,
        logEntry.timestamp
      ], (err) => {
        if (err) {
          console.error('Audit log error:', err);
        }
      });
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// Get audit logs
const getAuditLogs = (req, res) => {
  const { limit = 100, offset = 0, action, userId } = req.query;
  
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  
  if (action) {
    sql += ' AND action = ?';
    params.push(action);
  }
  
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  db.all(sql, params, (err, logs) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
    res.json(logs);
  });
};

module.exports = { auditLog, getAuditLogs };
