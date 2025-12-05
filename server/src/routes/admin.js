import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/rbac.js';
import { User } from '../models/User.js';
import { School } from '../models/School.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Score from '../models/Score.js';
import Attendance from '../models/Attendance.js';
import Payment from '../models/Payment.js';
import AuditLog from '../models/AuditLog.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { getAllRolePresets, getPermissionsByRole, isValidRole } from '../utils/rolePresets.js';
import { cache } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';

const router = express.Router();

// Apply authentication + admin check to all /admin routes
router.use(authenticate, requireAdmin());

// ==================== ADMIN DASHBOARD ====================
router.get('/dashboard', async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const cacheKey = cacheKeys.dashboardStats(String(schoolId));

    const stats = await cache.wrap(cacheKey, 60 * 1000, async () => {
      const [totalUsers, totalStudents, totalClasses, totalPayments] = await Promise.all([
        User.countDocuments({ schoolId }),
        Student.countDocuments({ schoolId }),
        Class.countDocuments({ schoolId }),
        Payment.countDocuments({ schoolId }),
      ]);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const attendanceStats = await Attendance.aggregate([
        { $match: { schoolId, date: { $gte: weekStart } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const scoreStats = await Score.aggregate([
        { $match: { schoolId } },
        {
          $lookup: {
            from: 'students',
            localField: 'studentId',
            foreignField: '_id',
            as: 'student',
          },
        },
        { $unwind: '$student' },
        { $group: { _id: '$student.grade', avgScore: { $avg: '$finalScore' } } },
        { $sort: { _id: 1 } },
      ]);

      return {
        totalUsers,
        totalStudents,
        totalClasses,
        totalPayments,
        attendanceStats,
        scoreStats,
      };
    });

    res.render('pages/admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.user,
      stats,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).render('pages/500', { error: error.message });
  }
});

// ==================== USER MANAGEMENT ====================
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const schoolId = req.user.schoolId;
    
    const query = { schoolId };
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { fullName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.render('pages/admin/user-management', {
      title: 'Quản lý Người dùng',
      user: req.user,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('User management error:', error);
    res.status(500).render('pages/500', { error: error.message });
  }
});

// Lấy thông tin chi tiết user (cho modal phân quyền)
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findOne({ 
      _id: userId, 
      schoolId: req.user.schoolId 
    }).select('-password -refreshToken');
    
    if (!user) {
      return errorResponse(res, 'Không tìm thấy người dùng', 'USER_NOT_FOUND', 404);
    }
    
    return successResponse(res, user, 'Lấy thông tin người dùng thành công');
  } catch (error) {
    console.error('Get user error:', error);
    return errorResponse(res, 'Lỗi lấy thông tin người dùng', 'GET_USER_ERROR', 500);
  }
});

// Cập nhật quyền user
router.put('/users/:userId/permissions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { canCreate, canUpdate, canDelete, canViewAll, canManageUsers, canManageSchool } = req.body;
    
    const user = await User.findOne({ _id: userId, schoolId: req.user.schoolId });
    if (!user) {
      return errorResponse(res, 'Không tìm thấy người dùng', 'USER_NOT_FOUND', 404);
    }
    
    // Admin không thể tự xóa quyền admin của chính mình
    if (user._id.equals(req.user._id) && !canManageUsers) {
      return errorResponse(res, 'Không thể xóa quyền admin của chính bạn', 'CANNOT_MODIFY_SELF', 400);
    }
    
    // Save old permissions for audit log
    const oldPermissions = { ...user.permissions };
    
    const newPermissions = {
      canCreate: canCreate === 'true',
      canUpdate: canUpdate === 'true',
      canDelete: canDelete === 'true',
      canViewAll: canViewAll === 'true',
      canManageUsers: canManageUsers === 'true',
      canManageSchool: canManageSchool === 'true'
    };
    
    user.permissions = newPermissions;
    await user.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'PERMISSION_UPDATE',
      resourceType: 'User',
      resourceId: user._id,
      oldData: { permissions: oldPermissions },
      newData: { permissions: newPermissions },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      status: 'success',
      metadata: {
        targetUserEmail: user.email,
        targetUserRole: user.role
      },
      schoolId: req.user.schoolId
    });
    
    successResponse(res, user, 'Cập nhật quyền thành công');
  } catch (error) {
    console.error('Update permissions error:', error);
    errorResponse(res, 'Lỗi cập nhật quyền', error.message, 500);
  }
});

