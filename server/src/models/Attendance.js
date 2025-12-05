import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
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
    // Ngày điểm danh
    date: {
      type: Date,
      required: [true, 'Ngày điểm danh là bắt buộc'],
    },
    // Buổi học (sáng/chiều) hoặc tiết học cụ thể
    session: {
      type: String,
      enum: ['Sáng', 'Chiều', 'Cả ngày'],
      default: 'Cả ngày',
    },
    // Tiết học (nếu điểm danh theo tiết)
    period: {
      type: Number,
      min: 1,
      max: 10,
    },
    // Trạng thái
    status: {
      type: String,
      enum: ['Có mặt', 'Vắng có phép', 'Vắng không phép', 'Đi trễ', 'Về sớm'],
      required: [true, 'Trạng thái điểm danh là bắt buộc'],
    },
    // Ghi chú/Lý do
    note: {
      type: String,
      trim: true,
    },
    // Giáo viên điểm danh
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Đã thông báo phụ huynh chưa
    notifiedParent: {
      type: Boolean,
      default: false,
    },
    notifiedAt: {
      type: Date,
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

// Index để tìm kiếm nhanh và đảm bảo không trùng
attendanceSchema.index({ studentId: 1, date: 1, session: 1, period: 1 });
attendanceSchema.index({ classId: 1, date: 1 });
attendanceSchema.index({ date: 1, schoolId: 1 });

// Virtual để tính % chuyên cần
attendanceSchema.statics.calculateAttendanceRate = async function (
  studentId,
  startDate,
  endDate
) {
  const total = await this.countDocuments({
    studentId,
    date: { $gte: startDate, $lte: endDate },
  });

  const present = await this.countDocuments({
    studentId,
    date: { $gte: startDate, $lte: endDate },
    status: 'Có mặt',
  });

  return total > 0 ? ((present / total) * 100).toFixed(2) : 0;
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
