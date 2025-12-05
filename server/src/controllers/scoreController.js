import mongoose from 'mongoose';
import Score from '../models/Score.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import { successResponse, errorResponse, paginationResponse } from '../utils/response.js';
import { withTransactionRetry } from '../utils/transaction.js';
import { getPaginationParams } from '../utils/pagination.js';
import { invalidateSchoolMetrics } from '../utils/cacheKeys.js';

// Lấy danh sách điểm
export const getScores = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { defaultLimit: 50 });
    const { studentId, classId, subjectId, semester, academicYear, scoreType } = req.query;

    const filter = { schoolId: req.user.schoolId };

    if (studentId) filter.studentId = studentId;
    if (classId) filter.classId = classId;
    if (subjectId) filter.subjectId = subjectId;
    if (semester) filter.semester = parseInt(semester, 10);
    if (academicYear) filter.academicYear = academicYear;
    if (scoreType) filter.scoreType = scoreType;

    const [scores, total] = await Promise.all([
      Score.find(filter)
        .populate('studentId', 'studentCode fullName')
        .populate('subjectId', 'subjectName subjectCode')
        .populate('teacherId', 'fullName')
        .sort('-enteredAt')
        .limit(limit)
        .skip(skip)
        .lean(),
      Score.countDocuments(filter),
    ]);

    return paginationResponse(res, scores, {
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error('Get scores error:', error);
    return errorResponse(res, 'Loi khi lay danh sach diem', 500);
  }
};
;

// Nhập điểm cho nhiều học sinh (bulk)
export const enterScores = async (req, res) => {
  try {
    const { classId, subjectId, semester, academicYear, scoreType, scoresData } =
      req.body;
    const parsedSemester = parseInt(semester, 10);

    if (!classId || !subjectId || !Number.isInteger(parsedSemester) || !academicYear || !scoreType) {
      return errorResponse(res, 'Thieu thong tin bat buoc', 400);
    }

    if (!Array.isArray(scoresData) || scoresData.length === 0) {
      return errorResponse(res, 'Du lieu diem khong hop le', 400);
    }

    const [classDoc, subject] = await Promise.all([
      Class.findOne({ _id: classId, schoolId: req.user.schoolId }),
      Subject.findOne({ _id: subjectId, schoolId: req.user.schoolId }),
    ]);

    if (!classDoc) {
      return errorResponse(res, 'Khong tim thay lop hoc', 404);
    }

    if (!subject) {
      return errorResponse(res, 'Khong tim thay mon hoc', 404);
    }

    const classStudents = await Student.find({
      classId,
      schoolId: req.user.schoolId,
    })
      .select('_id')
      .lean();

    if (!classStudents.length) {
      return errorResponse(res, 'Lop chua co hoc sinh de nhap diem', 400);
    }

    const allowedStudents = new Map(
      classStudents.map((student) => [student._id.toString(), student._id])
    );

    const sanitizedEntries = [];
    let skippedInvalid = 0;

    for (const item of scoresData) {
      const rawId = item.studentId;

      if (!rawId || !mongoose.Types.ObjectId.isValid(rawId)) {
        skippedInvalid++;
        continue;
      }

      const normalizedId = rawId.toString();
      if (!allowedStudents.has(normalizedId)) {
        skippedInvalid++;
        continue;
      }

      const value = parseFloat(item.score);
      if (Number.isNaN(value) || value < 0 || value > 10) {
        skippedInvalid++;
        continue;
      }

      sanitizedEntries.push({
        studentId: allowedStudents.get(normalizedId),
        score: value,
        note: item.note?.toString().trim() || '',
      });
    }

    if (!sanitizedEntries.length) {
      return errorResponse(res, 'Khong co diem hop le duoc gui len', 400);
    }

    const targetStudentIds = [
      ...new Set(sanitizedEntries.map((entry) => entry.studentId)),
    ];

    const existingScores = await Score.find({
      studentId: { $in: targetStudentIds },
      classId,
      subjectId,
      semester: parsedSemester,
      academicYear,
      scoreType,
      schoolId: req.user.schoolId,
    })
      .select('studentId isLocked')
      .lean();

    const lockedSet = new Set(
      existingScores
        .filter((s) => s.isLocked)
        .map((s) => s.studentId.toString())
    );

    const bulkOps = [];
    let skippedLocked = 0;

    sanitizedEntries.forEach((entry) => {
      const key = entry.studentId.toString();
      if (lockedSet.has(key)) {
        skippedLocked++;
        return;
      }

      const filter = {
        studentId: entry.studentId,
        classId,
        subjectId,
        semester: parsedSemester,
        academicYear,
        scoreType,
        schoolId: req.user.schoolId,
      };

      const update = {
        $set: {
          score: entry.score,
          note: entry.note,
          teacherId: req.user._id,
          enteredAt: new Date(),
        },
      };

      bulkOps.push({
        updateOne: {
          filter,
          update,
          upsert: true,
        },
      });
    });

    if (!bulkOps.length) {
      return successResponse(
        res,
        { entered: 0, skippedInvalid, skippedLocked },
        'Khong co diem nao duoc cap nhat'
      );
    }

    const result = await Score.bulkWrite(bulkOps, { ordered: false });
    const entered = (result.upsertedCount || 0) + (result.modifiedCount || 0);

    invalidateSchoolMetrics(req.user.schoolId);
    return successResponse(
      res,
      {
        entered,
        skippedInvalid,
        skippedLocked,
      },
      'Nhap diem thanh cong'
    );
  } catch (error) {
    console.error('Enter scores error:', error);
    return errorResponse(res, 'Loi khi nhap diem', 500);
  }
};
// Lấy bảng điểm của lớp theo môn
export const getClassScoresBySubject = async (req, res) => {
  try {
    const { classId, subjectId, semester, academicYear } = req.query;

    if (!classId || !subjectId || !semester || !academicYear) {
      return errorResponse(res, 'Thiếu thông tin bắt buộc', 400);
    }

    // Lấy danh sách học sinh
    const students = await Student.find({
      classId,
      status: 'Đang học',
      schoolId: req.user.schoolId,
    })
      .select('studentCode fullName')
      .sort('studentCode')
      .lean();

    // Lấy điểm của lớp
    const scores = await Score.find({
      classId,
      subjectId,
      semester: parseInt(semester),
      academicYear,
      schoolId: req.user.schoolId,
    }).lean();

    // Group điểm theo học sinh
    const scoresByStudent = {};
    scores.forEach((s) => {
      const sid = s.studentId.toString();
      if (!scoresByStudent[sid]) {
        scoresByStudent[sid] = [];
      }
      scoresByStudent[sid].push(s);
    });

    // Map với học sinh
    const result = students.map((student) => ({
      ...student,
      scores: scoresByStudent[student._id.toString()] || [],
    }));

    return successResponse(res, result, 'Lấy bảng điểm thành công');
  } catch (error) {
    console.error('Get class scores error:', error);
    return errorResponse(res, 'Lỗi khi lấy bảng điểm', 500);
  }
};

