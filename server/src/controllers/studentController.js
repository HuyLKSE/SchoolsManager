import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { successResponse, errorResponse, paginationResponse } from '../utils/response.js';
import { withTransactionRetry } from '../utils/transaction.js';
import xlsx from 'xlsx';
import { getPaginationParams } from '../utils/pagination.js';
import { invalidateSchoolMetrics } from '../utils/cacheKeys.js';
import { normalizeGender, normalizeStudentStatus } from '../constants/student.js';
import { ensureClassWorkspaceId } from '../services/workspaceService.js';

const normalizeStudentPayload = (
  payload,
  { genderRequired = true, statusDefault = 'Đang học' } = {}
) => {
  const hasGenderField = Object.prototype.hasOwnProperty.call(payload, 'gender');
  if (hasGenderField) {
    const normalizedGender = normalizeGender(payload.gender);
    if (!normalizedGender) {
      return { success: false, code: 'INVALID_GENDER', message: 'Giới tính không hợp lệ' };
    }
    payload.gender = normalizedGender;
  } else if (genderRequired) {
    return { success: false, code: 'INVALID_GENDER', message: 'Giới tính là bắt buộc' };
  }

  const hasStatusField = Object.prototype.hasOwnProperty.call(payload, 'status');
  if (hasStatusField) {
    if (payload.status === undefined || payload.status === null || payload.status === '') {
      delete payload.status;
    } else {
      const normalizedStatus = normalizeStudentStatus(payload.status);
      if (!normalizedStatus) {
        return { success: false, code: 'INVALID_STATUS', message: 'Trạng thái học sinh không hợp lệ' };
      }
      payload.status = normalizedStatus;
    }
  } else if (statusDefault) {
    payload.status = statusDefault;
  }

  return { success: true };
};

// Lấy danh sách học sinh (có phân trang, lọc, tìm kiếm)
export const getStudents = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { classId, status, academicYear, search, sort = '-createdAt' } = req.query;

    const filter = { schoolId: req.user.schoolId };

    if (classId) filter.classId = classId;
    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { studentCode: { $regex: search, $options: 'i' } },
      ];
    }

    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate('classId', 'className classCode')
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .lean(),
      Student.countDocuments(filter),
    ]);

    return paginationResponse(res, students, {
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error('Get students error:', error);
    return errorResponse(res, 'Loi khi lay danh sach hoc sinh', 500);
  }
};
// Lấy chi tiết học sinh
export const getStudentById = async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    })
      .populate('classId', 'className classCode grade homeroomTeacher')
      .populate('userId', 'username email');

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    return successResponse(res, student, 'Lấy thông tin học sinh thành công');
  } catch (error) {
    console.error('Get student error:', error);
    return errorResponse(res, 'Lỗi khi lấy thông tin học sinh', 500);
  }
};

// Tạo học sinh mới
export const createStudent = async (req, res) => {
  try {
    const studentData = {
      ...req.body,
      schoolId: req.user.schoolId,
    };
    delete studentData.classWorkspaceId;

    // Clean up empty strings and nulls
    if (!studentData.classId || studentData.classId === '') {
      delete studentData.classId;
    }
    if (!studentData.academicYear || studentData.academicYear === '') {
      studentData.academicYear = new Date().getFullYear().toString();
    }

    const normalizedCreate = normalizeStudentPayload(studentData);
    if (!normalizedCreate.success) {
      return errorResponse(
        res,
        normalizedCreate.message,
        normalizedCreate.code,
        400
      );
    }

    // Kiểm tra mã học sinh trùng
    const existingStudent = await Student.findOne({
      studentCode: studentData.studentCode,
      schoolId: req.user.schoolId,
    });

    if (existingStudent) {
      return errorResponse(res, 'Mã học sinh đã tồn tại', 400);
    }

    // Nếu có classId, cập nhật sĩ số lớp và workspace
    if (studentData.classId) {
      const classDoc = await Class.findOne({
        _id: studentData.classId,
        schoolId: req.user.schoolId,
      });

      if (!classDoc) {
        return errorResponse(res, 'Không tìm thấy lớp học', 404);
      }

      if (classDoc.currentStudents >= classDoc.capacity) {
        return errorResponse(res, 'Lớp đã đủ sĩ số', 400);
      }

      const classWorkspaceId = await ensureClassWorkspaceId(
        classDoc._id,
        req.user.schoolId
      );

      if (!classWorkspaceId) {
        return errorResponse(res, 'Không thể đồng bộ workspace của lớp', 500);
      }

      studentData.classWorkspaceId = classWorkspaceId;

      await Class.findByIdAndUpdate(studentData.classId, {
        $inc: { currentStudents: 1 },
      });
    } else {
      delete studentData.classWorkspaceId;
    }

    const student = await Student.create(studentData);
    const populatedStudent = await Student.findById(student._id).populate(
      'classId',
      'className classCode'
    );

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, populatedStudent, 'Tạo học sinh thành công', 201);
  } catch (error) {
    console.error('Create student error:', error);
    if (error.code === 11000) {
      return errorResponse(res, 'Mã học sinh đã tồn tại', 400);
    }
    return errorResponse(res, 'Lỗi khi tạo học sinh', 500);
  }
};

