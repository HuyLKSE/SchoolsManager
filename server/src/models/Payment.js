import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    // Học sinh
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student ID là bắt buộc'],
    },
    // Khoản phí
    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Fee',
      required: [true, 'Fee ID là bắt buộc'],
    },
    // Số tiền phải nộp
    amountDue: {
      type: Number,
      required: true,
      min: 0,
    },
    // Số tiền đã nộp
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Giảm giá/Miễn giảm
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Lý do giảm giá
    discountReason: {
      type: String,
    },
    // Trạng thái thanh toán
    status: {
      type: String,
      enum: ['Chưa thanh toán', 'Thanh toán một phần', 'Đã thanh toán', 'Quá hạn'],
      default: 'Chưa thanh toán',
    },
    // Ngày thanh toán
    paidDate: {
      type: Date,
    },
    // Phương thức thanh toán
    paymentMethod: {
      type: String,
      enum: ['Tiền mặt', 'Chuyển khoản', 'Thẻ', 'Ví điện tử', 'Khác'],
    },
    // Mã giao dịch (nếu online)
    transactionId: {
      type: String,
    },
    // Người thu tiền
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Ghi chú
    note: {
      type: String,
    },
    // Hóa đơn (file path hoặc URL)
    invoice: {
      type: String,
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
paymentSchema.index({ studentId: 1, feeId: 1 }, { unique: true });
paymentSchema.index({ schoolId: 1, status: 1 });
paymentSchema.index({ paidDate: 1 });

// Tự động cập nhật trạng thái
paymentSchema.pre('save', function (next) {
  const totalDue = this.amountDue - this.discount;
  
  if (this.amountPaid === 0) {
    this.status = 'Chưa thanh toán';
  } else if (this.amountPaid >= totalDue) {
    this.status = 'Đã thanh toán';
    if (!this.paidDate) {
      this.paidDate = new Date();
    }
  } else {
    this.status = 'Thanh toán một phần';
  }
  
  next();
});

// Virtual: Số tiền còn nợ
paymentSchema.virtual('amountRemaining').get(function () {
  return Math.max(0, this.amountDue - this.discount - this.amountPaid);
});

paymentSchema.set('toJSON', { virtuals: true });
paymentSchema.set('toObject', { virtuals: true });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