// Học bạ học sinh (tất cả môn trong học kỳ)
export const getStudentTranscript = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { semester, academicYear } = req.query;

    if (!semester || !academicYear) {
      return errorResponse(res, 'Thiếu thông tin học kỳ và năm học', 400);
    }

    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.user.schoolId,
    }).populate('classId', 'className classCode grade');

    if (!student) {
      return errorResponse(res, 'Không tìm thấy học sinh', 404);
    }

    // Lấy tất cả điểm của học sinh trong học kỳ
    const scores = await Score.find({
      studentId,
      semester: parseInt(semester),
      academicYear,
      schoolId: req.user.schoolId,
    })
      .populate('subjectId', 'subjectName subjectCode coefficient')
      .sort('subjectId scoreType')
      .lean();

    // Group theo môn học
    const subjectScores = {};
    scores.forEach((s) => {
      const subjectId = s.subjectId._id.toString();
      if (!subjectScores[subjectId]) {
        subjectScores[subjectId] = {
          subject: s.subjectId,
          scores: [],
        };
      }
      subjectScores[subjectId].scores.push(s);
    });

    // Tính điểm trung bình từng môn
    const transcript = await Promise.all(
      Object.values(subjectScores).map(async (item) => {
        const average = await Score.calculateSubjectAverage(
          studentId,
          item.subject._id,
          parseInt(semester),
          academicYear
        );

        return {
          subject: item.subject,
          scores: item.scores,
          average,
        };
      })
    );

    // Tính điểm trung bình học kỳ
    const semesterAverage = await Score.calculateSemesterAverage(
      studentId,
      parseInt(semester),
      academicYear
    );

    return successResponse(
      res,
      {
        student,
        transcript,
        semesterAverage,
      },
      'Lấy học bạ thành công'
    );
  } catch (error) {
    console.error('Get transcript error:', error);
    return errorResponse(res, 'Lỗi khi lấy học bạ', 500);
  }
};

