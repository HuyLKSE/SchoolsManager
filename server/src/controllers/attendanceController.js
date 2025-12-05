import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { successResponse, errorResponse, paginationResponse } from '../utils/response.js';
import { getPaginationParams } from '../utils/pagination.js';
import { invalidateSchoolMetrics } from '../utils/cacheKeys.js';

const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT_EXCUSED: 'absent_excused',
  ABSENT_UNEXCUSED: 'absent_unexcused',
  LATE: 'late',
  LEFT_EARLY: 'left_early',
};

const ATTENDANCE_STATUS_LABELS = {
  [ATTENDANCE_STATUS.PRESENT]: 'Có mặt',
  [ATTENDANCE_STATUS.ABSENT_EXCUSED]: 'Vắng có phép',
  [ATTENDANCE_STATUS.ABSENT_UNEXCUSED]: 'Vắng không phép',
  [ATTENDANCE_STATUS.LATE]: 'Đi muộn',
  [ATTENDANCE_STATUS.LEFT_EARLY]: 'Về sớm',
};
const LEGACY_STATUS_MAP = {
  'Có mặt': ATTENDANCE_STATUS.PRESENT,
  'Vắng có phép': ATTENDANCE_STATUS.ABSENT_EXCUSED,
  'Vắng không phép': ATTENDANCE_STATUS.ABSENT_UNEXCUSED,
  'Đi muộn': ATTENDANCE_STATUS.LATE,
  'Đi trễ': ATTENDANCE_STATUS.LATE,
  'Về sớm': ATTENDANCE_STATUS.LEFT_EARLY,
};

const withStatusLabel = (record) => ({
  ...record,
  statusLabel: ATTENDANCE_STATUS_LABELS[record.status] || record.status,
});

const normalizeStatusValue = (status) => LEGACY_STATUS_MAP[status] || status;

// Lấy danh sách điểm danh
export const getAttendances = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { defaultLimit: 50 });
    const { studentId, classId, date, startDate, endDate, status, session } = req.query;

    const filter = { schoolId: req.user.schoolId };

    if (studentId) filter.studentId = studentId;
    if (classId) filter.classId = classId;
    if (status) filter.status = status;
    if (session) filter.session = session;

    if (date) {
      const dateObj = new Date(date);
      filter.date = {
        $gte: new Date(dateObj.setHours(0, 0, 0, 0)),
        $lte: new Date(dateObj.setHours(23, 59, 59, 999)),
      };
    } else if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const [attendances, total] = await Promise.all([
      Attendance.find(filter)
        .populate('studentId', 'studentCode fullName')
        .populate('classId', 'className classCode')
        .populate('markedBy', 'fullName username')
        .sort('-date -createdAt')
        .limit(limit)
        .skip(skip)
        .lean()
        .then((rows) => rows.map(withStatusLabel)),
      Attendance.countDocuments(filter),
    ]);

    return paginationResponse(res, attendances, {
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error('Get attendances error:', error);
    return errorResponse(res, 'Loi khi lay danh sach diem danh', 500);
  }
};
// Điểm danh cho cả lớp
export const markClassAttendance = async (req, res) => {
  try {
    const { classId, date, session, attendanceData } = req.body;

    // Kiểm tra lớp tồn tại
    const classDoc = await Class.findOne({
      _id: classId,
      schoolId: req.user.schoolId,
    });

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    // Kiểm tra ngày hợp lệ
    const attendanceDate = new Date(date);
    if (isNaN(attendanceDate.getTime())) {
      return errorResponse(res, 'Ngày không hợp lệ', 400);
    }

    // Không cho phép điểm danh ngày tương lai
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (attendanceDate > today) {
      return errorResponse(res, 'Không thể điểm danh ngày tương lai', 400);
    }

    // attendanceData format: [{ studentId, status, note, period }]
    if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
      return errorResponse(res, 'Dữ liệu điểm danh không hợp lệ', 400);
    }

    // Validate status enum
    const validStatuses = Object.values(ATTENDANCE_STATUS);

    const classStudents = await Student.find({
      classId,
      schoolId: req.user.schoolId,
    })
      .select('_id')
      .lean();

    if (!classStudents.length) {
      return errorResponse(res, 'Lop chua co hoc sinh dang ky', 400);
    }

    const allowedStudents = new Set(classStudents.map((s) => s._id.toString()));
    const normalizedSession = session || 'full_day';

    const bulkOps = [];
    const studentsToNotify = []; // H???c sinh v??_ng c???n thA'ng bA?o

    for (const item of attendanceData) {
      const { studentId, status, note, period } = item;
      const normalizedStatus = normalizeStatusValue(status);

      if (!studentId || !validStatuses.includes(normalizedStatus)) {
        continue;
      }

      const studentKey = studentId.toString();
      if (!allowedStudents.has(studentKey)) {
        continue;
      }

      const attendanceDoc = {
        studentId,
        classId,
        date: attendanceDate,
        session: normalizedSession,
        period: period || null,
        status: normalizedStatus,
        note: note || '',
        markedBy: req.user._id,
        schoolId: req.user.schoolId,
      };

      bulkOps.push({
        updateOne: {
          filter: {
            studentId,
            classId,
            date: attendanceDate,
            session: normalizedSession,
            period: period || null,
          },
          update: { $set: attendanceDoc },
          upsert: true,
        },
      });

      if (
        normalizedStatus === ATTENDANCE_STATUS.ABSENT_EXCUSED ||
        normalizedStatus === ATTENDANCE_STATUS.ABSENT_UNEXCUSED
      ) {
        studentsToNotify.push({
          studentId,
          status: normalizedStatus,
          statusLabel: ATTENDANCE_STATUS_LABELS[normalizedStatus] || normalizedStatus,
          note,
        });
      }
    }

    if (bulkOps.length > 0) {
      await Attendance.bulkWrite(bulkOps);
    }

    // TODO: Gửi thông báo cho phụ huynh (tích hợp sau)
    // await sendAttendanceNotifications(studentsToNotify, date);

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(
      res,
      {
        marked: bulkOps.length,
        notified: studentsToNotify.length,
      },
      'Điểm danh thành công'
    );
  } catch (error) {
    console.error('Mark attendance error:', error);
    return errorResponse(res, 'Lỗi khi điểm danh', 500);
  }
};

