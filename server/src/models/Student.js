import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
  {
    // Mã học sinh (unique)
    studentCode: {
      type: String,
      required: [true, 'Mã học sinh là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    // Thông tin cơ bản
    fullName: {
      type: String,
      required: [true, 'Họ tên là bắt buộc'],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Ngày sinh là bắt buộc'],
    },
    gender: {
      type: String,
      enum: ['Nam', 'Nữ', 'Khác'],
      required: [true, 'Giới tính là bắt buộc'],
    },
    placeOfBirth: {
      type: String,
      trim: true,
    },
    // Địa chỉ
    address: {
      street: String,
      ward: String,
      district: String,
      city: String,
    },
    // Liên hệ
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    // Thông tin gia đình
    guardianInfo: {
      fatherName: String,
      fatherPhone: String,
      fatherJob: String,
      motherName: String,
      motherPhone: String,
      motherJob: String,
      guardianName: String,
      guardianPhone: String,
      guardianRelation: String,
    },
    // Thông tin học tập
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    classWorkspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    academicYear: {
      type: String,
      required: true,
    },
    enrollmentDate: {
      type: Date,
      default: Date.now,
    },
    // Trạng thái
    status: {
      type: String,
      enum: ['Đang học', 'Đã tốt nghiệp', 'Chuyển trường', 'Bỏ học'],
      default: 'Đang học',
    },
    // Sức khỏe
    healthInfo: {
      bloodType: String,
      allergies: String,
      medicalNotes: String,
      insuranceNumber: String,
    },
    // Ảnh
    avatar: {
      type: String,
      default: '',
    },
    // Ghi chú
    notes: {
      type: String,
    },
    // Liên kết với User (nếu học sinh có tài khoản)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Lịch sử chuyển lớp
    transferHistory: [
      {
        fromClassId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Class',
        },
        toClassId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Class',
        },
        transferDate: {
          type: Date,
          default: Date.now,
        },
        reason: String,
        transferredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],
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

// Index để tìm kiếm nhanh
studentSchema.index({ schoolId: 1, studentCode: 1 }, { unique: true });
studentSchema.index({ fullName: 'text' });
studentSchema.index({ classId: 1 });
studentSchema.index({ classWorkspaceId: 1 }, { sparse: true });
studentSchema.index({ schoolId: 1, status: 1 });
studentSchema.index({ schoolId: 1, academicYear: 1 });

const Student = mongoose.model('Student', studentSchema);

export default Student;
