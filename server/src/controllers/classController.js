import Class from '../models/Class.js';
import Student from '../models/Student.js';
import { successResponse, errorResponse, paginationResponse } from '../utils/response.js';
import { getPaginationParams } from '../utils/pagination.js';
import { invalidateSchoolMetrics } from '../utils/cacheKeys.js';
import { syncClassWorkspace, removeClassWorkspace } from '../services/workspaceService.js';

const CLASS_STATUS_MAP = {
  'dang hoat dong': 'Đang hoạt động',
  'đang hoạt động': 'Đang hoạt động',
  'dang họat độnng': 'Đang hoạt động',
  'đang họat độnng': 'Đang hoạt động',
  active: 'Đang hoạt động',
  'da ket thuc': 'Đã kết thúc',
  'đã kết thúc': 'Đã kết thúc',
  'da kết thúc': 'Đã kết thúc',
  ended: 'Đã kết thúc',
  'tam ngung': 'Tạm ngưng',
  'tạm ngưng': 'Tạm ngưng',
  'tạạm ngưng': 'Tạm ngưng',
  paused: 'Tạm ngưng',
};

const normalizeClassStatus = (status) => {
  if (!status) return undefined;
  const key = status.toString().trim().toLowerCase();
  return CLASS_STATUS_MAP[key] || status;
};

const ensureNameFields = (payload) => {
  if (payload.name && !payload.className) {
    payload.className = payload.name;
  }
  if (!payload.name && payload.className) {
    payload.name = payload.className;
  }
};

// Lấy danh sách lớp học
export const getClasses = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { grade, academicYear, status, search, sort = 'classCode' } = req.query;

    const filter = { schoolId: req.user.schoolId };

    if (grade) filter.grade = parseInt(grade, 10);
    if (academicYear) filter.academicYear = academicYear;
    if (status) filter.status = normalizeClassStatus(status);
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { className: { $regex: search, $options: 'i' } },
        { classCode: { $regex: search, $options: 'i' } },
      ];
    }

    const [classes, total] = await Promise.all([
      Class.find(filter)
        .populate('homeroomTeacher', 'fullName username')
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .lean(),
      Class.countDocuments(filter),
    ]);

    return paginationResponse(res, classes, { page, limit, total });
  } catch (error) {
    console.error('Get classes error:', error);
    return errorResponse(res, 'Lỗi khi lấy danh sách lớp học', 500);
  }
};

// Lấy chi tiết lớp học
export const getClassById = async (req, res) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    })
      .populate('homeroomTeacher', 'fullName username email phone')
      .populate({
        path: 'students',
        select: 'studentCode fullName dateOfBirth gender status',
      });

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    return successResponse(res, classDoc, 'Lấy thông tin lớp học thành công');
  } catch (error) {
    console.error('Get class error:', error);
    return errorResponse(res, 'Lỗi khi lấy thông tin lớp học', 500);
  }
};

// Tạo lớp học mới
export const createClass = async (req, res) => {
  try {
    const classData = {
      ...req.body,
      schoolId: req.user.schoolId,
    };
    ensureNameFields(classData);
    if (classData.status) {
      classData.status = normalizeClassStatus(classData.status);
    }
    
    // Clean empty fields and validate ObjectId format
    if (!classData.homeroomTeacher || classData.homeroomTeacher === '') {
      delete classData.homeroomTeacher;
    } else if (classData.homeroomTeacher) {
      // Check if it's a valid ObjectId (24 hex chars)
      if (!/^[0-9a-fA-F]{24}$/.test(classData.homeroomTeacher)) {
        delete classData.homeroomTeacher; // Not valid ObjectId, remove it
      }
    }
    if (!classData.classroom || classData.classroom === '') {
      delete classData.classroom;
    }
    if (!classData.notes || classData.notes === '') {
      delete classData.notes;
    }

    console.log('[DEBUG] classData before create:', JSON.stringify(classData, null, 2));

    const existingClass = await Class.findOne({
      classCode: classData.classCode,
      schoolId: req.user.schoolId,
    });
    if (existingClass) {
      return errorResponse(res, 'Mã lớp đã tồn tại', 400);
    }

    const classDoc = await Class.create(classData);
    console.log('[DEBUG] classDoc after create:', JSON.stringify({
      _id: classDoc._id,
      name: classDoc.name,
      className: classDoc.className,
      classCode: classDoc.classCode
    }, null, 2));
    try {
      await syncClassWorkspace(classDoc);
    } catch (workspaceError) {
      console.error('Sync class workspace failed:', workspaceError);
      console.error('Error stack:', workspaceError.stack);
      console.error('Class data:', JSON.stringify({
        classId: classDoc._id,
        schoolId: classDoc.schoolId,
        classCode: classDoc.classCode
      }));
      await Class.findByIdAndDelete(classDoc._id);
      return errorResponse(
        res,
        `Không thể khởi tạo workspace cho lớp học. Lỗi: ${workspaceError.message}`,
        500
      );
    }

    const populatedClass = await Class.findById(classDoc._id).populate(
      'homeroomTeacher',
      'fullName username'
    );

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, populatedClass, 'Tạo lớp học thành công', 201);
  } catch (error) {
    console.error('Create class error:', error);
    if (error.code === 11000) {
      return errorResponse(res, 'Mã lớp đã tồn tại', 400);
    }
    return errorResponse(res, 'Lỗi khi tạo lớp học', 500);
  }
};

