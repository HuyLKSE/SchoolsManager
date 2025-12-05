import express from 'express';
import {
  getSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../controllers/subjectController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import { validate, createSubjectSchema, updateSubjectSchema } from '../middlewares/validate.js';

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authenticate);

// GET /api/v1/subjects - Danh sách môn học (require canViewAll)
router.get('/', requirePermission('canViewAll'), getSubjects);

// GET /api/v1/subjects/:id - Chi tiết môn học (require canViewAll)
router.get('/:id', requirePermission('canViewAll'), getSubjectById);

// POST /api/v1/subjects - Tạo môn học (require canCreate)
router.post('/', requirePermission('canCreate'), validate(createSubjectSchema), createSubject);

// PUT /api/v1/subjects/:id - Cập nhật môn học (require canUpdate)
router.put('/:id', requirePermission('canUpdate'), validate(updateSubjectSchema), updateSubject);

// DELETE /api/v1/subjects/:id - Xóa môn học (require canDelete)
router.delete('/:id', requirePermission('canDelete'), deleteSubject);

export default router;