// Lấy bảng điểm danh của lớp theo ngày
export const getClassAttendanceByDate = async (req, res) => {
  try {
    const { classId, date, session } = req.query;

    if (!classId || !date) {
      return errorResponse(res, 'Thiếu thông tin lớp hoặc ngày', 400);
    }

    const dateObj = new Date(date);
    const filter = {
      classId,
      date: {
        $gte: new Date(dateObj.setHours(0, 0, 0, 0)),
        $lte: new Date(dateObj.setHours(23, 59, 59, 999)),
      },
      schoolId: req.user.schoolId,
    };

    if (session) filter.session = session;

    // Lấy danh sách học sinh trong lớp
    const students = await Student.find({
      classId,
      status: 'Đang học',
      schoolId: req.user.schoolId,
    })
      .select('studentCode fullName avatar')
      .sort('studentCode')
      .lean();

    // Lấy điểm danh đã có
    const attendances = await Attendance.find(filter).lean();

    // Map điểm danh với học sinh
    const attendanceMap = {};
    attendances.forEach((att) => {
      attendanceMap[att.studentId.toString()] = att;
    });

    const result = students.map((student) => ({
      ...student,
      attendance: attendanceMap[student._id.toString()] || null,
    }));

    return successResponse(res, result, 'Lấy dữ liệu điểm danh thành công');
  } catch (error) {
    console.error('Get class attendance error:', error);
    return errorResponse(res, 'Lỗi khi lấy dữ liệu điểm danh', 500);
  }
};

// Báo cáo chuyên cần của học sinh
export const getStudentAttendanceReport = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(res, 'Thiếu khoảng thời gian', 400);
    }

    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.user.schoolId,
    }).populate('classId', 'className classCode');

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    const filter = {
      studentId,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
      schoolId: req.user.schoolId,
    };

    const attendances = await Attendance.find(filter).sort('date').lean();

    // Thống kê
    const stats = {
      total: attendances.length,
      present: attendances.filter((a) => a.status === 'Có mặt').length,
      absentWithPermission: attendances.filter((a) => a.status === 'Vắng có phép')
        .length,
      absentWithoutPermission: attendances.filter(
        (a) => a.status === 'Vắng không phép'
      ).length,
      late: attendances.filter((a) => a.status === 'Đi trễ').length,
      leaveEarly: attendances.filter((a) => a.status === 'Về sớm').length,
    };

    stats.attendanceRate =
      stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(2) : 0;

    return successResponse(
      res,
      {
        student,
        stats,
        attendances,
      },
      'Lấy báo cáo chuyên cần thành công'
    );
  } catch (error) {
    console.error('Get student attendance report error:', error);
    return errorResponse(res, 'Lỗi khi lấy báo cáo chuyên cần', 500);
  }
};

