import Joi from 'joi';

// ==================== JOI CONFIGURATION ====================
// Custom error messages in Vietnamese with UTF-8 support
const customMessages = {
  'string.base': '{{#label}} phải là chuỗi văn bản',
  'string.empty': '{{#label}} không được để trống',
  'string.min': '{{#label}} phải có ít nhất {{#limit}} ký tự',
  'string.max': '{{#label}} không được vượt quá {{#limit}} ký tự',
  'string.length': '{{#label}} phải có đúng {{#limit}} ký tự',
  'string.pattern.base': '{{#label}} không đúng định dạng',
  'string.email': '{{#label}} phải là email hợp lệ',
  'number.base': '{{#label}} phải là số',
  'number.min': '{{#label}} phải lớn hơn hoặc bằng {{#limit}}',
  'number.max': '{{#label}} không được vượt quá {{#limit}}',
  'date.base': '{{#label}} phải là ngày hợp lệ',
  'date.max': '{{#label}} không được lớn hơn {{#limit}}',
  'any.required': '{{#label}} là bắt buộc',
  'any.only': '{{#label}} phải là một trong các giá trị: {{#valids}}',
};

// Configure Joi with UTF-8 support
const joiOptions = {
  errors: {
    wrap: {
      label: false
    }
  },
  messages: customMessages
};

// ==================== AUTH SCHEMAS ====================
export const registerSchema = Joi.object({
  username: Joi.string().min(3).max(20).pattern(/^[a-zA-Z0-9_]+$/).required().messages({
    'string.pattern.base': '{{#label}} chỉ được chứa chữ cái, số và dấu gạch dưới'
  }),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).optional(),
  fullName: Joi.string().min(2).required(),
  schoolName: Joi.string().min(3).max(200).required(),
  requestedRole: Joi.string().valid('admin', 'teacher', 'student', 'parent', 'user').optional().default('user'),
});

export const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
  schoolName: Joi.string().min(3).max(200).required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

// ==================== STUDENT SCHEMAS ====================
export const createStudentSchema = Joi.object({
  studentCode: Joi.string().trim().uppercase().required(),
  fullName: Joi.string().trim().min(2).required(),
  dateOfBirth: Joi.date().max('now').required(),
  gender: Joi.string().valid('male', 'female', 'other', 'Nam', 'Nữ', 'Khác').required(),
  placeOfBirth: Joi.string().trim().optional().allow(''),
  address: Joi.alternatives().try(
    Joi.string().allow(''),
    Joi.object({
      street: Joi.string().optional().allow(''),
      ward: Joi.string().optional().allow(''),
      district: Joi.string().optional().allow(''),
      city: Joi.string().optional().allow(''),
    })
  ).optional(),
  phone: Joi.string().trim().optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  guardian: Joi.object({
    name: Joi.string().optional().allow(''),
    phone: Joi.string().optional().allow(''),
    email: Joi.string().email().optional().allow(''),
    relationship: Joi.string().optional().allow(''),
  }).optional(),
  guardianInfo: Joi.object().optional(),
  classId: Joi.string().length(24).hex().optional().allow(null, ''),
  academicYear: Joi.string().optional().default(new Date().getFullYear().toString()),
  status: Joi.string().valid('active', 'suspended', 'transferred', 'graduated', 'Dang h?c', 'Ngh? h?c', 'Chuy?n tru?ng', 'T?t nghi?p').default('active'),
  healthInfo: Joi.object().optional(),
  avatar: Joi.string().uri().optional().allow(''),
  notes: Joi.string().optional().allow(''),
});

export const updateStudentSchema = Joi.object({
  studentCode: Joi.string().trim().uppercase().optional(),
  fullName: Joi.string().trim().min(2).optional(),
  dateOfBirth: Joi.date().max('now').optional(),
  gender: Joi.string().valid('male', 'female', 'other', 'Nam', 'Nữ', 'Khác').optional(),
  placeOfBirth: Joi.string().trim().optional().allow(''),
  address: Joi.alternatives().try(
    Joi.string().allow(''),
    Joi.object({
      street: Joi.string().optional().allow(''),
      ward: Joi.string().optional().allow(''),
      district: Joi.string().optional().allow(''),
      city: Joi.string().optional().allow(''),
    })
  ).optional(),
  phone: Joi.string().trim().optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  guardian: Joi.object({
    name: Joi.string().optional().allow(''),
    phone: Joi.string().optional().allow(''),
    email: Joi.string().email().optional().allow(''),
    relationship: Joi.string().optional().allow(''),
  }).optional(),
  guardianInfo: Joi.object().optional(),
  classId: Joi.string().length(24).hex().optional().allow(null, ''),
  academicYear: Joi.string().optional(),
  status: Joi.string().valid('active', 'suspended', 'transferred', 'graduated', 'Dang h?c', 'Ngh? h?c', 'Chuy?n tru?ng', 'T?t nghi?p').optional(),
  healthInfo: Joi.object().optional(),
  avatar: Joi.string().uri().optional().allow(''),
  notes: Joi.string().optional().allow(''),
}).min(1);

