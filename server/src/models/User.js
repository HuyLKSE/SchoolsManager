import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['admin', 'teacher', 'student', 'parent', 'user'], // Extended roles
    default: 'user'
  },
  // Optional: Link to specific entities
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    default: null
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    default: null
  },
  // Permissions for RBAC
  permissions: {
    canCreate: {
      type: Boolean,
      default: false, // Only admin can create
    },
    canUpdate: {
      type: Boolean,
      default: false, // Only admin can update
    },
    canDelete: {
      type: Boolean,
      default: false, // Only admin can delete
    },
    canViewAll: {
      type: Boolean,
      default: false, // Only admin can view all data
    },
    canManageUsers: {
      type: Boolean,
      default: false, // Only admin can manage users
    },
    canManageSchool: {
      type: Boolean,
      default: false, // Only admin can manage school settings
    },
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true, // MUST belong to a school
    // index: true, // Removed - using compound index below
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  refreshToken: String,

  // English Learning Profile (NEW)
  englishProfile: {
    enabled: {
      type: Boolean,
      default: false  // Admin must enable for students
    },
    // Placement Test tracking
    initialTestDone: {
      type: Boolean,
      default: false
    },
    placementTestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EnglishPlacementTest'
    },
    placementResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EnglishPlacementResult'
    },
    placementDate: Date,
    // Current level
    cefr: {
      type: String,
      enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      default: 'A1'
    },
    // Study tracking
    streak: {
      type: Number,
      default: 0
    },
    xp: {
      type: Number,
      default: 0
    },
    badges: [{
      id: String,
      name: String,
      earnedAt: Date,
      icon: String
    }],
    lastStudyDate: {
      type: Date
    },
    totalStudyMinutes: {
      type: Number,
      default: 0
    },
    // Goals
    goals: {
      dailyMinutes: {
        type: Number,
        default: 30
      },
      itemsPerDay: {
        type: Number,
        default: 20
      }
    },
    // Stats by skill
    stats: {
      totalAttempts: { type: Number, default: 0 },
      correctAttempts: { type: Number, default: 0 },
      accuracy: { type: Number, default: 0 },
      vocabMastered: { type: Number, default: 0 },
      grammarMastered: { type: Number, default: 0 },
      readingScore: { type: Number, default: 0 },
      speakingScore: { type: Number, default: 0 }
    },
    timezone: {
      type: String,
      default: 'Asia/Ho_Chi_Minh'
    }
  }
}, {
  timestamps: true
});

// Set permissions based on role before save
userSchema.pre('save', async function (next) {
  // Hash password
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // Auto-set permissions based on role (using rolePresets)
  if (this.isModified('role')) {
    // Import dynamically to avoid circular dependency
    const { getPermissionsByRole } = await import('../utils/rolePresets.js');
    this.permissions = getPermissionsByRole(this.role);

    // Legacy code below for reference (now replaced by rolePresets)
    /*
    if (this.role === 'admin') {
      this.permissions = {
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canViewAll: true,
        canManageUsers: true,
        canManageSchool: true,
      };
    } else {
      // User role: read-only + basic operations
      this.permissions = {
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canViewAll: false,
        canManageUsers: false,
        canManageSchool: false,
      };
    }
    */
  }

  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user has specific permission
userSchema.methods.hasPermission = function (permission) {
  return this.permissions && this.permissions[permission] === true;
};

// Check if user is admin
userSchema.methods.isAdmin = function () {
  return this.role === 'admin';
};

// Check if user belongs to same school
userSchema.methods.isSameSchool = function (targetSchoolId) {
  return this.schoolId && this.schoolId.toString() === targetSchoolId.toString();
};

// Hide password in JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

// Indexes for multi-tenant queries and role-based access
userSchema.index({ schoolId: 1, role: 1 });
userSchema.index({ schoolId: 1, isActive: 1 });
userSchema.index({ schoolId: 1, email: 1 });
userSchema.index({ role: 1, createdAt: -1 });

export const User = mongoose.model('User', userSchema);