// Xóa user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findOne({ _id: userId, schoolId: req.user.schoolId });
    if (!user) {
      return errorResponse(res, 'Không tìm thấy người dùng', 'USER_NOT_FOUND', 404);
    }
    
    // Không cho phép xóa chính mình
    if (user._id.equals(req.user._id)) {
      return errorResponse(res, 'Không thể xóa tài khoản của chính bạn', 'CANNOT_DELETE_SELF', 400);
    }
    
    await user.deleteOne();
    
    successResponse(res, null, 'Xóa người dùng thành công');
  } catch (error) {
    console.error('Delete user error:', error);
    errorResponse(res, 'Lỗi xóa người dùng', error.message, 500);
  }
});

// ==================== SCHOOL SETTINGS ====================
router.get('/school-settings', async (req, res) => {
  try {
    const school = await School.findById(req.user.schoolId).lean();
    if (!school) {
      return res.status(404).render('pages/404');
    }
    
    // Ensure settings.grades exists (fix undefined error)
    if (!school.settings) {
      school.settings = {};
    }
    if (!school.settings.grades || !Array.isArray(school.settings.grades)) {
      school.settings.grades = [10, 11, 12];
    }
    
    // Map subscription data from flat schema to nested object for view
    const now = new Date();
    const expiresAt = school.subscriptionExpiresAt || now;
    const isExpired = expiresAt < now;
    
    school.subscription = {
      status: isExpired ? 'expired' : (school.subscriptionPlan === 'free' ? 'trial' : 'active'),
      plan: school.subscriptionPlan || 'free',
      startDate: school.createdAt || now,
      endDate: expiresAt,
      maxUsers: school.subscriptionPlan === 'enterprise' ? 0 : 
                school.subscriptionPlan === 'premium' ? 500 :
                school.subscriptionPlan === 'basic' ? 100 : 50
    };
    
    res.render('pages/admin/school-settings', {
      title: 'Cài đặt Trường',
      user: req.user,
      school
    });
  } catch (error) {
    console.error('School settings error:', error);
    res.status(500).render('pages/500', { error: error.message });
  }
});

// Cập nhật thông tin trường
router.put('/school-settings', async (req, res) => {
  try {
    const { schoolName, address, phone, email, principalName, website, academicYear, grades } = req.body;
    
    const school = await School.findById(req.user.schoolId);
    if (!school) {
      return errorResponse(res, 'Không tìm thấy trường', 'SCHOOL_NOT_FOUND', 404);
    }
    
    school.schoolName = schoolName || school.schoolName;
    school.address = address || school.address;
    school.phone = phone || school.phone;
    school.email = email || school.email;
    school.principalName = principalName || school.principalName;
    school.website = website || school.website;
    
    if (academicYear) school.settings.academicYear = academicYear;
    if (grades) school.settings.grades = grades.split(',').map(g => g.trim());
    
    await school.save();
    
    successResponse(res, school, 'Cập nhật thông tin trường thành công');
  } catch (error) {
    console.error('Update school error:', error);
    errorResponse(res, 'Lỗi cập nhật thông tin trường', error.message, 500);
  }
});

// ==================== USER APPROVAL ====================
// Get pending user approvals
router.get('/users/pending', async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    
    const pendingUsers = await User.find({ 
      schoolId, 
      isActive: false 
    })
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });
    
    return successResponse(res, pendingUsers, `Tìm thấy ${pendingUsers.length} tài khoản chờ phê duyệt`);
  } catch (error) {
    console.error('Get pending users error:', error);
    return errorResponse(res, 'Lỗi lấy danh sách chờ phê duyệt', error.message, 500);
  }
});