// ==================== CLASS SCHEMAS ====================
const classStatusValues = [
  'Đang hoạt động',
  'Dang hoat dong',
  'Đã kết thúc',
  'Da ket thuc',
  'Tạm ngưng',
  'Tam ngung',
];

export const createClassSchema = Joi.object({
  name: Joi.string().trim().min(2).required().label('Tên lớp'),
  className: Joi.string().trim().min(2).optional().label('Tên lớp (alias)'),
  classCode: Joi.string().trim().uppercase().required().label('Mã lớp'),
  grade: Joi.number().integer().min(10).max(12).required().label('Khối'),
  academicYear: Joi.string().required().label('Năm học'),
  homeroomTeacher: Joi.alternatives().try(
    Joi.string().length(24).hex(),
    Joi.string().min(2).pattern(/^[a-zA-ZÀ-ỹ\s]+$/)
  ).optional().allow('', null).label('Giáo viên chủ nhiệm'),
  capacity: Joi.number().integer().min(1).default(40).label('Sĩ số tối đa'),
  classroom: Joi.string().trim().optional().allow('').label('Phòng học'),
  status: Joi.string().valid(...classStatusValues).default(classStatusValues[0]).label('Trạng thái'),
  notes: Joi.string().optional().allow('').label('Ghi chú'),
}).custom((value) => {
  if (!value.className) {
    value.className = value.name;
  }
  return value;
}, 'apply className fallback').messages(customMessages);

export const updateClassSchema = Joi.object({
  name: Joi.string().trim().min(2).optional().label('Tên lớp'),
  className: Joi.string().trim().min(2).optional().label('Tên lớp (alias)'),
  classCode: Joi.string().trim().uppercase().optional().label('Mã lớp'),
  grade: Joi.number().integer().min(10).max(12).optional().label('Khối'),
  academicYear: Joi.string().optional().label('Năm học'),
  homeroomTeacher: Joi.alternatives().try(
    Joi.string().length(24).hex(),
    Joi.string().min(2).pattern(/^[a-zA-ZÀ-ỹ\s]+$/)
  ).optional().allow('', null).label('Giáo viên chủ nhiệm'),
  capacity: Joi.number().integer().min(1).optional().label('Sĩ số tối đa'),
  classroom: Joi.string().trim().optional().allow('').label('Phòng học'),
  status: Joi.string().valid(...classStatusValues).optional().label('Trạng thái'),
  notes: Joi.string().optional().allow('').label('Ghi chú'),
}).custom((value, helpers) => {
  if (!Object.keys(value).length) {
    return helpers.error('any.invalid');
  }
  if (value.name && !value.className) {
    value.className = value.name;
  }
  return value;
}, 'validate class payload').messages(customMessages);

// ==================== ATTENDANCE SCHEMAS ====================
const attendanceStatusValues = [
  'present',
  'absent_excused',
  'absent_unexcused',
  'late',
  'left_early',
  'Có mặt',
  'Vắng có phép',
  'Vắng không phép',
  'Đi muộn',
  'Đi trễ',
  'Về sớm',
];
export const markAttendanceSchema = Joi.object({
  classId: Joi.string().length(24).hex().required(),
  date: Joi.date().max('now').required(),
  session: Joi.string().valid('Sáng', 'Chiều', 'Cả ngày').default('Cả ngày'),
  attendanceData: Joi.array().items(
    Joi.object({
      studentId: Joi.string().length(24).hex().required(),
      status: Joi.string().valid(...attendanceStatusValues).required(),
      note: Joi.string().trim().optional(),
      period: Joi.number().integer().min(1).max(10).optional(),
    })
  ).min(1).required(),
});

