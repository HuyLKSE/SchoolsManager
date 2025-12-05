import express from 'express';
import {
  getScores,
  enterScores,
  updateScore,
  deleteScore,
  getClassScoresBySubject,
  getStudentTranscript,
  lockScores,
  unlockScores,
  getClassRanking,
  getScoreStatistics,
  exportScores,
} from '../controllers/scoreController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import { validate, enterScoresSchema, updateScoreSchema } from '../middlewares/validate.js';
import { auditLog } from '../middlewares/audit.js';

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authenticate);

// GET /api/v1/scores - Danh sách điểm (require canViewAll)
router.get('/', requirePermission('canViewAll'), getScores);

// GET /api/v1/scores/class - Lấy bảng điểm lớp theo môn (require canViewAll)
router.get('/class', requirePermission('canViewAll'), getClassScoresBySubject);

// GET /api/v1/scores/ranking - Xếp hạng học lực lớp (require canViewAll)
router.get('/ranking', requirePermission('canViewAll'), getClassRanking);

// GET /api/v1/scores/statistics - Thống kê điểm số (require canViewAll)
router.get('/statistics', requirePermission('canViewAll'), getScoreStatistics);

// GET /api/v1/scores/export - Xuất điểm (canViewAll)
router.get('/export', requirePermission('canViewAll'), exportScores);

// POST /api/v1/scores/enter - Nhập điểm (require canCreate)
router.post('/enter', requirePermission('canCreate'), validate(enterScoresSchema), auditLog('SCORE_ENTER', 'Score'), enterScores);

// PUT /api/v1/scores/:id - Cập nhật điểm (require canUpdate)
router.put('/:id', requirePermission('canUpdate'), validate(updateScoreSchema), auditLog('SCORE_UPDATE', 'Score'), updateScore);

// DELETE /api/v1/scores/:id - Xóa điểm (require canDelete)
router.delete('/:id', requirePermission('canDelete'), auditLog('SCORE_DELETE', 'Score'), deleteScore);

// GET /api/v1/scores/student/:studentId/transcript - Học bạ học sinh (require canViewAll)
router.get('/student/:studentId/transcript', requirePermission('canViewAll'), getStudentTranscript);

// POST /api/v1/scores/lock - Khóa điểm (require canUpdate)
router.post('/lock', requirePermission('canUpdate'), auditLog('SCORE_LOCK', 'Score'), lockScores);

// POST /api/v1/scores/unlock - Mở khóa điểm (require canUpdate)
router.post('/unlock', requirePermission('canUpdate'), auditLog('SCORE_UNLOCK', 'Score'), unlockScores);

export default router;
