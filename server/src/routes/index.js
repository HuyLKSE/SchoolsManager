import express from 'express';
import authRoutes from './auth.js';
import studentRoutes from './students.js';
import classRoutes from './classes.js';
import attendanceRoutes from './attendance.js';
import subjectRoutes from './subjects.js';
import scoreRoutes from './scores.js';
import feeRoutes from './fees.js';
import paymentRoutes from './payments.js';
import adminRoutes from './admin.js';
import appRoutes from './app.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/app', appRoutes); // NEW: User routes (teacher, student, parent)
router.use('/admin', adminRoutes);
router.use('/students', studentRoutes);
router.use('/classes', classRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/subjects', subjectRoutes);
router.use('/scores', scoreRoutes);
router.use('/fees', feeRoutes);
router.use('/payments', paymentRoutes);

router.get('/', (req, res) => {
  res.json({
    message: 'QLHS API v1',
    endpoints: {
      auth: '/api/v1/auth',
      app: '/api/v1/app (teacher, student, parent)',
      admin: '/api/v1/admin (admin only)',
      students: '/api/v1/students',
      classes: '/api/v1/classes',
      attendance: '/api/v1/attendance',
      subjects: '/api/v1/subjects',
      scores: '/api/v1/scores',
      fees: '/api/v1/fees',
      payments: '/api/v1/payments'
    }
  });
});

export default router;
