import Payment from '../models/Payment.js';
import Fee from '../models/Fee.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { successResponse, errorResponse, paginationResponse } from '../utils/response.js';
import { withTransactionRetry } from '../utils/transaction.js';
import { getPaginationParams } from '../utils/pagination.js';
import { invalidateSchoolMetrics } from '../utils/cacheKeys.js';

// Lấy danh sách thanh toán
export const getPayments = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { defaultLimit: 50 });
    const { studentId, feeId, status, startDate, endDate } = req.query;

    const filter = { schoolId: req.user.schoolId };

    if (studentId) filter.studentId = studentId;
    if (feeId) filter.feeId = feeId;
    if (status) filter.status = status;

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('studentId', 'studentCode fullName')
        .populate('feeId', 'feeName amount feeType')
        .populate('collectedBy', 'fullName')
        .sort('-createdAt')
        .limit(limit)
        .skip(skip)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    return paginationResponse(res, payments, {
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error('Get payments error:', error);
    return errorResponse(res, 'Loi khi lay danh sach thanh toan', 500);
  }
};
;

// Tạo bản ghi thanh toán cho học sinh
export const createPaymentRecord = async (req, res) => {
  try {
    const { studentId, feeId, discount, discountReason } = req.body;

    // Kiểm tra học sinh và khoản phí
    const [student, fee] = await Promise.all([
      Student.findOne({ _id: studentId, schoolId: req.user.schoolId }),
      Fee.findOne({ _id: feeId, schoolId: req.user.schoolId }),
    ]);

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    if (!fee) {
      return errorResponse(res, 'Không tìm thấy khoản phí', 404);
    }

    // Kiểm tra đã có bản ghi chưa
    const existing = await Payment.findOne({ studentId, feeId });
    if (existing) {
      return errorResponse(res, 'Bản ghi thanh toán đã tồn tại', 400);
    }

    const payment = await Payment.create({
      studentId,
      feeId,
      amountDue: fee.amount,
      discount: discount || 0,
      discountReason: discountReason || '',
      schoolId: req.user.schoolId,
    });

    const populatedPayment = await Payment.findById(payment._id)
      .populate('studentId', 'studentCode fullName')
      .populate('feeId', 'feeName amount feeType');

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, populatedPayment, 'Tạo bản ghi thanh toán thành công', 201);
  } catch (error) {
    console.error('Create payment record error:', error);
    return errorResponse(res, 'Lỗi khi tạo bản ghi thanh toán', 500);
  }
};

// Ghi nhận thanh toán (với transaction để đảm bảo atomic update)
export const recordPayment = async (req, res) => {
  try {
    const { paymentId, amountPaid, paymentMethod, transactionId, note } = req.body;

    if (!amountPaid || amountPaid <= 0) {
      return errorResponse(res, 'Số tiền thanh toán không hợp lệ', 400);
    }

    // Validate payment exists
    const payment = await Payment.findOne({
      _id: paymentId,
      schoolId: req.user.schoolId,
    });

    if (!payment) {
      return errorResponse(res, 'Không tìm thấy bản ghi thanh toán', 404);
    }

    const paidAmount = parseFloat(amountPaid);
    const totalDue = payment.amountDue - payment.discount;
    const newTotalPaid = payment.amountPaid + paidAmount;

    // Không cho phép thanh toán vượt số tiền phải nộp
    if (newTotalPaid > totalDue) {
      return errorResponse(
        res,
        `Số tiền thanh toán vượt quá số tiền còn nợ (${totalDue - payment.amountPaid})`,
        400
      );
    }

    // Thực hiện transaction để đảm bảo atomic update
    const result = await withTransactionRetry(async (session) => {
      // Cập nhật payment
      const updatedPayment = await Payment.findOneAndUpdate(
        { _id: paymentId, schoolId: req.user.schoolId },
        {
          $set: {
            amountPaid: newTotalPaid,
            paymentMethod,
            transactionId: transactionId || '',
            note: note || '',
            collectedBy: req.user._id,
          },
        },
        { new: true, session }
      );

      if (!updatedPayment) {
        throw new Error('Không thể cập nhật thanh toán');
      }

      // Tạo payment history log (optional - có thể thêm collection riêng)
      // await PaymentLog.create([{
      //   paymentId,
      //   amount: paidAmount,
      //   method: paymentMethod,
      //   collectedBy: req.user._id,
      //   timestamp: new Date(),
      // }], { session });

      return updatedPayment;
    });

    // Populate sau khi transaction commit
    const populatedPayment = await Payment.findById(result._id)
      .populate('studentId', 'studentCode fullName')
      .populate('feeId', 'feeName amount feeType')
      .populate('collectedBy', 'fullName');

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(res, populatedPayment, 'Ghi nhận thanh toán thành công');
  } catch (error) {
    console.error('Record payment error:', error);
    return errorResponse(res, error.message || 'Lỗi khi ghi nhận thanh toán', 500);
  }
};

