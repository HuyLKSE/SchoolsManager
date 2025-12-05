import mongoose from 'mongoose';

const feeSchema = new mongoose.Schema(
  {
    // Tên khoản phí
    feeName: {
      type: String,
      required: [true, 'Tên khoản phí là bắt buộc'],
      trim: true,
    },
    // Loại phí
    feeType: {
      type: String,
      enum: ['Học phí', 'Bảo hiểm', 'Đồng phục', 'Ăn trưa', 'Xe đưa đón', 'Khác'],
      required: true,
    },
    // Số tiền
    amount: {
      type: Number,
      required: [true, 'Số tiền là bắt buộc'],
      min: 0,
    },
    // Áp dụng cho khối/lớp
    appliesTo: {
      type: String,
      enum: ['Tất cả', 'Khối 10', 'Khối 11', 'Khối 12', 'Lớp cụ thể'],
      default: 'Tất cả',
    },
    // ID lớp cụ thể (nếu appliesTo = 'Lớp cụ thể')
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    // Năm học
    academicYear: {
      type: String,
      required: [true, 'Năm học là bắt buộc'],
    },
    // Học kỳ (null = cả năm)
    semester: {
      type: Number,
      enum: [null, 1, 2],
      default: null,
    },
    // Hạn nộp
    dueDate: {
      type: Date,
      required: [true, 'Hạn nộp là bắt buộc'],
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
feeSchema.index({ schoolId: 1, academicYear: 1, isActive: 1 });
feeSchema.index({ dueDate: 1 });

const Fee = mongoose.model('Fee', feeSchema);

export default Fee;
