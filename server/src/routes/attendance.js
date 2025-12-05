import express from 'express';
import {
  getAttendances,
  markClassAttendance,
  getClassAttendanceByDate,
  getStudentAttendanceReport,
  getClassAttendanceReport,
  deleteAttendance,
  getAttendanceStatistics,
} from '../controllers/attendanceController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import { validate, markAttendanceSchema } from '../middlewares/validate.js';

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authenticate);

// GET /api/v1/attendance - Danh sách điểm danh (require canViewAll)
router.get('/', requirePermission('canViewAll'), getAttendances);

// GET /api/v1/attendance/statistics - Thống kê chuyên cần (require canViewAll)
router.get('/statistics', requirePermission('canViewAll'), getAttendanceStatistics);

// GET /api/v1/attendance/class - Lấy bảng điểm danh lớp theo ngày (require canViewAll)
router.get('/class', requirePermission('canViewAll'), getClassAttendanceByDate);

// POST /api/v1/attendance/mark - Điểm danh cho cả lớp (require canCreate)
router.post('/mark', requirePermission('canCreate'), validate(markAttendanceSchema), markClassAttendance);

// GET /api/v1/attendance/student/:studentId/report - Báo cáo chuyên cần học sinh (require canViewAll)
router.get('/student/:studentId/report', requirePermission('canViewAll'), getStudentAttendanceReport);

// GET /api/v1/attendance/class/:classId/report - Báo cáo chuyên cần lớp (require canViewAll)
router.get('/class/:classId/report', requirePermission('canViewAll'), getClassAttendanceReport);

// DELETE /api/v1/attendance/:id - Xóa điểm danh (require canDelete)
router.delete('/:id', requirePermission('canDelete'), deleteAttendance);

export default router;