// Lấy trạng thái thanh toán của học sinh
export const getStudentPaymentStatus = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.user.schoolId,
    });

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    const filter = {
      studentId,
      schoolId: req.user.schoolId,
    };

    const payments = await Payment.find(filter)
      .populate('feeId', 'feeName amount feeType academicYear dueDate')
      .sort('-createdAt')
      .lean();

    // Lọc theo năm học nếu có
    const filteredPayments = academicYear
      ? payments.filter((p) => p.feeId?.academicYear === academicYear)
      : payments;

    // Thống kê
    const stats = {
      totalDue: filteredPayments.reduce((sum, p) => sum + (p.amountDue - p.discount), 0),
      totalPaid: filteredPayments.reduce((sum, p) => sum + p.amountPaid, 0),
      totalRemaining: 0,
      unpaidCount: 0,
    };

    stats.totalRemaining = stats.totalDue - stats.totalPaid;
    stats.unpaidCount = filteredPayments.filter(
      (p) => p.status !== 'Đã thanh toán'
    ).length;

    return successResponse(
      res,
      {
        student,
        payments: filteredPayments,
        stats,
      },
      'Lấy trạng thái thanh toán thành công'
    );
  } catch (error) {
    console.error('Get student payment status error:', error);
    return errorResponse(res, 'Lỗi khi lấy trạng thái thanh toán', 500);
  }
};

// Báo cáo thu chi
export const getPaymentReport = async (req, res) => {
  try {
    const { startDate, endDate, feeType } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(res, 'Thiếu khoảng thời gian', 400);
    }

    const filter = {
      schoolId: req.user.schoolId,
      paidDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
      status: { $in: ['Đã thanh toán', 'Thanh toán một phần'] },
    };

    const payments = await Payment.find(filter)
      .populate('feeId', 'feeName feeType')
      .populate('studentId', 'studentCode fullName')
      .populate('collectedBy', 'fullName')
      .sort('paidDate')
      .lean();

    // Lọc theo loại phí nếu có
    const filteredPayments = feeType
      ? payments.filter((p) => p.feeId?.feeType === feeType)
      : payments;

    // Thống kê
    const stats = {
      totalCollected: filteredPayments.reduce((sum, p) => sum + p.amountPaid, 0),
      totalTransactions: filteredPayments.length,
      byFeeType: {},
      byPaymentMethod: {},
    };

    // Group by fee type
    filteredPayments.forEach((p) => {
      const type = p.feeId?.feeType || 'Khác';
      if (!stats.byFeeType[type]) {
        stats.byFeeType[type] = { count: 0, total: 0 };
      }
      stats.byFeeType[type].count++;
      stats.byFeeType[type].total += p.amountPaid;

      // Group by payment method
      const method = p.paymentMethod || 'Không xác định';
      if (!stats.byPaymentMethod[method]) {
        stats.byPaymentMethod[method] = { count: 0, total: 0 };
      }
      stats.byPaymentMethod[method].count++;
      stats.byPaymentMethod[method].total += p.amountPaid;
    });

    return successResponse(
      res,
      {
        stats,
        payments: filteredPayments,
      },
      'Lấy báo cáo thu chi thành công'
    );
  } catch (error) {
    console.error('Get payment report error:', error);
    return errorResponse(res, 'Lỗi khi lấy báo cáo thu chi', 500);
  }
};

// Xóa bản ghi thanh toán (admin only)
export const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!payment) {
      return errorResponse(res, 'Không tìm thấy bản ghi thanh toán', 404);
    }

    return successResponse(res, null, 'Xóa bản ghi thanh toán thành công');
  } catch (error) {
    console.error('Delete payment error:', error);
    return errorResponse(res, 'Lỗi khi xóa bản ghi thanh toán', 500);
  }
};

// ========== ADVANCED PAYMENT FEATURES ==========

