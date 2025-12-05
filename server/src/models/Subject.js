import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    // Mã môn học
    subjectCode: {
      type: String,
      required: [true, 'Mã môn học là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    // Tên môn học
    subjectName: {
      type: String,
      required: [true, 'Tên môn học là bắt buộc'],
      trim: true,
    },
    // Khối học (10, 11, 12 hoặc tất cả)
    grades: {
      type: [Number],
      required: true,
      default: [10, 11, 12],
    },
    // Loại môn (bắt buộc, tự chọn)
    type: {
      type: String,
      enum: ['Bắt buộc', 'Tự chọn'],
      default: 'Bắt buộc',
    },
    // Hệ số môn (để tính điểm trung bình)
    coefficient: {
      type: Number,
      default: 1,
      min: 1,
    },
    // Mô tả
    description: {
      type: String,
    },
    // Trạng thái
    isActive: {
      type: Boolean,
      default: true,
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
subjectSchema.index({ schoolId: 1, subjectCode: 1 }, { unique: true });
subjectSchema.index({ schoolId: 1, isActive: 1 });

const Subject = mongoose.model('Subject', subjectSchema);

export default Subject;