// Cập nhật học sinh
export const updateStudent = async (req, res) => {
  try {
    const updates = { ...req.body };
    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    // Kiểm tra nếu đổi mã học sinh sang mã đã tồn tại
    if (updates.studentCode && updates.studentCode !== student.studentCode) {
      const duplicate = await Student.findOne({
        studentCode: updates.studentCode,
        schoolId: req.user.schoolId,
        _id: { $ne: student._id },
      });
      if (duplicate) {
        return errorResponse(res, 'Mã học sinh đã tồn tại', 400);
      }
    }

    delete updates.classWorkspaceId;
    const hasClassIdField = Object.prototype.hasOwnProperty.call(updates, 'classId');
    if (hasClassIdField) {
      const incomingClassId = updates.classId;

      if (!incomingClassId) {
        if (student.classId) {
          await Class.findByIdAndUpdate(student.classId, {
            $inc: { currentStudents: -1 },
          });
        }
        updates.classId = undefined;
        updates.classWorkspaceId = undefined;
      } else if (incomingClassId !== student.classId?.toString()) {
        if (student.classId) {
          await Class.findByIdAndUpdate(student.classId, {
            $inc: { currentStudents: -1 },
          });
        }

        const newClass = await Class.findOne({
          _id: incomingClassId,
          schoolId: req.user.schoolId,
        });

        if (!newClass) {
          return errorResponse(res, 'Không tìm thấy lớp học mới', 404);
        }

        if (newClass.currentStudents >= newClass.capacity) {
          if (student.classId) {
            await Class.findByIdAndUpdate(student.classId, {
              $inc: { currentStudents: 1 },
            });
          }
          return errorResponse(res, 'Lớp mới đã đủ sĩ số', 400);
        }

        const classWorkspaceId = await ensureClassWorkspaceId(
          newClass._id,
          req.user.schoolId
        );

        if (!classWorkspaceId) {
          if (student.classId) {
            await Class.findByIdAndUpdate(student.classId, {
              $inc: { currentStudents: 1 },
            });
          }
          return errorResponse(res, 'Không thể đồng bộ workspace của lớp', 500);
        }

        updates.classWorkspaceId = classWorkspaceId;

        await Class.findByIdAndUpdate(incomingClassId, {
          $inc: { currentStudents: 1 },
        });
      } else {
        delete updates.classId;
      }
    }

    const normalizedUpdate = normalizeStudentPayload(updates, {
      genderRequired: false,
      statusDefault: null,
    });
    if (!normalizedUpdate.success) {
      return errorResponse(
        res,
        normalizedUpdate.message,
        normalizedUpdate.code,
        400
      );
    }

    Object.assign(student, updates);
    await student.save();

    const updatedStudent = await Student.findById(student._id).populate(
      'classId',
      'className classCode'
    );

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, updatedStudent, 'Cập nhật học sinh thành công');
  } catch (error) {
    console.error('Update student error:', error);
    return errorResponse(res, 'Lỗi khi cập nhật học sinh', 500);
  }
};

