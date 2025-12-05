import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    // Người thực hiện
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Username/email để dễ tra cứu
    userEmail: {
      type: String,
      required: true,
    },
    // Role của user
    userRole: {
      type: String,
      required: true,
    },
    // Action thực hiện
    action: {
      type: String,
      required: true,
      enum: [
        // Student actions
        'STUDENT_CREATE',
        'STUDENT_UPDATE',
        'STUDENT_DELETE',
        'STUDENT_TRANSFER',
        'STUDENT_BULK_IMPORT',
        // Score actions
        'SCORE_ENTER',
        'SCORE_UPDATE',
        'SCORE_DELETE',
        'SCORE_LOCK',
        'SCORE_UNLOCK',
        // Payment actions
        'PAYMENT_CREATE',
        'PAYMENT_RECORD',
        'PAYMENT_DELETE',
        'PAYMENT_DISCOUNT',
        'PAYMENT_BULK_CREATE',
        // Class actions
        'CLASS_CREATE',
        'CLASS_UPDATE',
        'CLASS_DELETE',
        // Auth actions
        'USER_LOGIN',
        'USER_LOGOUT',
        'USER_REGISTER',
        'PASSWORD_CHANGE',
        'PROFILE_UPDATE',
        // Fee actions
        'FEE_CREATE',
        'FEE_UPDATE',
        'FEE_DELETE',
        // Permission actions
        'PERMISSION_UPDATE',
        'PERMISSION_BULK_UPDATE',
        'ROLE_APPLY',
        'USER_APPROVE',
        'USER_REJECT',
        'USER_DELETE',
      ],
    },
    // Resource type (model name)
    resourceType: {
      type: String,
      required: true,
    },
    // Resource ID
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    // Dữ liệu trước khi thay đổi
    oldData: mongoose.Schema.Types.Mixed,
    // Dữ liệu sau khi thay đổi
    newData: mongoose.Schema.Types.Mixed,
    // IP address
    ipAddress: {
      type: String,
    },
    // User agent (browser)
    userAgent: {
      type: String,
    },
    // Trạng thái (success/failure)
    status: {
      type: String,
      enum: ['success', 'failure'],
      default: 'success',
    },
    // Error message (nếu có)
    errorMessage: {
      type: String,
    },
    // Metadata bổ sung
    metadata: mongoose.Schema.Types.Mixed,
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

// Indexes
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ schoolId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
