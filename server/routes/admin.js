const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const db = require('../database');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { auditLog, getAuditLogs } = require('../middleware/audit');

const router = express.Router();

// All admin routes require authentication
router.use(authenticateToken);
router.use(requireAdmin);

// Get dashboard statistics
router.get('/stats', auditLog('VIEW_STATS'), (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM students',
    byClass: 'SELECT class_enrolled, COUNT(*) as count FROM students GROUP BY class_enrolled',
    byGender: 'SELECT sex, COUNT(*) as count FROM students GROUP BY sex'
  };

  db.get(queries.total, [], (err, total) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    db.all(queries.byClass, [], (err, byClass) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.all(queries.byGender, [], (err, byGender) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          total: total.count,
          byClass: byClass,
          byGender: byGender
        });
      });
    });
  });
});

// Export to Excel
router.get('/export/excel', (req, res) => {
  const { class: classFilter, gender } = req.query;
  let sql = 'SELECT * FROM students WHERE 1=1';
  const params = [];

  if (classFilter) {
    sql += ' AND class_enrolled = ?';
    params.push(classFilter);
  }

  if (gender) {
    sql += ' AND sex = ?';
    params.push(gender);
  }

  sql += ' ORDER BY submitted_at DESC';

  db.all(sql, params, (err, students) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Students');

    // Add headers
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'First Name', key: 'first_name', width: 15 },
      { header: 'Middle Name', key: 'middle_name', width: 15 },
      { header: 'Last Name', key: 'last_name', width: 15 },
      { header: 'Sex', key: 'sex', width: 10 },
      { header: 'Date of Birth', key: 'date_of_birth', width: 15 },
      { header: 'Religion', key: 'religion', width: 15 },
      { header: 'Class', key: 'class_enrolled', width: 15 },
      { header: 'Parent Name', key: 'parent_name', width: 20 },
      { header: 'Parent Phone', key: 'parent_phone', width: 15 },
      { header: 'Email', key: 'email', width: 20 },
      { header: 'Address', key: 'home_address', width: 30 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'LGA', key: 'lga', width: 20 },
      { header: 'Medical Condition', key: 'has_medical_condition', width: 15 },
      { header: 'Disability', key: 'has_disability', width: 15 },
      { header: 'Submitted At', key: 'submitted_at', width: 20 }
    ];

    // Add data
    students.forEach(student => {
      worksheet.addRow({
        id: student.id,
        first_name: student.first_name,
        middle_name: student.middle_name || '',
        last_name: student.last_name,
        sex: student.sex,
        date_of_birth: student.date_of_birth,
        religion: student.religion,
        class_enrolled: student.class_enrolled,
        parent_name: student.parent_name,
        parent_phone: student.parent_phone,
        email: student.email || '',
        home_address: student.home_address,
        state: student.state,
        lga: student.lga,
        has_medical_condition: student.has_medical_condition ? 'Yes' : 'No',
        has_disability: student.has_disability ? 'Yes' : 'No',
        submitted_at: student.submitted_at
      });
    });

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=students.xlsx');

    workbook.xlsx.write(res).then(() => {
      res.end();
    }).catch(err => {
      res.status(500).json({ error: 'Failed to generate Excel file' });
    });
  });
});

// Export to PDF
router.get('/export/pdf/:id', (req, res) => {
  db.get('SELECT * FROM students WHERE id = ?', [req.params.id], (err, student) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=student-${student.id}.pdf`);

    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Future Mirror School', { align: 'center' });
    doc.fontSize(16).text('Student Registration Profile', { align: 'center' });
    doc.moveDown();

    // Student Photo (if available)
    if (student.photo_path && fs.existsSync(student.photo_path)) {
      doc.image(student.photo_path, 400, 100, { width: 100, height: 100 });
    }

    // Student Information
    doc.fontSize(14).text('Student Information', { underline: true });
    doc.fontSize(11);
    doc.text(`Full Name: ${student.first_name} ${student.middle_name || ''} ${student.last_name}`.trim());
    doc.text(`Sex: ${student.sex}`);
    doc.text(`Date of Birth: ${student.date_of_birth}`);
    doc.text(`Religion: ${student.religion}${student.religion_other ? ' - ' + student.religion_other : ''}`);
    doc.text(`Class: ${student.class_enrolled}`);
    doc.moveDown();

    // Parent Information
    doc.fontSize(14).text('Parent/Guardian Information', { underline: true });
    doc.fontSize(11);
    doc.text(`Name: ${student.parent_name}`);
    doc.text(`Phone: ${student.parent_phone}`);
    if (student.alternative_phone) doc.text(`Alternative Phone: ${student.alternative_phone}`);
    if (student.email) doc.text(`Email: ${student.email}`);
    doc.text(`Address: ${student.home_address}`);
    doc.text(`State: ${student.state}`);
    doc.text(`LGA: ${student.lga}`);
    doc.moveDown();

    // Health Information
    doc.fontSize(14).text('Health Information', { underline: true });
    doc.fontSize(11);
    doc.text(`Medical Condition: ${student.has_medical_condition ? 'Yes' : 'No'}`);
    if (student.medical_condition_details) {
      doc.text(`Details: ${student.medical_condition_details}`);
    }
    doc.text(`Disability: ${student.has_disability ? 'Yes' : 'No'}`);
    if (student.disability_type) {
      doc.text(`Type: ${student.disability_type}`);
    }
    if (student.disability_details) {
      doc.text(`Details: ${student.disability_details}`);
    }
    if (student.emergency_instructions) {
      doc.text(`Emergency Instructions: ${student.emergency_instructions}`);
    }
    doc.moveDown();

    // Footer
    doc.fontSize(10).text(`Submitted: ${student.submitted_at}`, { align: 'center' });
    doc.text(`Parent Signature: ${student.parent_signature}`, { align: 'center' });

    doc.end();
  });
});

// Get audit logs
router.get('/audit-logs', auditLog('VIEW_AUDIT_LOGS'), (req, res) => {
  getAuditLogs(req, res);
});

// Get security alerts (failed login attempts)
router.get('/security-alerts', auditLog('VIEW_SECURITY_ALERTS'), (req, res) => {
  const { hours = 24 } = req.query;
  
  db.all(`SELECT username, ip_address, COUNT(*) as attempts, MAX(attempt_time) as last_attempt
    FROM failed_logins 
    WHERE attempt_time > datetime('now', '-' || ? || ' hours')
    GROUP BY username, ip_address
    HAVING attempts >= 3
    ORDER BY attempts DESC`, [hours], (err, alerts) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(alerts);
  });
});

// Get recent activity
router.get('/recent-activity', auditLog('VIEW_RECENT_ACTIVITY'), (req, res) => {
  const limit = req.query.limit || 50;
  
  db.all(`SELECT * FROM audit_logs 
    ORDER BY timestamp DESC 
    LIMIT ?`, [limit], (err, activities) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(activities);
  });
});

module.exports = router;