// Cập nhật một điểm đơn lẻ theo id (admin, teacher)
export const updateScore = async (req, res) => {
  try {
    const { id } = req.params;
    const { score, note } = req.body;

    if (score === undefined) {
      return errorResponse(res, 'Thieu gia tri diem', 400);
    }

    const value = parseFloat(score);
    if (Number.isNaN(value) || value < 0 || value > 10) {
      return errorResponse(res, 'Diem khong hop le (0-10)', 400);
    }

    const doc = await Score.findOne({ _id: id, schoolId: req.user.schoolId });
    if (!doc) {
      return errorResponse(res, 'Khong tim thay diem', 404);
    }

    if (doc.isLocked) {
      return errorResponse(res, 'Diem da bi khoa, khong the cap nhat', 400);
    }

    doc.score = value;
    if (note !== undefined) doc.note = note?.toString().trim();
    doc.teacherId = req.user._id; // ghi nhận người cập nhật
    doc.enteredAt = new Date();
    await doc.save();

    return successResponse(res, doc, 'Cap nhat diem thanh cong');
  } catch (error) {
    console.error('Update score error:', error);
    return errorResponse(res, 'Loi khi cap nhat diem', 500);
  }
};

// Khóa điểm (admin, teacher) - với transaction
export const lockScores = async (req, res) => {
  try {
    const { classId, subjectId, semester, academicYear } = req.body;

    // Validate input
    if (!classId || !subjectId || !semester || !academicYear) {
      return errorResponse(res, 'Thiếu thông tin bắt buộc', 400);
    }

    // Thực hiện transaction để đảm bảo tất cả điểm được khóa cùng lúc
    const result = await withTransactionRetry(async (session) => {
      const updateResult = await Score.updateMany(
        {
          classId,
          subjectId,
          semester: parseInt(semester),
          academicYear,
          schoolId: req.user.schoolId,
        },
        {
          $set: {
            isLocked: true,
            lockedBy: req.user._id,
            lockedAt: new Date(),
          },
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error('Không tìm thấy điểm nào để khóa hoặc đã khóa rồi');
      }

      return updateResult;
    });

    return successResponse(
      res,
      {
        modified: result.modifiedCount,
        classId,
        subjectId,
        semester: parseInt(semester),
        academicYear,
      },
      `Đã khóa ${result.modifiedCount} điểm thành công`
    );
  } catch (error) {
    console.error('Lock scores error:', error);
    return errorResponse(res, error.message || 'Lỗi khi khóa điểm', 500);
  }
};

// Mở khóa điểm (admin only) - với transaction
export const unlockScores = async (req, res) => {
  try {
    const { classId, subjectId, semester, academicYear } = req.body;

    if (!classId || !subjectId || !semester || !academicYear) {
      return errorResponse(res, 'Thiếu thông tin bắt buộc', 400);
    }

    const result = await withTransactionRetry(async (session) => {
      const updateResult = await Score.updateMany(
        {
          classId,
          subjectId,
          semester: parseInt(semester),
          academicYear,
          schoolId: req.user.schoolId,
        },
        {
          $set: {
            isLocked: false,
          },
          $unset: {
            lockedBy: 1,
            lockedAt: 1,
          },
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error('Không tìm thấy điểm nào để mở khóa');
      }

      return updateResult;
    });

    return successResponse(
      res,
      {
        modified: result.modifiedCount,
        classId,
        subjectId,
        semester: parseInt(semester),
        academicYear,
      },
      `Đã mở khóa ${result.modifiedCount} điểm thành công`
    );
  } catch (error) {
    console.error('Unlock scores error:', error);
    return errorResponse(res, error.message || 'Lỗi khi mở khóa điểm', 500);
  }
};

// Xóa điểm (admin, teacher) - chỉ cho phép xóa khi chưa khóa
export const deleteScore = async (req, res) => {
  try {
    const score = await Score.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
    });

    if (!score) {
      return errorResponse(res, 'Khong tim thay diem', 404);
    }

    if (score.isLocked) {
      return errorResponse(res, 'Diem da bi khoa, khong the xoa', 400);
    }

    await Score.findByIdAndDelete(score._id);
    return successResponse(res, null, 'Xoa diem thanh cong');
  } catch (error) {
    console.error('Delete score error:', error);
    return errorResponse(res, 'Loi khi xoa diem', 500);
  }
};