// Tạo bản ghi thanh toán hàng loạt (bulk)
export const bulkCreatePayments = async (req, res) => {
  try {
    const { feeId, studentIds, defaultDiscount, discountReason } = req.body;

    if (!feeId || !Array.isArray(studentIds) || studentIds.length === 0) {
      return errorResponse(res, 'Thiếu thông tin khoản phí hoặc danh sách học sinh', 400);
    }

    const fee = await Fee.findOne({
      _id: feeId,
      schoolId: req.user.schoolId,
      isActive: true,
    });

    if (!fee) {
      return errorResponse(res, 'Không tìm thấy khoản phí', 404);
    }

    // Lấy danh sách học sinh hợp lệ
    const students = await Student.find({
      _id: { $in: studentIds },
      schoolId: req.user.schoolId,
      status: 'Đang học',
    })
      .select('_id classId')
      .lean();

    if (!students.length) {
      return errorResponse(res, 'Không có học sinh hợp lệ', 400);
    }

    // Kiểm tra appliesTo của fee
    let eligibleStudents = students;
    if (fee.appliesTo === 'Lớp cụ thể' && fee.classId) {
      eligibleStudents = students.filter(
        (s) => s.classId.toString() === fee.classId.toString()
      );
    } else if (fee.appliesTo !== 'Tất cả') {
      // Filter by grade (Khối 10, 11, 12)
      const grade = fee.appliesTo.replace('Khối ', '');
      const classes = await Class.find({
        schoolId: req.user.schoolId,
        grade,
      })
        .select('_id')
        .lean();
      const classIds = classes.map((c) => c._id.toString());
      eligibleStudents = students.filter((s) =>
        classIds.includes(s.classId.toString())
      );
    }

    if (!eligibleStudents.length) {
      return errorResponse(res, 'Không có học sinh phù hợp với khoản phí này', 400);
    }

    // Lấy các bản ghi đã tồn tại
    const existingPayments = await Payment.find({
      studentId: { $in: eligibleStudents.map((s) => s._id) },
      feeId,
      schoolId: req.user.schoolId,
    })
      .select('studentId')
      .lean();

    const existingStudentIds = new Set(
      existingPayments.map((p) => p.studentId.toString())
    );

    // Tạo bản ghi mới cho học sinh chưa có
    const newPayments = eligibleStudents
      .filter((s) => !existingStudentIds.has(s._id.toString()))
      .map((student) => ({
        studentId: student._id,
        feeId,
        amountDue: fee.amount,
        discount: defaultDiscount || 0,
        discountReason: discountReason || '',
        schoolId: req.user.schoolId,
      }));

    if (!newPayments.length) {
      return successResponse(
        res,
        { created: 0, skipped: eligibleStudents.length },
        'Tất cả học sinh đã có bản ghi thanh toán'
      );
    }

    const result = await Payment.insertMany(newPayments);

    return successResponse(
      res,
      {
        created: result.length,
        skipped: existingPayments.length,
        total: eligibleStudents.length,
      },
      `Tạo ${result.length} bản ghi thanh toán thành công`
    );
  } catch (error) {
    console.error('Bulk create payments error:', error);
    return errorResponse(res, 'Lỗi khi tạo bản ghi thanh toán hàng loạt', 500);
  }
};

// Theo dõi học phí quá hạn
export const getOverduePayments = async (req, res) => {
  try {
    const { classId, grade } = req.query;
    const today = new Date();

    // Lấy các khoản phí quá hạn
    const overdueFees = await Fee.find({
      schoolId: req.user.schoolId,
      isActive: true,
      dueDate: { $lt: today },
    })
      .select('_id feeName amount dueDate feeType')
      .lean();

    if (!overdueFees.length) {
      return successResponse(res, [], 'Không có khoản phí quá hạn');
    }

    const feeIds = overdueFees.map((f) => f._id);

    // Lấy các thanh toán chưa hoàn thành
    const filter = {
      feeId: { $in: feeIds },
      schoolId: req.user.schoolId,
      status: { $in: ['Chưa thanh toán', 'Thanh toán một phần'] },
    };

    const overduePayments = await Payment.find(filter)
      .populate('studentId', 'studentCode fullName classId')
      .populate('feeId', 'feeName amount dueDate feeType')
      .sort('-feeId.dueDate')
      .lean();

    // Filter by class or grade if provided
    let filteredPayments = overduePayments;
    if (classId) {
      filteredPayments = overduePayments.filter(
        (p) => p.studentId?.classId?.toString() === classId
      );
    } else if (grade) {
      const classes = await Class.find({
        schoolId: req.user.schoolId,
        grade,
      })
        .select('_id')
        .lean();
      const classIds = classes.map((c) => c._id.toString());
      filteredPayments = overduePayments.filter((p) =>
        classIds.includes(p.studentId?.classId?.toString())
      );
    }

    // Tính toán thông tin quá hạn
    const result = filteredPayments.map((p) => {
      const dueDate = new Date(p.feeId.dueDate);
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      const amountRemaining = p.amountDue - p.discount - p.amountPaid;

      return {
        ...p,
        daysOverdue,
        amountRemaining,
      };
    });

    // Thống kê
    const stats = {
      totalOverdue: result.length,
      totalAmountOverdue: result.reduce((sum, p) => sum + p.amountRemaining, 0),
      byFeeType: {},
    };

    result.forEach((p) => {
      const type = p.feeId?.feeType || 'Khác';
      if (!stats.byFeeType[type]) {
        stats.byFeeType[type] = { count: 0, total: 0 };
      }
      stats.byFeeType[type].count++;
      stats.byFeeType[type].total += p.amountRemaining;
    });

    return successResponse(
      res,
      {
        stats,
        overduePayments: result,
      },
      'Lấy danh sách quá hạn thành công'
    );
  } catch (error) {
    console.error('Get overdue payments error:', error);
    return errorResponse(res, 'Lỗi khi lấy danh sách quá hạn', 500);
  }
};

