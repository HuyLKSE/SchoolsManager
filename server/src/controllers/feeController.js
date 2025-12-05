import Fee from '../models/Fee.js';
import { successResponse, errorResponse, paginationResponse } from '../utils/response.js';

// Lấy danh sách khoản phí
export const getFees = async (req, res) => {
  try {
    const { page = 1, limit = 50, academicYear, semester, feeType, isActive } = req.query;

    const filter = { schoolId: req.user.schoolId };

    if (academicYear) filter.academicYear = academicYear;
    if (semester) filter.semester = parseInt(semester);
    if (feeType) filter.feeType = feeType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const skip = (page - 1) * limit;
    const fees = await Fee.find(filter)
      .populate('classId', 'className classCode')
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Fee.countDocuments(filter);

    return paginationResponse(res, fees, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
    });
  } catch (error) {
    console.error('Get fees error:', error);
    return errorResponse(res, 'Lỗi khi lấy danh sách khoản phí', 500);
  }
};

// Lấy chi tiết khoản phí
export const getFeeById = async (req, res) => {
  try {
    const fee = await Fee.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    }).populate('classId', 'className classCode');

    if (!fee) {
      return errorResponse(res, 'Không tìm thấy khoản phí', 404);
    }

    return successResponse(res, fee, 'Lấy thông tin khoản phí thành công');
  } catch (error) {
    console.error('Get fee error:', error);
    return errorResponse(res, 'Lỗi khi lấy thông tin khoản phí', 500);
  }
};

// Tạo khoản phí mới
export const createFee = async (req, res) => {
  try {
    const feeData = {
      ...req.body,
      schoolId: req.user.schoolId,
    };

    const fee = await Fee.create(feeData);

    return successResponse(res, fee, 'Tạo khoản phí thành công', 201);
  } catch (error) {
    console.error('Create fee error:', error);
    return errorResponse(res, 'Lỗi khi tạo khoản phí', 500);
  }
};

// Cập nhật khoản phí
export const updateFee = async (req, res) => {
  try {
    const fee = await Fee.findOneAndUpdate(
      {
        _id: req.params.id,
        schoolId: req.user.schoolId,
      },
      req.body,
      { new: true, runValidators: true }
    ).populate('classId', 'className classCode');

    if (!fee) {
      return errorResponse(res, 'Không tìm thấy khoản phí', 404);
    }

    return successResponse(res, fee, 'Cập nhật khoản phí thành công');
  } catch (error) {
    console.error('Update fee error:', error);
    return errorResponse(res, 'Lỗi khi cập nhật khoản phí', 500);
  }
};

// Xóa khoản phí
export const deleteFee = async (req, res) => {
  try {
    const fee = await Fee.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!fee) {
      return errorResponse(res, 'Không tìm thấy khoản phí', 404);
    }

    // Soft delete
    fee.isActive = false;
    await fee.save();

    return successResponse(res, null, 'Xóa khoản phí thành công');
  } catch (error) {
    console.error('Delete fee error:', error);
    return errorResponse(res, 'Lỗi khi xóa khoản phí', 500);
  }
};
