import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config, PORT } from './config/env.js';
import { connectDB } from './config/database.js';
import logger from './config/logger.js';

const HOST = process.env.HOST || 'localhost';
const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development, enable in production
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: config.nodeEnv === 'production'
    ? ['http://lovelovelove.click']
    : ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting - different limits for different endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.env === 'development' ? 1000 : 100, // Higher limit in dev mode
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
    },
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.env === 'development' ? 50 : 5, // Higher limit in dev mode
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 15 phút',
    },
  },
});

app.use('/api/', apiLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// Body parsing with UTF-8 support
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  parameterLimit: 50000
}));
app.use(cookieParser(config.cookieSecret));

// Set default charset to UTF-8 for all responses
app.use((req, res, next) => {
  res.charset = 'utf-8';
  // Override res.json to ensure UTF-8
  const originalJson = res.json;
  res.json = function (data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson.call(this, data);
  };
  // Override res.render to ensure UTF-8
  const originalRender = res.render;
  res.render = function (view, options, callback) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return originalRender.call(this, view, options, callback);
  };
  next();
});

// Mode detection removed (English system deleted)

// Input sanitization
import { sanitizeInput, trimInputs } from './middlewares/sanitize.js';
app.use(sanitizeInput);
app.use(trimInputs);

// User data sanitization (for display)
import { sanitizeUserData } from './middlewares/sanitizeUserData.js';
app.use(sanitizeUserData);

// Logging
// Morgan HTTP request logger with Winston stream
app.use(morgan('combined', { stream: logger.stream }));

// Static files & views
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', './src/views');

// API Routes
import apiRoutes from './routes/index.js';
app.use('/api/v1', apiRoutes);

// English Learning System REMOVED

// Import web auth middleware
import { requireAuth, redirectIfAuthenticated } from './middlewares/webAuth.js';

// Logout route - MUST be before other routes to work properly
app.get('/logout', (req, res) => {
  console.log('🔴 /logout route HIT!');
  console.log('🔴 Cookies before clear:', req.cookies);

  // Clear accessToken with all possible options
  res.clearCookie('accessToken');
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    path: '/'
  });

  // Clear refreshToken with all possible options
  res.clearCookie('refreshToken');
  res.clearCookie('refreshToken', { path: '/' });
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    path: '/'
  });

  console.log('🔴 Cookies cleared, redirecting to /login');

  // Redirect to login page
  return res.redirect('/login?message=' + encodeURIComponent('Đăng xuất thành công'));
});

// English Learning Web Routes REMOVED

// Web Routes
// Homepage - Render unified landing page
app.get('/', (req, res) => {
  res.render('pages/index', {
    title: 'QLHS - School Operating System',
    user: req.user
  });
});

// Auth pages - redirect to dashboard if already logged in
app.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('pages/login', {
    title: 'Đăng nhập',
    error: req.query.error,
    message: req.query.message
  });
});

app.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('pages/register', { title: 'Đăng ký' });
});

// Protected routes - require authentication
app.get('/dashboard', requireAuth, (req, res) => {
  // Redirect based on role
  if (req.user.role === 'admin') {
    return res.render('pages/dashboard', {
      title: 'Dashboard',
      user: req.user
    });
  } else {
    // Redirect non-admin users to app home
    return res.redirect('/app/home');
  }
});

app.get('/students', requireAuth, (req, res) => {
  res.render('pages/students', {
    title: 'Danh sách Học sinh',
    user: req.user
  });
});

app.get('/classes', requireAuth, (req, res) => {
  res.render('pages/classes', {
    title: 'Danh sách Lớp học',
    user: req.user
  });
});

app.get('/classes/create', requireAuth, (req, res) => {
  res.render('pages/class-form', {
    title: 'Tạo lớp học mới',
    user: req.user,
    mode: 'create',
    classId: null,
  });
});

app.get('/classes/:id/edit', requireAuth, (req, res) => {
  res.render('pages/class-form', {
    title: 'Chỉnh sửa lớp học',
    user: req.user,
    mode: 'edit',
    classId: req.params.id,
  });
});

app.get('/classes/:id', requireAuth, (req, res) => {
  res.render('pages/class-detail', {
    title: 'Chi tiết lớp học',
    user: req.user,
    classId: req.params.id,
  });
});

app.get('/attendance', requireAuth, (req, res) => {
  res.render('pages/attendance', {
    title: 'Điểm danh',
    user: req.user
  });
});

app.get('/attendance/report', requireAuth, (req, res) => {
  res.render('pages/attendance-report', {
    title: 'Báo cáo Chuyên cần',
    user: req.user
  });
});

app.get('/scores', requireAuth, (req, res) => {
  res.render('pages/scores', {
    title: 'Nhập điểm',
    user: req.user
  });
});

app.get('/fees', requireAuth, (req, res) => {
  res.render('pages/fees', {
    title: 'Quản lý Học phí',
    user: req.user
  });
});

app.get('/payments', requireAuth, (req, res) => {
  res.render('pages/payments', {
    title: 'Quản lý Thanh toán',
    user: req.user
  });
});