// Thống kê tài chính (financial statistics)
export const getFinancialStatistics = async (req, res) => {
  try {
    const { academicYear, startDate, endDate } = req.query;

    if (!academicYear && (!startDate || !endDate)) {
      return errorResponse(res, 'Thiếu năm học hoặc khoảng thời gian', 400);
    }

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        paidDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    // 1. Tổng quan thu chi
    const totalDueAggregate = await Payment.aggregate([
      { $match: { schoolId: req.user.schoolId } },
      {
        $group: {
          _id: null,
          totalDue: { $sum: { $subtract: ['$amountDue', '$discount'] } },
          totalPaid: { $sum: '$amountPaid' },
          totalDiscount: { $sum: '$discount' },
        },
      },
    ]);

    const overview = totalDueAggregate[0] || {
      totalDue: 0,
      totalPaid: 0,
      totalDiscount: 0,
    };
    overview.totalRemaining = overview.totalDue - overview.totalPaid;

    // 2. Thu theo loại phí
    const byFeeType = await Payment.aggregate([
      {
        $match: {
          schoolId: req.user.schoolId,
          status: { $in: ['Đã thanh toán', 'Thanh toán một phần'] },
          ...(dateFilter.paidDate && { paidDate: dateFilter.paidDate }),
        },
      },
      {
        $lookup: {
          from: 'fees',
          localField: 'feeId',
          foreignField: '_id',
          as: 'fee',
        },
      },
      { $unwind: '$fee' },
      ...(academicYear
        ? [{ $match: { 'fee.academicYear': academicYear } }]
        : []),
      {
        $group: {
          _id: '$fee.feeType',
          count: { $sum: 1 },
          totalCollected: { $sum: '$amountPaid' },
        },
      },
      { $sort: { totalCollected: -1 } },
    ]);

    // 3. Thu theo phương thức thanh toán
    const byPaymentMethod = await Payment.aggregate([
      {
        $match: {
          schoolId: req.user.schoolId,
          status: { $in: ['Đã thanh toán', 'Thanh toán một phần'] },
          ...(dateFilter.paidDate && { paidDate: dateFilter.paidDate }),
        },
      },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalCollected: { $sum: '$amountPaid' },
        },
      },
      { $sort: { totalCollected: -1 } },
    ]);

    // 4. Thu theo tháng (nếu có khoảng thời gian)
    let byMonth = null;
    if (startDate && endDate) {
      byMonth = await Payment.aggregate([
        {
          $match: {
            schoolId: req.user.schoolId,
            status: { $in: ['Đã thanh toán', 'Thanh toán một phần'] },
            paidDate: dateFilter.paidDate,
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$paidDate' },
              month: { $month: '$paidDate' },
            },
            count: { $sum: 1 },
            totalCollected: { $sum: '$amountPaid' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]);
    }

    // 5. Trạng thái thanh toán
    const paymentStatusStats = await Payment.aggregate([
      { $match: { schoolId: req.user.schoolId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: { $subtract: ['$amountDue', '$discount'] } },
        },
      },
    ]);

    return successResponse(
      res,
      {
        overview,
        byFeeType,
        byPaymentMethod,
        byMonth,
        paymentStatusStats,
      },
      'Lấy thống kê tài chính thành công'
    );
  } catch (error) {
    console.error('Get financial statistics error:', error);
    return errorResponse(res, 'Lỗi khi lấy thống kê tài chính', 500);
  }
};

// Áp dụng giảm giá/học bổng
export const applyDiscount = async (req, res) => {
  try {
    const { paymentId, discount, discountReason } = req.body;

    if (!discount || discount < 0) {
      return errorResponse(res, 'Số tiền giảm không hợp lệ', 400);
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      schoolId: req.user.schoolId,
    });

    if (!payment) {
      return errorResponse(res, 'Không tìm thấy bản ghi thanh toán', 404);
    }

    if (discount > payment.amountDue) {
      return errorResponse(res, 'Số tiền giảm vượt quá số tiền phải nộp', 400);
    }

    payment.discount = discount;
    payment.discountReason = discountReason || '';
    await payment.save();

    const updated = await Payment.findById(payment._id)
      .populate('studentId', 'studentCode fullName')
      .populate('feeId', 'feeName amount');

    return successResponse(res, updated, 'Áp dụng giảm giá thành công');
  } catch (error) {
    console.error('Apply discount error:', error);
    return errorResponse(res, 'Lỗi khi áp dụng giảm giá', 500);
  }
};
