import express from 'express';
import {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getClassStudents,
  getClassStatistics,
} from '../controllers/classController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import { validate, createClassSchema, updateClassSchema } from '../middlewares/validate.js';

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authenticate);

// GET /api/v1/classes - Danh sách lớp học (require canViewAll)
router.get('/', requirePermission('canViewAll'), getClasses);

// GET /api/v1/classes/statistics - Thống kê lớp học (require canViewAll)
router.get('/statistics', requirePermission('canViewAll'), getClassStatistics);

// GET /api/v1/classes/:id - Chi tiết lớp học (require canViewAll)
router.get('/:id', requirePermission('canViewAll'), getClassById);

// GET /api/v1/classes/:id/students - Danh sách học sinh trong lớp (require canViewAll)
router.get('/:id/students', requirePermission('canViewAll'), getClassStudents);

// POST /api/v1/classes - Tạo lớp học mới (require canCreate)
router.post('/', requirePermission('canCreate'), validate(createClassSchema), createClass);

// PUT /api/v1/classes/:id - Cập nhật lớp học (require canUpdate)
router.put('/:id', requirePermission('canUpdate'), validate(updateClassSchema), updateClass);

// DELETE /api/v1/classes/:id - Xóa lớp học (require canDelete)
router.delete('/:id', requirePermission('canDelete'), deleteClass);

export default router;
