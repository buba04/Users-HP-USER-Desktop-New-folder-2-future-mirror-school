const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Password strength validation
const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

// Get all users
router.get('/', auditLog('VIEW_USERS'), (req, res) => {
  db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC', [], (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Create new user
router.post('/', 
  auditLog('CREATE_USER'),
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').custom((value) => {
      if (!validatePassword(value)) {
        throw new Error('Password must be at least 8 characters with uppercase, lowercase, and number');
      }
      return true;
    }),
    body('role').isIn(['admin', 'staff']).withMessage('Role must be admin or staff')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, role } = req.body;

    // Check if username exists
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, existing) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // Hash password
      const hashedPassword = bcrypt.hashSync(password, 10);

      // Create user
      db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, hashedPassword, role], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create user' });
          }

          res.status(201).json({
            message: 'User created successfully',
            user: {
              id: this.lastID,
              username,
              role
            }
          });
        });
    });
  }
);

// Update user password
router.put('/:id/password',
  auditLog('CHANGE_PASSWORD'),
  [
    body('password').custom((value) => {
      if (!validatePassword(value)) {
        throw new Error('Password must be at least 8 characters with uppercase, lowercase, and number');
      }
      return true;
    })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;
    const userId = req.params.id;

    // Prevent changing own password through this route (use change-password route)
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: 'Use /change-password to change your own password' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: 'Password updated successfully' });
    });
  }
);

// Change own password
router.put('/change-password',
  auditLog('CHANGE_OWN_PASSWORD'),
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').custom((value) => {
      if (!validatePassword(value)) {
        throw new Error('Password must be at least 8 characters with uppercase, lowercase, and number');
      }
      return true;
    })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Verify current password
    db.get('SELECT password FROM users WHERE id = ?', [userId], (err, user) => {
      if (err || !user) {
        return res.status(500).json({ error: 'Database error' });
      }

      bcrypt.compare(currentPassword, user.password, (err, isMatch) => {
        if (err || !isMatch) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Update password
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to update password' });
          }

          res.json({ message: 'Password changed successfully' });
        });
      });
    });
  }
);

// Delete user
router.delete('/:id', auditLog('DELETE_USER'), (req, res) => {
  const userId = req.params.id;

  // Prevent deleting yourself
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  });
});

module.exports = router;