// ==================== APP ROUTES (User UI) ====================
// Home page for authenticated users (teacher, student, parent)
app.get('/app/home', requireAuth, async (req, res) => {
  try {
    // Redirect admin to admin dashboard
    if (req.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }

    // Fetch overview data from API
    const overviewResponse = await fetch(`http://localhost:${PORT}/api/v1/app/overview`, {
      headers: {
        'Cookie': req.headers.cookie || ''
      }
    });

    let overview = {};
    if (overviewResponse.ok) {
      const data = await overviewResponse.json();
      overview = data.data || {};
    }

    res.render('pages/app/home', {
      title: 'Trang chủ',
      user: req.user,
      overview,
      currentPage: 'home'
    });
  } catch (error) {
    console.error('App home error:', error);
    res.render('pages/app/home', {
      title: 'Trang chủ',
      user: req.user,
      overview: {},
      currentPage: 'home'
    });
  }
});

// Student profile page
app.get('/app/profile', requireAuth, (req, res) => {
  if (req.user.role !== 'student' && req.user.role !== 'admin') {
    return res.redirect('/app/home');
  }

  res.render('pages/app/profile', {
    title: 'Hồ Sơ Học Sinh',
    user: req.user,
    currentPage: 'profile'
  });
});

// Student scores page
app.get('/app/scores', requireAuth, (req, res) => {
  if (req.user.role !== 'student' && req.user.role !== 'admin') {
    return res.redirect('/app/home');
  }

  res.render('pages/app/scores', {
    title: 'Điểm Số',
    user: req.user,
    currentPage: 'scores'
  });
});

// Student attendance page
app.get('/app/attendance', requireAuth, (req, res) => {
  if (req.user.role !== 'student' && req.user.role !== 'admin') {
    return res.redirect('/app/home');
  }

  res.render('pages/app/attendance', {
    title: 'Điểm Danh',
    user: req.user,
    currentPage: 'attendance'
  });
});

// Teacher classes page
app.get('/app/classes', requireAuth, (req, res) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.redirect('/app/home');
  }

  res.render('pages/app/classes', {
    title: 'Lớp Học',
    user: req.user,
    currentPage: 'classes'
  });
});

// Student CRUD web routes
app.get('/students/create', requireAuth, (req, res) => {
  res.render('pages/student-form', {
    title: 'Thêm học sinh mới',
    user: req.user,
    student: null,
    mode: 'create'
  });
});

app.get('/students/:id/edit', requireAuth, (req, res) => {
  res.render('pages/student-form', {
    title: 'Chỉnh sửa học sinh',
    user: req.user,
    student: { _id: req.params.id },
    mode: 'edit'
  });
});

app.get('/students/:id', requireAuth, (req, res) => {
  res.render('pages/student-detail', {
    title: 'Thông tin học sinh',
    user: req.user,
    studentId: req.params.id
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import error handlers
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

// 404 handler for web routes (render page)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.status(404).render('pages/404', { title: '404' });
});

// 404 handler for API routes
app.use('/api/*', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start
async function start() {
  try {
    if (config.nodeEnv !== 'test') {
      await connectDB().catch(() => {
        logger.warn('Không thể kết nối MongoDB. Ứng dụng sẽ chạy tạm thời không có cơ sở dữ liệu.');
        logger.warn('Vui lòng khởi động MongoDB hoặc cập nhật MONGODB_URI trong file .env.');
      });
    }

    const listenOnPort = (port, host) =>
      new Promise((resolve, reject) => {
        const srv = app
          .listen(port, host, () => resolve(srv))
          .once('error', reject);
      });

    const maxAttempts = 5;
    let currentPort = config.port;
    let server = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        server = await listenOnPort(currentPort, HOST);
        config.port = currentPort;
        process.env.PORT = String(currentPort);
        logger.info(`Server đang chạy tại http://${HOST}:${currentPort}`);
        logger.info(`Môi trường: ${config.nodeEnv}`);
        break;
      } catch (error) {
        if (error.code === 'EADDRINUSE') {
          const nextPort = currentPort + 1;
          logger.warn(`Cổng ${currentPort} đang được sử dụng. Đang thử với cổng ${nextPort}...`);
          currentPort = nextPort;
          continue;
        }
        throw error;
      }
    }

    if (!server) {
      throw new Error('Không thể khởi động server sau nhiều lần thử.');
    }

    process.on('SIGTERM', async () => {
      logger.warn('Nhận tín hiệu SIGTERM, đang dừng ứng dụng an toàn...');
      server.close(async () => {
        logger.info('HTTP server đã dừng');
        const { disconnectDB } = await import('./config/database.js');
        await disconnectDB();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.warn('Nhận tín hiệu SIGINT, đang dừng ứng dụng an toàn...');
      server.close(async () => {
        logger.info('HTTP server đã dừng');
        const { disconnectDB } = await import('./config/database.js');
        await disconnectDB();
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Lỗi khởi động:', error);
    process.exit(1);
  }
}

start();
