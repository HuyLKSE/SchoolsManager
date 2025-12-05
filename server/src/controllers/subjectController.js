import Subject from '../models/Subject.js';
import { successResponse, errorResponse, paginationResponse } from '../utils/response.js';

// Lấy danh sách môn học
export const getSubjects = async (req, res) => {
  try {
    const { page = 1, limit = 50, grade, type, search } = req.query;

    const filter = { schoolId: req.user.schoolId, isActive: true };

    if (grade) filter.grades = parseInt(grade);
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { subjectName: { $regex: search, $options: 'i' } },
        { subjectCode: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const subjects = await Subject.find(filter)
      .sort('subjectCode')
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Subject.countDocuments(filter);

    return paginationResponse(res, subjects, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
    });
  } catch (error) {
    console.error('Get subjects error:', error);
    return errorResponse(res, 'Lỗi khi lấy danh sách môn học', 500);
  }
};

// Lấy chi tiết môn học
export const getSubjectById = async (req, res) => {
  try {
    const subject = await Subject.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!subject) {
      return errorResponse(res, 'Không tìm thấy môn học', 404);
    }

    return successResponse(res, subject, 'Lấy thông tin môn học thành công');
  } catch (error) {
    console.error('Get subject error:', error);
    return errorResponse(res, 'Lỗi khi lấy thông tin môn học', 500);
  }
};

// Tạo môn học mới
export const createSubject = async (req, res) => {
  try {
    const subjectData = {
      ...req.body,
      schoolId: req.user.schoolId,
    };

    // Kiểm tra mã môn trùng
    const existingSubject = await Subject.findOne({
      subjectCode: subjectData.subjectCode,
      schoolId: req.user.schoolId,
    });

    if (existingSubject) {
      return errorResponse(res, 'Mã môn học đã tồn tại', 400);
    }

    const subject = await Subject.create(subjectData);

    return successResponse(res, subject, 'Tạo môn học thành công', 201);
  } catch (error) {
    console.error('Create subject error:', error);
    if (error.code === 11000) {
      return errorResponse(res, 'Mã môn học đã tồn tại', 400);
    }
    return errorResponse(res, 'Lỗi khi tạo môn học', 500);
  }
};

// Cập nhật môn học
export const updateSubject = async (req, res) => {
  try {
    const existingSubject = await Subject.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!existingSubject) {
      return errorResponse(res, 'Không tìm thấy môn học', 404);
    }

    // Kiểm tra nếu thay đổi mã môn học sang mã đã tồn tại
    if (req.body.subjectCode && req.body.subjectCode !== existingSubject.subjectCode) {
      const duplicate = await Subject.findOne({
        subjectCode: req.body.subjectCode,
        schoolId: req.user.schoolId,
        _id: { $ne: existingSubject._id },
      });
      if (duplicate) {
        return errorResponse(res, 'Mã môn học đã tồn tại', 400);
      }
    }

    Object.assign(existingSubject, req.body);
    await existingSubject.save();

    return successResponse(res, existingSubject, 'Cập nhật môn học thành công');
  } catch (error) {
    console.error('Update subject error:', error);
    if (error.code === 11000) {
      return errorResponse(res, 'Mã môn học đã tồn tại', 400);
    }
    return errorResponse(res, 'Lỗi khi cập nhật môn học', 500);
  }
};

// Xóa môn học
export const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!subject) {
      return errorResponse(res, 'Không tìm thấy môn học', 404);
    }

    // Soft delete: đánh dấu isActive = false
    subject.isActive = false;
    await subject.save();

    return successResponse(res, null, 'Xóa môn học thành công');
  } catch (error) {
    console.error('Delete subject error:', error);
    return errorResponse(res, 'Lỗi khi xóa môn học', 500);
  }
};
