import express from 'express';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { User } from '../models/User.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Score from '../models/Score.js';
import Attendance from '../models/Attendance.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { cache } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';

const router = express.Router();

// Apply authentication to all /app routes
router.use(authenticate);

// ==================== APP OVERVIEW (for all users) ====================
router.get('/overview', async (req, res) => {
  try {
    const cacheKey = cacheKeys.userOverview(req.user._id.toString());

    const overview = await cache.wrap(cacheKey, 30 * 1000, async () => {
      const schoolId = req.user.schoolId;
      const role = req.user.role;

      const payload = {
        role,
        username: req.user.username,
        fullName: req.user.fullName,
        schoolId,
      };

      if (role === 'teacher') {
        const classCount = await Class.countDocuments({
          schoolId,
          homeroomTeacher: req.user._id,
        });
        payload.managedClasses = classCount;
      } else if (role === 'student') {
        if (req.user.studentId) {
          const student = await Student.findById(req.user.studentId)
            .populate('classId', 'className classCode');

          if (student) {
            payload.student = {
              studentCode: student.studentCode,
              fullName: student.fullName,
              class: student.classId,
            };

            const recentScores = await Score.find({
              studentId: req.user.studentId,
            })
              .sort({ createdAt: -1 })
              .limit(5)
              .populate('subjectId', 'subjectName');

            payload.recentScores = recentScores;
          }
        }
      } else if (role === 'parent') {
        payload.children = [];
      }

      return payload;
    });

    successResponse(res, overview, 'Lay thong tin tong quan thanh cong');
  } catch (error) {
    console.error('App overview error:', error);
    errorResponse(res, 'Loi lay thong tin tong quan', error.message, 500);
  }
});


// ==================== TEACHER ROUTES ====================
// Get classes managed by teacher
router.get('/teacher/classes', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    
    const classes = await Class.find({ 
      schoolId,
      homeroomTeacher: req.user._id 
    })
      .populate('homeroomTeacher', 'fullName username')
      .sort({ grade: 1, className: 1 });
    
    successResponse(res, classes, `Tìm thấy ${classes.length} lớp`);
  } catch (error) {
    console.error('Get teacher classes error:', error);
    errorResponse(res, 'Lỗi lấy danh sách lớp', error.message, 500);
  }
});

// ==================== STUDENT ROUTES ====================
// Get student profile
router.get('/student/profile', requireRole('student', 'admin'), async (req, res) => {
  try {
    if (!req.user.studentId) {
      return errorResponse(res, 'Tài khoản chưa liên kết học sinh', 'NO_STUDENT_LINK', 404);
    }
    
    const student = await Student.findById(req.user.studentId)
      .populate('classId', 'className classCode grade');
    
    if (!student) {
      return errorResponse(res, 'Không tìm thấy thông tin học sinh', 'STUDENT_NOT_FOUND', 404);
    }
    
    successResponse(res, student, 'Lấy thông tin học sinh thành công');
  } catch (error) {
    console.error('Get student profile error:', error);
    errorResponse(res, 'Lỗi lấy thông tin học sinh', error.message, 500);
  }
});

// Get student scores
router.get('/student/scores', requireRole('student', 'admin'), async (req, res) => {
  try {
    if (!req.user.studentId) {
      return errorResponse(res, 'Tài khoản chưa liên kết học sinh', 'NO_STUDENT_LINK', 404);
    }
    
    const scores = await Score.find({ studentId: req.user.studentId })
      .populate('subjectId', 'subjectName subjectCode')
      .populate('classId', 'className')
      .sort({ semester: -1, createdAt: -1 });
    
    successResponse(res, scores, `Tìm thấy ${scores.length} kết quả học tập`);
  } catch (error) {
    console.error('Get student scores error:', error);
    errorResponse(res, 'Lỗi lấy điểm số', error.message, 500);
  }
});

// Get student attendance
router.get('/student/attendance', requireRole('student', 'admin'), async (req, res) => {
  try {
    if (!req.user.studentId) {
      return errorResponse(res, 'Tài khoản chưa liên kết học sinh', 'NO_STUDENT_LINK', 404);
    }
    
    const { month, year } = req.query;
    const query = { studentId: req.user.studentId };
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const attendance = await Attendance.find(query)
      .populate('classId', 'className')
      .sort({ date: -1 });
    
    successResponse(res, attendance, `Tìm thấy ${attendance.length} bản ghi điểm danh`);
  } catch (error) {
    console.error('Get student attendance error:', error);
    errorResponse(res, 'Lỗi lấy dữ liệu điểm danh', error.message, 500);
  }
});

// ==================== PARENT ROUTES ====================
// Get children list (for parent role)
router.get('/parent/children', requireRole('parent', 'admin'), async (req, res) => {
  try {
    // TODO: Implement parent-student linking
    // For now, return empty array
    successResponse(res, [], 'Chức năng đang phát triển');
  } catch (error) {
    console.error('Get children error:', error);
    errorResponse(res, 'Lỗi lấy danh sách con', error.message, 500);
  }
});

export default router;