// Approve user (activate + optionally promote to admin)
router.post('/users/:userId/approve', async (req, res) => {
  try {
    const { userId } = req.params;
    const { promoteToAdmin } = req.body;
    const schoolId = req.user.schoolId;
    
    const user = await User.findOne({ _id: userId, schoolId });
    
    if (!user) {
      return errorResponse(res, 'Không tìm thấy người dùng', 'USER_NOT_FOUND', 404);
    }
    
    if (user.isActive) {
      return errorResponse(res, 'Người dùng đã được kích hoạt', 'ALREADY_ACTIVE', 400);
    }
    
    // Activate user
    user.isActive = true;
    
    // Promote to admin if requested
    if (promoteToAdmin === true) {
      user.role = 'admin';
    }
    
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshToken;
    
    return successResponse(
      res,
      userResponse, 
      promoteToAdmin ? 'Đã phê duyệt và thăng cấp thành Admin' : 'Đã phê duyệt tài khoản'
    );
  } catch (error) {
    console.error('Approve user error:', error);
    return errorResponse(res, 'Lỗi phê duyệt người dùng', error.message, 500);
  }
});

// Reject user (delete account)
router.post('/users/:userId/reject', async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const schoolId = req.user.schoolId;
    
    const user = await User.findOne({ _id: userId, schoolId });
    
    if (!user) {
      return errorResponse(res, 'Không tìm thấy người dùng', 'USER_NOT_FOUND', 404);
    }
    
    if (user.isActive) {
      return errorResponse(res, 'Không thể từ chối người dùng đã kích hoạt', 'ALREADY_ACTIVE', 400);
    }
    
    // Delete the user
    await User.deleteOne({ _id: userId });
    
    // TODO: Send notification email to user about rejection (optional)
    
    return successResponse(
      res,
      { userId, reason }, 
      'Đã từ chối và xóa tài khoản'
    );
  } catch (error) {
    console.error('Reject user error:', error);
    return errorResponse(res, 'Lỗi từ chối người dùng', error.message, 500);
  }
});

// ==================== BULK ACTIONS ====================
// Import students from CSV
router.post('/bulk-import/students', async (req, res) => {
  try {
    const { students } = req.body; // Mảng students từ CSV parse
    
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json(errorResponse('Dữ liệu import không hợp lệ'));
    }
    
    const schoolId = req.user.schoolId;
    const importedStudents = [];
    const errors = [];
    
    for (let i = 0; i < students.length; i++) {
      try {
        const studentData = { ...students[i], schoolId };
        const student = new Student(studentData);
        await student.save();
        importedStudents.push(student);
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }
    
    res.json(successResponse({
      imported: importedStudents.length,
      failed: errors.length,
      errors
    }, `Import thành công ${importedStudents.length}/${students.length} học sinh`));
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json(errorResponse('Lỗi bulk import', error.message));
  }
});

// ==================== ROLE PRESETS & BULK PERMISSIONS ====================

// Lấy danh sách role presets
router.get('/role-presets', async (req, res) => {
  try {
    const presets = getAllRolePresets();
    return successResponse(res, presets, 'Lấy danh sách role presets thành công');
  } catch (error) {
    console.error('Get role presets error:', error);
    return errorResponse(res, 'Lỗi lấy danh sách role presets', 'GET_PRESETS_ERROR', 500);
  }
});

// Áp dụng role preset cho user (quick assign)
router.post('/users/:userId/apply-role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!isValidRole(role)) {
      return errorResponse(res, 'Role không hợp lệ', 'INVALID_ROLE', 400);
    }
    
    const user = await User.findOne({ _id: userId, schoolId: req.user.schoolId });
    if (!user) {
      return errorResponse(res, 'Không tìm thấy người dùng', 'USER_NOT_FOUND', 404);
    }
    
    // Save old state for audit
    const oldRole = user.role;
    const oldPermissions = { ...user.permissions };
    
    // Cập nhật role và permissions tự động sync qua pre-save hook
    user.role = role;
    await user.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'ROLE_APPLY',
      resourceType: 'User',
      resourceId: user._id,
      oldData: { role: oldRole, permissions: oldPermissions },
      newData: { role: user.role, permissions: user.permissions },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      status: 'success',
      metadata: {
        targetUserEmail: user.email,
        rolePresetApplied: role
      },
      schoolId: req.user.schoolId
    });
    
    return successResponse(res, user, `Áp dụng vai trò ${role} thành công`);
  } catch (error) {
    console.error('Apply role error:', error);
    return errorResponse(res, 'Lỗi áp dụng vai trò', 'APPLY_ROLE_ERROR', 500);
  }
});

