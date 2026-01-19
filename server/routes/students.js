const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const db = require('../database');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'photo') {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/jpg') {
      cb(null, true);
    } else {
      cb(new Error('Photo must be JPG or PNG format'), false);
    }
  } else if (file.fieldname === 'birthCertificate') {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Birth certificate must be PDF, JPG, or PNG'), false);
    }
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  },
  fileFilter: fileFilter
});

// Validation rules
const validateStudent = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('sex').isIn(['Male', 'Female']).withMessage('Sex must be Male or Female'),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('religion').isIn(['Christianity', 'Islam', 'Traditional', 'Others']).withMessage('Valid religion is required'),
  body('classEnrolled').notEmpty().withMessage('Class to be enrolled is required'),
  body('parentName').trim().notEmpty().withMessage('Parent/Guardian name is required'),
  body('parentPhone').matches(/^(\+234|0)[0-9]{10}$/).withMessage('Valid Nigerian phone number is required'),
  body('homeAddress').trim().notEmpty().withMessage('Home address is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('lga').trim().notEmpty().withMessage('Local Government Area is required'),
  body('consentGiven').equals('true').withMessage('Consent must be given'),
  body('parentSignature').trim().notEmpty().withMessage('Parent signature is required')
];

// Register new student
router.post('/register', upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'birthCertificate', maxCount: 1 }
]), validateStudent, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    firstName, middleName, lastName, sex, dateOfBirth, religion, religionOther,
    classEnrolled, parentName, parentPhone, alternativePhone, email,
    homeAddress, state, lga, hasMedicalCondition, medicalConditionDetails,
    hasDisability, disabilityType, disabilityDetails, emergencyInstructions,
    consentGiven, parentSignature, academicSession
  } = req.body;

  const photoPath = req.files?.photo ? req.files.photo[0].path.replace(/\\/g, '/') : null;
  const birthCertificatePath = req.files?.birthCertificate ? req.files.birthCertificate[0].path.replace(/\\/g, '/') : null;

  const sql = `INSERT INTO students (
    first_name, middle_name, last_name, sex, date_of_birth, religion, religion_other,
    class_enrolled, photo_path, birth_certificate_path, parent_name, parent_phone,
    alternative_phone, email, home_address, state, lga, has_medical_condition,
    medical_condition_details, has_disability, disability_type, disability_details,
    emergency_instructions, consent_given, parent_signature, academic_session
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [
    firstName, middleName || null, lastName, sex, dateOfBirth, religion, religionOther || null,
    classEnrolled, photoPath, birthCertificatePath, parentName, parentPhone,
    alternativePhone || null, email || null, homeAddress, state, lga,
    hasMedicalCondition === 'true' ? 1 : 0, medicalConditionDetails || null,
    hasDisability === 'true' ? 1 : 0, disabilityType || null, disabilityDetails || null,
    emergencyInstructions || null, consentGiven === 'true' ? 1 : 0, parentSignature,
    academicSession || new Date().getFullYear() + '/' + (new Date().getFullYear() + 1)
  ], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to register student' });
    }

    res.status(201).json({
      message: 'Student registered successfully',
      studentId: this.lastID
    });
  });
});

// Get all students (for admin)
router.get('/', (req, res) => {
  const { class: classFilter, gender, search } = req.query;
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

  if (search) {
    sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR parent_name LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  sql += ' ORDER BY submitted_at DESC';

  db.all(sql, params, (err, students) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Convert file paths to URLs
    const studentsWithUrls = students.map(student => ({
      ...student,
      photoUrl: student.photo_path ? `/uploads/${path.basename(student.photo_path)}` : null,
      birthCertificateUrl: student.birth_certificate_path ? `/uploads/${path.basename(student.birth_certificate_path)}` : null
    }));

    res.json(studentsWithUrls);
  });
});

// Get single student
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM students WHERE id = ?', [req.params.id], (err, student) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    student.photoUrl = student.photo_path ? `/uploads/${path.basename(student.photo_path)}` : null;
    student.birthCertificateUrl = student.birth_certificate_path ? `/uploads/${path.basename(student.birth_certificate_path)}` : null;

    res.json(student);
  });
});

module.exports = router;