// Báo cáo chuyên cần của lớp
export const getClassAttendanceReport = async (req, res) => {
  try {
    const { classId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(res, 'Thiếu khoảng thời gian', 400);
    }

    const classDoc = await Class.findOne({
      _id: classId,
      schoolId: req.user.schoolId,
    }).populate('homeroomTeacher', 'fullName');

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    const students = await Student.find({
      classId,
      schoolId: req.user.schoolId,
    }).select('studentCode fullName');

    const filter = {
      classId,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
      schoolId: req.user.schoolId,
    };

    const attendances = await Attendance.find(filter).lean();

    // Thống kê theo từng học sinh
    const studentStats = {};
    students.forEach((student) => {
      studentStats[student._id.toString()] = {
        student,
        total: 0,
        present: 0,
        absentWithPermission: 0,
        absentWithoutPermission: 0,
        late: 0,
        leaveEarly: 0,
      };
    });

    attendances.forEach((att) => {
      const sid = att.studentId.toString();
      if (studentStats[sid]) {
        studentStats[sid].total++;
        if (att.status === 'Có mặt') studentStats[sid].present++;
        if (att.status === 'Vắng có phép') studentStats[sid].absentWithPermission++;
        if (att.status === 'Vắng không phép')
          studentStats[sid].absentWithoutPermission++;
        if (att.status === 'Đi trễ') studentStats[sid].late++;
        if (att.status === 'Về sớm') studentStats[sid].leaveEarly++;
      }
    });

    // Tính % chuyên cần cho từng học sinh
    const report = Object.values(studentStats).map((s) => ({
      ...s,
      attendanceRate: s.total > 0 ? ((s.present / s.total) * 100).toFixed(2) : 0,
    }));

    // Sắp xếp theo % chuyên cần giảm dần
    report.sort((a, b) => b.attendanceRate - a.attendanceRate);

    return successResponse(
      res,
      {
        class: classDoc,
        report,
      },
      'Lấy báo cáo chuyên cần lớp thành công'
    );
  } catch (error) {
    console.error('Get class attendance report error:', error);
    return errorResponse(res, 'Lỗi khi lấy báo cáo chuyên cần lớp', 500);
  }
};

// Xóa điểm danh (admin only)
export const deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!attendance) {
      return errorResponse(res, 'Không tìm thấy bản ghi điểm danh', 404);
    }

    return successResponse(res, null, 'Xóa điểm danh thành công');
  } catch (error) {
    console.error('Delete attendance error:', error);
    return errorResponse(res, 'Lỗi khi xóa điểm danh', 500);
  }
};

// Get attendance statistics for school
export const getAttendanceStatistics = async (req, res) => {
  try {
    const { startDate, endDate, classId } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(res, 'Thiếu khoảng thời gian', 400);
    }

    const filter = {
      schoolId: req.user.schoolId,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };

    if (classId) filter.classId = classId;

    const [total, byStatus, byClass, dailyStats] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Attendance.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'classes',
            localField: 'classId',
            foreignField: '_id',
            as: 'class',
          },
        },
        { $unwind: '$class' },
        {
          $group: {
            _id: '$classId',
            className: { $first: '$class.className' },
            total: { $sum: 1 },
            present: {
              $sum: { $cond: [{ $eq: ['$status', 'Có mặt'] }, 1, 0] },
            },
            absent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$status', 'Vắng có phép'] },
                      { $eq: ['$status', 'Vắng không phép'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { className: 1 } },
      ]),
      Attendance.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$date' },
            },
            total: { $sum: 1 },
            present: {
              $sum: { $cond: [{ $eq: ['$status', 'Có mặt'] }, 1, 0] },
            },
            absent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$status', 'Vắng có phép'] },
                      { $eq: ['$status', 'Vắng không phép'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const attendanceRate = total > 0 
      ? ((byStatus.find(s => s._id === 'Có mặt')?.count || 0) / total * 100).toFixed(2)
      : 0;

    return successResponse(res, {
      total,
      attendanceRate,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byClass: byClass.map(c => ({
        ...c,
        attendanceRate: c.total > 0 ? ((c.present / c.total) * 100).toFixed(2) : 0,
      })),
      dailyStats,
    }, 'Lấy thống kê chuyên cần thành công');
  } catch (error) {
    console.error('Get attendance statistics error:', error);
    return errorResponse(res, 'Lỗi khi lấy thống kê chuyên cần', 500);
  }
};