// ========== ACADEMIC RANKING & STATISTICS ==========

// Khung điểm xếp loại chuẩn (Vietnamese grading system)
const GRADE_BOUNDARIES = {
  'Xuất sắc': { min: 9.0, max: 10 },
  'Giỏi': { min: 8.0, max: 8.9 },
  'Khá': { min: 6.5, max: 7.9 },
  'Trung bình': { min: 5.0, max: 6.4 },
  'Yếu': { min: 3.5, max: 4.9 },
  'Kém': { min: 0, max: 3.4 },
};

// Hàm xếp loại dựa trên điểm trung bình
const classifyGrade = (average) => {
  if (!average && average !== 0) return 'Chưa có điểm';
  
  for (const [grade, boundary] of Object.entries(GRADE_BOUNDARIES)) {
    if (average >= boundary.min && average <= boundary.max) {
      return grade;
    }
  }
  return 'Chưa xác định';
};

// Xếp hạng học lực lớp học (theo học kỳ)
export const getClassRanking = async (req, res) => {
  try {
    const { classId, semester, academicYear } = req.query;

    if (!classId || !semester || !academicYear) {
      return errorResponse(res, 'Thiếu thông tin lớp, học kỳ, năm học', 400);
    }

    const classDoc = await Class.findOne({
      _id: classId,
      schoolId: req.user.schoolId,
    });

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    // Lấy danh sách học sinh
    const students = await Student.find({
      classId,
      status: 'Đang học',
      schoolId: req.user.schoolId,
    })
      .select('studentCode fullName gender')
      .lean();

    if (!students.length) {
      return successResponse(res, [], 'Lớp chưa có học sinh');
    }

    // Tính điểm trung bình cho từng học sinh
    const rankings = await Promise.all(
      students.map(async (student) => {
        const semesterAverage = await Score.calculateSemesterAverage(
          student._id,
          parseInt(semester),
          academicYear
        );

        return {
          studentId: student._id,
          studentCode: student.studentCode,
          fullName: student.fullName,
          gender: student.gender,
          average: semesterAverage,
          classification: classifyGrade(semesterAverage),
        };
      })
    );

    // Sắp xếp theo điểm giảm dần
    rankings.sort((a, b) => {
      if (b.average === null) return -1;
      if (a.average === null) return 1;
      return b.average - a.average;
    });

    // Gán rank
    rankings.forEach((item, index) => {
      item.rank = item.average !== null ? index + 1 : null;
    });

    return successResponse(res, rankings, 'Lấy xếp hạng lớp thành công');
  } catch (error) {
    console.error('Get class ranking error:', error);
    return errorResponse(res, 'Lỗi khi lấy xếp hạng lớp', 500);
  }
};

