const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Initialize database connection
const db = require('./database');

// Security middleware
const { 
  securityHeaders, 
  apiLimiter, 
  authLimiter, 
  registrationLimiter,
  sqlSanitize 
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware (apply first)
app.use(securityHeaders);
app.use(sqlSanitize); // Prevent SQL injection

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Apply rate limiting
app.use('/api/', apiLimiter);

// Routes with specific rate limiting
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/students/register', registrationLimiter, require('./routes/students'));
app.use('/api/students', require('./routes/students'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/users', require('./routes/users'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Future Mirror School API is running' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Prevent directory listing in development
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (req, res) => {
    res.send(`
      <html>
        <head><title>Future Mirror School API</title></head>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>🎓 Future Mirror School API</h1>
          <p>Backend server is running on port ${PORT}</p>
          <p><strong>⚠️ This is the backend API server.</strong></p>
          <p>To view the application, open the <strong>frontend</strong> at:</p>
          <p style="font-size: 20px; color: #0ea5e9;">
            <a href="http://localhost:3000" style="color: #0ea5e9;">http://localhost:3000</a>
          </p>
          <hr>
          <p>API Endpoints:</p>
          <ul style="text-align: left; display: inline-block;">
            <li><a href="/api/health">/api/health</a> - Health check</li>
            <li><a href="/api/auth/login">/api/auth/login</a> - Login</li>
            <li>/api/students - Student management</li>
            <li>/api/admin - Admin routes</li>
          </ul>
        </body>
      </html>
    `);
  });
}

// Test database connection
db.get('SELECT 1', (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  } else {
    console.log('✓ Database connected successfully');
    
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Future Mirror School API: http://localhost:${PORT}`);
      console.log(`✓ Frontend should be available at: http://localhost:3000`);
      console.log(`✓ Default admin: username=admin, password=admin123`);
    });
  }
});
