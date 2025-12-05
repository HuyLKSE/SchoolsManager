import mongoose from 'mongoose';

const classSchema = new mongoose.Schema(
  {
    // Mã lớp (unique trong trường)
    classCode: {
      type: String,
      required: [true, 'Mã lớp là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    // Tên lớp (người dùng nhập)
    name: {
      type: String,
      required: [true, 'Tên lớp là bắt buộc'],
      trim: true,
    },
    // Alias giữ tương thích cũ
    className: {
      type: String,
      trim: true,
    },
    // Khối lớp
    grade: {
      type: Number,
      required: [true, 'Khối là bắt buộc'],
      min: 10,
      max: 12,
    },
    // Năm học
    academicYear: {
      type: String,
      required: [true, 'Năm học là bắt buộc'],
    },
    // Giáo viên chủ nhiệm
    homeroomTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Sĩ số
    capacity: {
      type: Number,
      default: 40,
      min: 1,
    },
    currentStudents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Phòng học
    classroom: {
      type: String,
      trim: true,
    },
    // Trạng thái
    status: {
      type: String,
      enum: ['Đang hoạt động', 'Đã kết thúc', 'Tạm ngưng'],
      default: 'Đang hoạt động',
    },
    // Ghi chú
    notes: {
      type: String,
    },
    workspace: {
      workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
      },
      parentWorkspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
      },
      code: String,
      path: String,
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

// Đồng bộ name/className cho tương thích
classSchema.pre('validate', function (next) {
  if (!this.name && this.className) {
    this.name = this.className;
  }
  if (!this.className && this.name) {
    this.className = this.name;
  }
  next();
});

// Index
classSchema.index({ schoolId: 1, classCode: 1 }, { unique: true });
classSchema.index({ grade: 1, academicYear: 1 });
classSchema.index({ 'workspace.workspaceId': 1 }, { sparse: true });

// Virtual lấy danh sách học sinh
classSchema.virtual('students', {
  ref: 'Student',
  localField: '_id',
  foreignField: 'classId',
});

classSchema.set('toJSON', { virtuals: true });
classSchema.set('toObject', { virtuals: true });

const Class = mongoose.model('Class', classSchema);

export default Class;