// ==================== SCORE SCHEMAS ====================
export const enterScoresSchema = Joi.object({
  classId: Joi.string().length(24).hex().required(),
  subjectId: Joi.string().length(24).hex().required(),
  semester: Joi.number().integer().valid(1, 2).required(),
  academicYear: Joi.string().required(),
  scoreType: Joi.string().valid('Miệng', '15 phút', '1 tiết', 'Giữa kỳ', 'Cuối kỳ').required(),
  scoresData: Joi.array().items(
    Joi.object({
      studentId: Joi.string().length(24).hex().required(),
      score: Joi.number().min(0).max(10).required(),
      note: Joi.string().trim().optional(),
    })
  ).min(1).required(),
});

export const updateScoreSchema = Joi.object({
  score: Joi.number().min(0).max(10).required(),
  note: Joi.string().trim().optional(),
});

// ==================== SUBJECT SCHEMAS ====================
export const createSubjectSchema = Joi.object({
  subjectCode: Joi.string().trim().uppercase().required(),
  subjectName: Joi.string().trim().min(2).required(),
  coefficient: Joi.number().min(1).default(1),
  type: Joi.string().valid('Bắt buộc', 'Tự chọn').default('Bắt buộc'),
  grades: Joi.array().items(Joi.number().integer().min(10).max(12)).min(1).required(),
  description: Joi.string().optional(),
});

export const updateSubjectSchema = Joi.object({
  subjectCode: Joi.string().trim().uppercase().optional(),
  subjectName: Joi.string().trim().min(2).optional(),
  coefficient: Joi.number().min(1).optional(),
  type: Joi.string().valid('Bắt buộc', 'Tự chọn').optional(),
  grades: Joi.array().items(Joi.number().integer().min(10).max(12)).min(1).optional(),
  description: Joi.string().optional(),
}).min(1);

// ==================== PAYMENT SCHEMAS ====================
export const recordPaymentSchema = Joi.object({
  paymentId: Joi.string().length(24).hex().required(),
  amountPaid: Joi.number().positive().required(),
  paymentMethod: Joi.string().valid('Tiền mặt', 'Chuyển khoản', 'Thẻ', 'Ví điện tử', 'Khác').required(),
  transactionId: Joi.string().trim().optional(),
  note: Joi.string().trim().optional(),
});

// ==================== ENGLISH LEARNING SCHEMAS ====================
export const submitAttemptSchema = Joi.object({
  itemId: Joi.string().length(24).hex().required().label('Item ID'),
  userAnswer: Joi.string().optional().allow('').label('User Answer'),
  transcript: Joi.string().optional().allow('').label('Transcript'),
  latencyMs: Joi.number().min(0).optional().label('Latency'),
  durationMs: Joi.number().min(0).optional().label('Duration')
});

export const generateItemSchema = Joi.object({
  type: Joi.string().valid('vocab', 'grammar', 'reading', 'listening').required().label('Type'),
  topic: Joi.string().optional().default('general').label('Topic'),
  cefr: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional().default('B1').label('CEFR Level')
});

export const generateTestSchema = Joi.object({
  sections: Joi.array().items(Joi.string().valid('vocab', 'grammar', 'reading', 'listening')).required().label('Sections'),
  topic: Joi.string().optional().default('general').label('Topic'),
  cefr: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional().default('B1').label('CEFR Level')
});

export const assessSpeechSchema = Joi.object({
  referenceText: Joi.string().required().label('Reference Text'),
  transcript: Joi.string().required().label('Transcript'),
  durationMs: Joi.number().min(0).optional().label('Duration')
});

export const pushSubscriptionSchema = Joi.object({
  endpoint: Joi.string().uri().required().label('Endpoint'),
  keys: Joi.object({
    p256dh: Joi.string().required().label('P256DH Key'),
    auth: Joi.string().required().label('Auth Key')
  }).required().label('Keys')
});

export const setReminderSchema = Joi.object({
  hourLocal: Joi.number().min(0).max(23).required().label('Hour'),
  channel: Joi.string().valid('push', 'email').optional().default('push').label('Channel'),
  active: Joi.boolean().optional().default(true).label('Active')
});

// ==================== VALIDATION MIDDLEWARE ====================
export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
      escapeHtml: false // Preserve UTF-8 characters
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details,
        },
      });
    }

    req.body = value;
    next();
  };
};

// Export schemas object for backward compatibility
export const schemas = {
  submitAttempt: submitAttemptSchema,
  generateItem: generateItemSchema,
  generateTest: generateTestSchema,
  assessSpeech: assessSpeechSchema,
  pushSubscription: pushSubscriptionSchema,
  setReminder: setReminderSchema
};














