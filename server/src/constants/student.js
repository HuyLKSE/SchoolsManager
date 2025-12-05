export const GENDER_DEFINITIONS = [
  { canonical: 'Nam', aliases: ['nam', 'male', 'm', 'boy', 'trai'] },
  { canonical: 'Nữ', aliases: ['nu', 'nữ', 'female', 'f', 'girl', 'gai'] },
  { canonical: 'Khác', aliases: ['khac', 'other', 'non-binary', 'nb'] },
];

export const STATUS_DEFINITIONS = [
  { canonical: 'Đang học', aliases: ['dang hoc', 'active', 'enrolled', 'studying'] },
  { canonical: 'Nghỉ học', aliases: ['nghi hoc', 'inactive', 'suspended', 'pause'] },
  { canonical: 'Chuyển trường', aliases: ['chuyen truong', 'transferred', 'transfer'] },
  { canonical: 'Tốt nghiệp', aliases: ['tot nghiep', 'graduated', 'graduation'] },
];

export const CANONICAL_GENDERS = GENDER_DEFINITIONS.map((item) => item.canonical);
export const CANONICAL_STATUSES = STATUS_DEFINITIONS.map((item) => item.canonical);

const normalizeFromDefinitions = (value, definitions) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const sanitized = value.trim().toLowerCase();
  if (!sanitized) {
    return null;
  }

  for (const definition of definitions) {
    if (definition.aliases.some((alias) => alias.toLowerCase() === sanitized)) {
      return definition.canonical;
    }
  }

  return null;
};

export const normalizeGender = (value) =>
  normalizeFromDefinitions(value, GENDER_DEFINITIONS);

export const normalizeStudentStatus = (value) =>
  normalizeFromDefinitions(value, STATUS_DEFINITIONS);