// Cập nhật lớp học
export const updateClass = async (req, res) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    if (req.body.classCode && req.body.classCode !== classDoc.classCode) {
      const duplicate = await Class.findOne({
        classCode: req.body.classCode,
        schoolId: req.user.schoolId,
        _id: { $ne: classDoc._id },
      });
      if (duplicate) {
        return errorResponse(res, 'Mã lớp đã tồn tại', 400);
      }
    }

    if (req.body.capacity && req.body.capacity < classDoc.currentStudents) {
      return errorResponse(
        res,
        `Không thể giảm sĩ số xuống ${req.body.capacity}. Hiện có ${classDoc.currentStudents} học sinh trong lớp.`,
        400
      );
    }

    ensureNameFields(req.body);
    if (req.body.status) {
      req.body.status = normalizeClassStatus(req.body.status);
    }
    
    // Clean empty fields and validate ObjectId format
    if (req.body.homeroomTeacher === '' || req.body.homeroomTeacher === null) {
      req.body.homeroomTeacher = undefined;
    } else if (req.body.homeroomTeacher) {
      // Check if it's a valid ObjectId (24 hex chars)
      if (!/^[0-9a-fA-F]{24}$/.test(req.body.homeroomTeacher)) {
        req.body.homeroomTeacher = undefined; // Not valid ObjectId, remove it
      }
    }
    if (req.body.classroom === '') {
      req.body.classroom = undefined;
    }
    if (req.body.notes === '') {
      req.body.notes = undefined;
    }

    Object.assign(classDoc, req.body);
    await classDoc.save();
    try {
      await syncClassWorkspace(classDoc);
    } catch (workspaceError) {
      console.error('Sync class workspace failed:', workspaceError);
    }

    const updated = await Class.findById(classDoc._id).populate(
      'homeroomTeacher',
      'fullName username'
    );

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, updated, 'Cập nhật lớp học thành công');
  } catch (error) {
    console.error('Update class error:', error);
    if (error.code === 11000) {
      return errorResponse(res, 'Mã lớp đã tồn tại', 400);
    }
    return errorResponse(res, 'Lỗi khi cập nhật lớp học', 500);
  }
};

// Xóa lớp học
export const deleteClass = async (req, res) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    const studentCount = await Student.countDocuments({ classId: req.params.id });
    if (studentCount > 0) {
      return errorResponse(
        res,
        'Không thể xoá lớp còn học sinh. Vui lòng chuyển học sinh sang lớp khác trước.',
        400
      );
    }

    await Class.findByIdAndDelete(req.params.id);
    await removeClassWorkspace(classDoc._id, req.user.schoolId);

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, null, 'Xoá lớp học thành công');
  } catch (error) {
    console.error('Delete class error:', error);
    return errorResponse(res, 'Lỗi khi xoá lớp học', 500);
  }
};

// Lấy danh sách học sinh trong lớp
export const getClassStudents = async (req, res) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    const students = await Student.find({
      classId: req.params.id,
      schoolId: req.user.schoolId,
    })
      .select('studentCode fullName dateOfBirth gender status phone email')
      .sort('studentCode')
      .lean();

    return successResponse(res, students, 'Lấy danh sách học sinh thành công');
  } catch (error) {
    console.error('Get class students error:', error);
    return errorResponse(res, 'Lỗi khi lấy danh sách học sinh', 500);
  }
};

// Thống kê lớp học
export const getClassStatistics = async (req, res) => {
  try {
    const { academicYear, grade } = req.query;

    const filter = { schoolId: req.user.schoolId };
    if (academicYear) filter.academicYear = academicYear;
    if (grade) filter.grade = parseInt(grade, 10);

    const classes = await Class.find(filter)
      .populate('homeroomTeacher', 'fullName')
      .sort('grade classCode')
      .lean();

    const totalClasses = classes.length;
    const totalCapacity = classes.reduce((sum, c) => sum + c.capacity, 0);
    const totalStudents = classes.reduce((sum, c) => sum + c.currentStudents, 0);
    const avgStudentsPerClass = totalClasses > 0 ? (totalStudents / totalClasses).toFixed(1) : 0;

    const byGrade = classes.reduce((acc, cls) => {
      if (!acc[cls.grade]) {
        acc[cls.grade] = { count: 0, students: 0, capacity: 0 };
      }
      acc[cls.grade].count += 1;
      acc[cls.grade].students += cls.currentStudents;
      acc[cls.grade].capacity += cls.capacity;
      return acc;
    }, {});

    return successResponse(
      res,
      {
        totalClasses,
        totalCapacity,
        totalStudents,
        avgStudentsPerClass,
        occupancyRate: totalCapacity > 0 ? ((totalStudents / totalCapacity) * 100).toFixed(1) : 0,
        byGrade,
        classes,
      },
      'Lấy thống kê lớp học thành công'
    );
  } catch (error) {
    console.error('Get class statistics error:', error);
    return errorResponse(res, 'Lỗi khi lấy thống kê lớp học', 500);
  }
};
