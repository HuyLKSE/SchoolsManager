import mongoose from 'mongoose';

const scoreSchema = new mongoose.Schema(
  {
    // Học sinh
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student ID là bắt buộc'],
    },
    // Lớp
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class ID là bắt buộc'],
    },
    // Môn học
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject ID là bắt buộc'],
    },
    // Năm học
    academicYear: {
      type: String,
      required: [true, 'Năm học là bắt buộc'],
    },
    // Học kỳ (1, 2)
    semester: {
      type: Number,
      required: [true, 'Học kỳ là bắt buộc'],
      enum: [1, 2],
    },
    // Loại điểm
    scoreType: {
      type: String,
      required: [true, 'Loại điểm là bắt buộc'],
      enum: [
        'Miệng',           // Điểm miệng
        '15 phút',         // Kiểm tra 15 phút
        '1 tiết',          // Kiểm tra 1 tiết
        'Giữa kỳ',         // Kiểm tra giữa kỳ
        'Cuối kỳ',         // Thi cuối kỳ
      ],
    },
    // Hệ số
    coefficient: {
      type: Number,
      required: true,
      default: 1,
    },
    // Điểm số (thang 10)
    score: {
      type: Number,
      required: [true, 'Điểm số là bắt buộc'],
      min: 0,
      max: 10,
    },
    // Ghi chú
    note: {
      type: String,
      trim: true,
    },
    // Giáo viên nhập điểm
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Trạng thái (đã khóa hay chưa)
    isLocked: {
      type: Boolean,
      default: false,
    },
    // Người khóa điểm
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Thời gian khóa điểm
    lockedAt: {
      type: Date,
    },
    // Ngày nhập/cập nhật điểm
    enteredAt: {
      type: Date,
      default: Date.now,
    },
    // Trường học
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index
scoreSchema.index(
  { studentId: 1, classId: 1, subjectId: 1, semester: 1, academicYear: 1, scoreType: 1 },
  { unique: true }
);
scoreSchema.index({ studentId: 1, subjectId: 1, semester: 1, academicYear: 1 });
scoreSchema.index({ classId: 1, subjectId: 1, semester: 1 });
scoreSchema.index({ schoolId: 1, academicYear: 1 });

// Hệ số mặc định theo loại điểm
scoreSchema.pre('validate', function (next) {
  if (!this.coefficient) {
    switch (this.scoreType) {
      case 'Miệng':
        this.coefficient = 1;
        break;
      case '15 phút':
        this.coefficient = 1;
        break;
      case '1 tiết':
        this.coefficient = 2;
        break;
      case 'Giữa kỳ':
        this.coefficient = 2;
        break;
      case 'Cuối kỳ':
        this.coefficient = 3;
        break;
      default:
        this.coefficient = 1;
    }
  }
  next();
});

// Phương thức tính điểm trung bình môn
scoreSchema.statics.calculateSubjectAverage = async function (
  studentId,
  subjectId,
  semester,
  academicYear
) {
  const scores = await this.find({
    studentId,
    subjectId,
    semester,
    academicYear,
  });

  if (scores.length === 0) return null;

  let totalWeighted = 0;
  let totalCoefficient = 0;

  scores.forEach((s) => {
    totalWeighted += s.score * s.coefficient;
    totalCoefficient += s.coefficient;
  });

  return totalCoefficient > 0
    ? Math.round((totalWeighted / totalCoefficient) * 10) / 10
    : null;
};

// Phương thức tính điểm trung bình học kỳ
scoreSchema.statics.calculateSemesterAverage = async function (
  studentId,
  semester,
  academicYear
) {
  const pipeline = [
    {
      $match: {
        studentId: new mongoose.Types.ObjectId(studentId),
        semester,
        academicYear,
      },
    },
    {
      $group: {
        _id: '$subjectId',
        totalWeighted: { $sum: { $multiply: ['$score', '$coefficient'] } },
        totalCoefficient: { $sum: '$coefficient' },
      },
    },
    {
      $lookup: {
        from: 'subjects',
        localField: '_id',
        foreignField: '_id',
        as: 'subject',
      },
    },
    {
      $unwind: '$subject',
    },
    {
      $project: {
        subjectId: '$_id',
        average: {
          $divide: ['$totalWeighted', '$totalCoefficient'],
        },
        subjectCoefficient: '$subject.coefficient',
      },
    },
  ];

  const results = await this.aggregate(pipeline);

  if (results.length === 0) return null;

  let totalWeighted = 0;
  let totalCoefficient = 0;

  results.forEach((r) => {
    totalWeighted += r.average * r.subjectCoefficient;
    totalCoefficient += r.subjectCoefficient;
  });

  return totalCoefficient > 0
    ? Math.round((totalWeighted / totalCoefficient) * 10) / 10
    : null;
};

const Score = mongoose.model('Score', scoreSchema);

export default Score;
