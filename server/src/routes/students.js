import express from 'express';
import {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
  getStudentStatistics,
  transferStudent,
} from '../controllers/studentController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import { validate, createStudentSchema, updateStudentSchema } from '../middlewares/validate.js';
import { auditLog } from '../middlewares/audit.js';
import { uploadExcel, handleUploadError } from '../middlewares/upload.js';

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authenticate);

// GET /api/v1/students - Danh sách học sinh (require canViewAll)
router.get('/', requirePermission('canViewAll'), getStudents);

// GET /api/v1/students/statistics - Thống kê học sinh (require canViewAll)
router.get('/statistics', requirePermission('canViewAll'), getStudentStatistics);

// GET /api/v1/students/:id - Chi tiết học sinh (require canViewAll)
router.get('/:id', requirePermission('canViewAll'), getStudentById);

// POST /api/v1/students - Tạo học sinh mới (require canCreate)
router.post('/', requirePermission('canCreate'), validate(createStudentSchema), auditLog('STUDENT_CREATE', 'Student'), createStudent);

// POST /api/v1/students/bulk-import - Import nhiều học sinh (require canCreate)
router.post('/bulk-import', requirePermission('canCreate'), auditLog('STUDENT_BULK_IMPORT', 'Student'), bulkImportStudents);
router.post('/import', requirePermission('canCreate'), uploadExcel, handleUploadError, auditLog('STUDENT_IMPORT', 'Student'), bulkImportStudents);

// POST /api/v1/students/transfer - Chuyển lớp học sinh (require canUpdate)
router.post('/transfer', requirePermission('canUpdate'), auditLog('STUDENT_TRANSFER', 'Student'), transferStudent);

// PUT /api/v1/students/:id - Cập nhật học sinh (require canUpdate)
router.put('/:id', requirePermission('canUpdate'), validate(updateStudentSchema), auditLog('STUDENT_UPDATE', 'Student'), updateStudent);

// DELETE /api/v1/students/:id - Xóa học sinh (require canDelete)
router.delete('/:id', requirePermission('canDelete'), auditLog('STUDENT_DELETE', 'Student'), deleteStudent);

export default router;
