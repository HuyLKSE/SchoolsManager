import express from 'express';
import {
  getPayments,
  createPaymentRecord,
  recordPayment,
  getStudentPaymentStatus,
  getPaymentReport,
  deletePayment,
  bulkCreatePayments,
  getOverduePayments,
  getFinancialStatistics,
  applyDiscount,
} from '../controllers/paymentController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import { validate, recordPaymentSchema } from '../middlewares/validate.js';
import { auditLog } from '../middlewares/audit.js';

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authenticate);

// GET /api/v1/payments - Danh sách thanh toán (require canViewAll)
router.get('/', requirePermission('canViewAll'), getPayments);

// GET /api/v1/payments/student/:studentId - Trạng thái thanh toán của học sinh (require canViewAll)
router.get('/student/:studentId', requirePermission('canViewAll'), getStudentPaymentStatus);

// GET /api/v1/payments/report - Báo cáo thu chi (require canViewAll)
router.get('/report', requirePermission('canViewAll'), getPaymentReport);

// GET /api/v1/payments/overdue - Danh sách quá hạn (require canViewAll)
router.get('/overdue', requirePermission('canViewAll'), getOverduePayments);

// GET /api/v1/payments/statistics - Thống kê tài chính (require canViewAll)
router.get('/statistics', requirePermission('canViewAll'), getFinancialStatistics);

// GET /api/v1/payments/statistics/financial - Alias for statistics (dashboard compatibility)
router.get('/statistics/financial', requirePermission('canViewAll'), getFinancialStatistics);

// POST /api/v1/payments/create - Tạo bản ghi thanh toán (require canCreate)
router.post('/create', requirePermission('canCreate'), auditLog('PAYMENT_CREATE', 'Payment'), createPaymentRecord);

// POST /api/v1/payments/bulk-create - Tạo bản ghi hàng loạt (require canCreate)
router.post('/bulk-create', requirePermission('canCreate'), auditLog('PAYMENT_BULK_CREATE', 'Payment'), bulkCreatePayments);

// POST /api/v1/payments/record - Ghi nhận thanh toán (require canUpdate)
router.post('/record', requirePermission('canUpdate'), validate(recordPaymentSchema), auditLog('PAYMENT_RECORD', 'Payment'), recordPayment);

// POST /api/v1/payments/apply-discount - Áp dụng giảm giá (require canUpdate)
router.post('/apply-discount', requirePermission('canUpdate'), auditLog('PAYMENT_DISCOUNT', 'Payment'), applyDiscount);

// DELETE /api/v1/payments/:id - Xóa bản ghi (require canDelete)
router.delete('/:id', requirePermission('canDelete'), auditLog('PAYMENT_DELETE', 'Payment'), deletePayment);

export default router;