// Thống kê điểm số lớp học (phân bố xếp loại, điểm TB môn)
export const getScoreStatistics = async (req, res) => {
  try {
    const { classId, semester, academicYear, subjectId } = req.query;

    if (!classId || !semester || !academicYear) {
      return errorResponse(res, 'Thiếu thông tin lớp, học kỳ, năm học', 400);
    }

    const filter = {
      classId,
      semester: parseInt(semester),
      academicYear,
      schoolId: req.user.schoolId,
    };

    if (subjectId) {
      filter.subjectId = subjectId;
    }

    // 1. Tổng số điểm đã nhập
    const totalScores = await Score.countDocuments(filter);

    // 2. Thống kê điểm theo loại
    const scoreTypeStats = await Score.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$scoreType',
          count: { $sum: 1 },
          avgScore: { $avg: '$score' },
          maxScore: { $max: '$score' },
          minScore: { $min: '$score' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 3. Phân bố điểm (0-10)
    const scoreDistribution = await Score.aggregate([
      { $match: filter },
      {
        $bucket: {
          groupBy: '$score',
          boundaries: [0, 2, 4, 5, 6.5, 8, 9, 10.1],
          default: 'Other',
          output: {
            count: { $sum: 1 },
            students: { $addToSet: '$studentId' },
          },
        },
      },
    ]);

    // 4. Điểm trung bình môn (nếu có subjectId)
    let subjectAverages = null;
    if (subjectId) {
      const students = await Student.find({
        classId,
        status: 'Đang học',
        schoolId: req.user.schoolId,
      })
        .select('studentCode fullName')
        .lean();

      subjectAverages = await Promise.all(
        students.map(async (student) => {
          const avg = await Score.calculateSubjectAverage(
            student._id,
            subjectId,
            parseInt(semester),
            academicYear
          );

          return {
            studentId: student._id,
            studentCode: student.studentCode,
            fullName: student.fullName,
            average: avg,
            classification: classifyGrade(avg),
          };
        })
      );

      subjectAverages.sort((a, b) => {
        if (b.average === null) return -1;
        if (a.average === null) return 1;
        return b.average - a.average;
      });
    }

    // 5. Phân loại học lực (nếu không chỉ định môn → tính cho cả học kỳ)
    let classificationDistribution = null;
    if (!subjectId) {
      const students = await Student.find({
        classId,
        status: 'Đang học',
        schoolId: req.user.schoolId,
      })
        .select('_id')
        .lean();

      const classifications = await Promise.all(
        students.map(async (student) => {
          const avg = await Score.calculateSemesterAverage(
            student._id,
            parseInt(semester),
            academicYear
          );
          return classifyGrade(avg);
        })
      );

      classificationDistribution = classifications.reduce((acc, cls) => {
        acc[cls] = (acc[cls] || 0) + 1;
        return acc;
      }, {});
    }

    return successResponse(
      res,
      {
        totalScores,
        scoreTypeStats,
        scoreDistribution,
        subjectAverages,
        classificationDistribution,
      },
      'Thống kê điểm số thành công'
    );
  } catch (error) {
    console.error('Get score statistics error:', error);
    return errorResponse(res, 'Lỗi khi thống kê điểm', 500);
  }
};

// Xuất điểm ra JSON (có thể dùng cho Excel export frontend)
export const exportScores = async (req, res) => {
  try {
    const { classId, semester, academicYear } = req.query;

    if (!classId || !semester || !academicYear) {
      return errorResponse(res, 'Thiếu thông tin lớp, học kỳ, năm học', 400);
    }

    const classDoc = await Class.findOne({
      _id: classId,
      schoolId: req.user.schoolId,
    }).lean();

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    // Lấy danh sách học sinh
    const students = await Student.find({
      classId,
      status: 'Đang học',
      schoolId: req.user.schoolId,
    })
      .select('studentCode fullName gender dateOfBirth')
      .sort('studentCode')
      .lean();

    // Lấy danh sách môn học
    const subjects = await Subject.find({ schoolId: req.user.schoolId })
      .select('subjectName subjectCode coefficient')
      .lean();

    // Lấy tất cả điểm
    const scores = await Score.find({
      classId,
      semester: parseInt(semester),
      academicYear,
      schoolId: req.user.schoolId,
    }).lean();

    // Group điểm theo học sinh và môn
    const scoresByStudent = {};
    scores.forEach((s) => {
      const key = `${s.studentId}_${s.subjectId}`;
      if (!scoresByStudent[key]) {
        scoresByStudent[key] = [];
      }
      scoresByStudent[key].push(s);
    });

    // Build export data
    const exportData = await Promise.all(
      students.map(async (student) => {
        const subjectScores = await Promise.all(
          subjects.map(async (subject) => {
            const key = `${student._id}_${subject._id}`;
            const scores = scoresByStudent[key] || [];
            const average = await Score.calculateSubjectAverage(
              student._id,
              subject._id,
              parseInt(semester),
              academicYear
            );

            return {
              subjectCode: subject.subjectCode,
              subjectName: subject.subjectName,
              scores: scores.map((s) => ({
                type: s.scoreType,
                score: s.score,
                coefficient: s.coefficient,
              })),
              average,
            };
          })
        );

        const semesterAverage = await Score.calculateSemesterAverage(
          student._id,
          parseInt(semester),
          academicYear
        );

        return {
          studentCode: student.studentCode,
          fullName: student.fullName,
          gender: student.gender,
          dateOfBirth: student.dateOfBirth,
          subjectScores,
          semesterAverage,
          classification: classifyGrade(semesterAverage),
        };
      })
    );

    return successResponse(
      res,
      {
        class: {
          className: classDoc.className,
          classCode: classDoc.classCode,
          grade: classDoc.grade,
        },
        semester: parseInt(semester),
        academicYear,
        exportDate: new Date(),
        students: exportData,
      },
      'Xuất điểm thành công'
    );
  } catch (error) {
    console.error('Export scores error:', error);
    return errorResponse(res, 'Lỗi khi xuất điểm', 500);
  }
};
