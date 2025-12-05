import mongoose from 'mongoose';

const schoolSchema = new mongoose.Schema(
  {
    schoolName: {
      type: String,
      required: [true, 'Ten truong la bat buoc'],
      unique: true,
      trim: true,
      minlength: [3, 'Ten truong phai co it nhat 3 ky tu'],
      maxlength: [200, 'Ten truong khong duoc qua 200 ky tu'],
    },
    schoolCode: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    principalName: {
      type: String,
      trim: true,
    },
    establishedYear: {
      type: Number,
      min: 1900,
      max: new Date().getFullYear(),
    },
    // Số lượng thống kê
    totalStudents: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalTeachers: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalClasses: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Trạng thái
    isActive: {
      type: Boolean,
      default: true,
    },
    subscriptionPlan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free',
    },
    subscriptionExpiresAt: {
      type: Date,
      default: () => {
        // Free trial 30 days
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      },
    },
    // Settings
    settings: {
      academicYearStart: {
        type: Number,
        default: 9, // September
        min: 1,
        max: 12,
      },
      semestersPerYear: {
        type: Number,
        default: 2,
        min: 1,
        max: 4,
      },
      gradesOffered: {
        type: [String],
        default: ['10', '11', '12'], // THPT
      },
      currency: {
        type: String,
        default: 'VND',
      },
      timezone: {
        type: String,
        default: 'Asia/Ho_Chi_Minh',
      },
    },
    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

schoolSchema.add({
  workspace: {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    code: String,
    path: String,
  },
});

// Indexes for performance (don't duplicate with unique: true in schema)
schoolSchema.index({ isActive: 1 });
schoolSchema.index({ createdAt: -1 });
schoolSchema.index({ 'workspace.workspaceId': 1 }, { sparse: true });

// Auto-generate schoolCode from schoolName
schoolSchema.pre('save', function (next) {
  if (!this.schoolCode && this.schoolName) {
    // Generate code from name: "THPT Nguyen Hue" -> "THPTNH"
    const words = this.schoolName
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => word[0].toUpperCase());
    this.schoolCode = words.join('');
    
    // Add random suffix if needed for uniqueness
    if (this.isNew) {
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      this.schoolCode += randomSuffix;
    }
  }
  next();
});

// Virtual for full info
schoolSchema.virtual('fullInfo').get(function () {
  return `${this.schoolName} (${this.schoolCode})`;
});

// Instance method to check if subscription is active
schoolSchema.methods.isSubscriptionActive = function () {
  return this.isActive && this.subscriptionExpiresAt > new Date();
};

// Instance method to get remaining subscription days
schoolSchema.methods.getRemainingDays = function () {
  if (!this.subscriptionExpiresAt) return 0;
  const now = new Date();
  const diff = this.subscriptionExpiresAt - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

// Static method to find active schools
schoolSchema.statics.findActive = function () {
  return this.find({
    isActive: true,
    subscriptionExpiresAt: { $gt: new Date() },
  });
};

// Static method to search schools by name
schoolSchema.statics.searchByName = function (searchTerm) {
  return this.find({
    schoolName: { $regex: searchTerm, $options: 'i' },
    isActive: true,
  }).select('schoolName schoolCode address');
};

export const School = mongoose.model('School', schoolSchema);