// Xóa học sinh
export const deleteStudent = async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    // Giảm sĩ số lớp
    if (student.classId) {
      await Class.findByIdAndUpdate(student.classId, {
        $inc: { currentStudents: -1 },
      });
    }

    await Student.findByIdAndDelete(req.params.id);

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, null, 'Xóa học sinh thành công');
  } catch (error) {
    console.error('Delete student error:', error);
    return errorResponse(res, 'Lỗi khi xóa học sinh', 500);
  }
};

// Bulk import students from array
export const bulkImportStudents = async (req, res) => {
  try {
    let students = [];

    // Check if file uploaded
    if (req.file) {
      // Parse Excel file
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        return errorResponse(res, 'File Excel không có dữ liệu', 400);
      }

      // Map Excel columns to student fields
      students = jsonData.map(row => ({
        fullName: row['Họ tên'] || row['fullName'] || row['Ho ten'],
        studentCode: row['Mã HS'] || row['studentCode'] || row['Ma HS'],
        dateOfBirth: row['Ngày sinh'] || row['dateOfBirth'] || row['Ngay sinh'],
        gender: row['Giới tính'] || row['gender'] || row['Gioi tinh'],
        address: row['Địa chỉ'] || row['address'] || row['Dia chi'],
        email: row['Email'] || row['email'],
        phone: row['Số điện thoại'] || row['phone'] || row['So dien thoai'],
        status: row['Trạng thái'] || row['status'] || row['Trang thai'] || 'Đang học',
      }));
    } else if (req.body.students) {
      // Direct JSON array from body
      students = req.body.students;
    }

    if (!Array.isArray(students) || students.length === 0) {
      return errorResponse(res, 'Danh sách học sinh không hợp lệ', 400);
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < students.length; i++) {
      const studentData = students[i];
      delete studentData.classWorkspaceId;
      
      try {
        // Check duplicate studentCode
        const existing = await Student.findOne({
          studentCode: studentData.studentCode,
          schoolId: req.user.schoolId,
        });

        if (existing) {
          results.failed++;
          results.errors.push({
            index: i,
            studentCode: studentData.studentCode,
            error: 'Mã học sinh đã tồn tại',
          });
          continue;
        }

        // Validate and check class capacity if classId provided
        if (studentData.classId) {
          const classDoc = await Class.findOne({
            _id: studentData.classId,
            schoolId: req.user.schoolId,
          });

          if (!classDoc) {
            results.failed++;
            results.errors.push({
              index: i,
              studentCode: studentData.studentCode,
              error: 'Không tìm thấy lớp học',
            });
            continue;
          }

          if (classDoc.currentStudents >= classDoc.capacity) {
            results.failed++;
            results.errors.push({
              index: i,
              studentCode: studentData.studentCode,
              error: 'Lớp đã đủ sĩ số',
            });
            continue;
          }

          const classWorkspaceId = await ensureClassWorkspaceId(
            classDoc._id,
            req.user.schoolId
          );

          if (!classWorkspaceId) {
            results.failed++;
            results.errors.push({
              index: i,
              studentCode: studentData.studentCode,
              error: 'Không thể đồng bộ workspace của lớp',
            });
            continue;
          }

          studentData.classWorkspaceId = classWorkspaceId;

          // Increment class student count
          await Class.findByIdAndUpdate(classDoc._id, {
            $inc: { currentStudents: 1 },
          });
        }

        const normalizedImport = normalizeStudentPayload(studentData);
        if (!normalizedImport.success) {
          results.failed++;
          results.errors.push({
            index: i,
            studentCode: studentData.studentCode,
            error: normalizedImport.message,
          });
          continue;
        }

        // Create student
        await Student.create({
          ...studentData,
          schoolId: req.user.schoolId,
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i,
          studentCode: studentData.studentCode,
          error: error.message,
        });
      }
    }

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(
      res,
      results,
      `Import hoàn tất: ${results.success} thành công, ${results.failed} thất bại`
    );
  } catch (error) {
    console.error('Bulk import error:', error);
    return errorResponse(res, 'Lỗi khi import học sinh', 500);
  }
};