// Bulk update permissions cho nhiều users
router.post('/users/bulk-permissions', async (req, res) => {
  try {
    const { userIds, permissions, role } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return errorResponse(res, 'Danh sách userIds không hợp lệ', 'INVALID_USER_IDS', 400);
    }
    
    // Nếu có role, áp dụng role preset
    let permissionsToApply = permissions;
    if (role && isValidRole(role)) {
      permissionsToApply = getPermissionsByRole(role);
    }
    
    // Cập nhật nhiều users cùng lúc
    const result = await User.updateMany(
      { 
        _id: { $in: userIds }, 
        schoolId: req.user.schoolId,
        _id: { $ne: req.user._id } // Không cho phép tự cập nhật chính mình
      },
      { 
        $set: { 
          permissions: permissionsToApply,
          ...(role && { role }) // Cập nhật role nếu có
        } 
      }
    );
    
    // Audit Log for bulk update
    await AuditLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'PERMISSION_BULK_UPDATE',
      resourceType: 'User',
      resourceId: null, // Multiple users
      oldData: null, // Too many users to track individual old data
      newData: { permissions: permissionsToApply, role: role || null },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      status: 'success',
      metadata: {
        userIds: userIds,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        roleApplied: role || 'custom'
      },
      schoolId: req.user.schoolId
    });
    
    return successResponse(
      res, 
      { 
        matchedCount: result.matchedCount, 
        modifiedCount: result.modifiedCount 
      }, 
      `Cập nhật quyền cho ${result.modifiedCount} người dùng thành công`
    );
  } catch (error) {
    console.error('Bulk update permissions error:', error);
    return errorResponse(res, 'Lỗi cập nhật quyền hàng loạt', 'BULK_UPDATE_ERROR', 500);
  }
});

// ==================== AUDIT LOGS ====================

// Lấy audit logs của user cụ thể (permission changes history)
router.get('/users/:userId/audit-logs', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, page = 1 } = req.query;
    
    // Verify user belongs to same school
    const user = await User.findOne({ _id: userId, schoolId: req.user.schoolId });
    if (!user) {
      return errorResponse(res, 'Không tìm thấy người dùng', 'USER_NOT_FOUND', 404);
    }
    
    // Get permission-related audit logs for this user
    const logs = await AuditLog.find({
      resourceId: userId,
      action: { $in: ['PERMISSION_UPDATE', 'ROLE_APPLY', 'USER_APPROVE', 'USER_REJECT'] },
      schoolId: req.user.schoolId
    })
    .populate('userId', 'fullName email role')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await AuditLog.countDocuments({
      resourceId: userId,
      action: { $in: ['PERMISSION_UPDATE', 'ROLE_APPLY', 'USER_APPROVE', 'USER_REJECT'] },
      schoolId: req.user.schoolId
    });
    
    return successResponse(res, {
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    }, 'Lấy lịch sử phân quyền thành công');
  } catch (error) {
    console.error('Get audit logs error:', error);
    return errorResponse(res, 'Lỗi lấy lịch sử phân quyền', 'GET_AUDIT_LOGS_ERROR', 500);
  }
});

// Lấy tất cả audit logs (permission-related)
router.get('/audit-logs/permissions', async (req, res) => {
  try {
    const { limit = 50, page = 1, action } = req.query;
    
    const filter = {
      schoolId: req.user.schoolId,
      action: { $in: ['PERMISSION_UPDATE', 'PERMISSION_BULK_UPDATE', 'ROLE_APPLY'] }
    };
    
    if (action) {
      filter.action = action;
    }
    
    const logs = await AuditLog.find(filter)
      .populate('userId', 'fullName email role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await AuditLog.countDocuments(filter);
    
    return successResponse(res, {
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    }, 'Lấy audit logs thành công');
  } catch (error) {
    console.error('Get audit logs error:', error);
    return errorResponse(res, 'Lỗi lấy audit logs', 'GET_AUDIT_LOGS_ERROR', 500);
  }
});

export default router;
