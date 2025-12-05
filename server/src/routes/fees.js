import express from 'express';
import {
  getFees,
  getFeeById,
  createFee,
  updateFee,
  deleteFee,
} from '../controllers/feeController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authenticate);

// GET /api/v1/fees - Danh sách khoản phí (require canViewAll)
router.get('/', requirePermission('canViewAll'), getFees);

// GET /api/v1/fees/:id - Chi tiết khoản phí (require canViewAll)
router.get('/:id', requirePermission('canViewAll'), getFeeById);

// POST /api/v1/fees - Tạo khoản phí (require canCreate)
router.post('/', requirePermission('canCreate'), createFee);

// PUT /api/v1/fees/:id - Cập nhật khoản phí (require canUpdate)
router.put('/:id', requirePermission('canUpdate'), updateFee);

// DELETE /api/v1/fees/:id - Xóa khoản phí (require canDelete)
router.delete('/:id', requirePermission('canDelete'), deleteFee);

export default router;