// Get student statistics
export const getStudentStatistics = async (req, res) => {
  try {
    const { academicYear, classId } = req.query;

    const filter = { schoolId: req.user.schoolId };
    if (academicYear) filter.academicYear = academicYear;
    if (classId) filter.classId = classId;

    const [total, byStatus, byGender, byClass] = await Promise.all([
      Student.countDocuments(filter),
      Student.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Student.aggregate([
        { $match: filter },
        { $group: { _id: '$gender', count: { $sum: 1 } } },
      ]),
      Student.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'classes',
            localField: 'classId',
            foreignField: '_id',
            as: 'class',
          },
        },
        { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$classId',
            className: { $first: '$class.className' },
            count: { $sum: 1 },
          },
        },
        { $sort: { className: 1 } },
      ]),
    ]);

    return successResponse(res, {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byGender: byGender.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byClass,
    }, 'Lấy thống kê học sinh thành công');
  } catch (error) {
    console.error('Get student statistics error:', error);
    return errorResponse(res, 'Lỗi khi lấy thống kê học sinh', 500);
  }
};

// ========== MONGODB TRANSACTIONS ==========

/**
 * Chuyển học sinh sang lớp khác (với transaction)
 * Đảm bảo atomic: cập nhật student + giảm sĩ số lớp cũ + tăng sĩ số lớp mới
 */
export const transferStudent = async (req, res) => {
  try {
    const { studentId, newClassId, transferDate, reason } = req.body;

    if (!studentId || !newClassId) {
      return errorResponse(res, 'Thiếu thông tin học sinh hoặc lớp mới', 400);
    }

    // Kiểm tra học sinh
    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.user.schoolId,
    });

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    if (!student.classId) {
      return errorResponse(res, 'Học sinh chưa có lớp', 400);
    }

    if (student.classId.toString() === newClassId) {
      return errorResponse(res, 'Học sinh đã ở lớp này rồi', 400);
    }

    // Thực hiện transaction
    const result = await withTransactionRetry(async (session) => {
      // 1. Lấy lớp cũ và lớp mới
      const [oldClass, newClass] = await Promise.all([
        Class.findOne({ _id: student.classId, schoolId: req.user.schoolId }).session(session),
        Class.findOne({ _id: newClassId, schoolId: req.user.schoolId }).session(session),
      ]);

      if (!oldClass || !newClass) {
        throw new Error('Không tìm thấy lớp học');
      }

      // 2. Kiểm tra sức chứa lớp mới
      if (newClass.currentStudents >= newClass.capacity) {
        throw new Error(`Lớp ${newClass.className} đã đầy (${newClass.currentStudents}/${newClass.capacity})`);
      }

      // 3. Cập nhật học sinh
      student.classId = newClassId;
      student.transferHistory = student.transferHistory || [];
      student.transferHistory.push({
        fromClassId: oldClass._id,
        toClassId: newClass._id,
        transferDate: transferDate ? new Date(transferDate) : new Date(),
        reason: reason || '',
        transferredBy: req.user._id,
      });
      await student.save({ session });

      // 4. Giảm sĩ số lớp cũ
      oldClass.currentStudents = Math.max(0, oldClass.currentStudents - 1);
      await oldClass.save({ session });

      // 5. Tăng sĩ số lớp mới
      newClass.currentStudents += 1;
      await newClass.save({ session });

      return {
        student,
        oldClass: { _id: oldClass._id, className: oldClass.className },
        newClass: { _id: newClass._id, className: newClass.className },
      };
    });

    const workspaceId = await ensureClassWorkspaceId(newClassId, req.user.schoolId);
    if (workspaceId) {
      await Student.findByIdAndUpdate(studentId, {
        $set: { classWorkspaceId: workspaceId },
      });
      if (result?.student) {
        result.student.classWorkspaceId = workspaceId;
      }
    }

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(
      res,
      result,
      `Chuyển học sinh từ ${result.oldClass.className} sang ${result.newClass.className} thành công`
    );
  } catch (error) {
    console.error('Transfer student error:', error);
    return errorResponse(res, error.message || 'Lỗi khi chuyển lớp', 500);
  }
};

