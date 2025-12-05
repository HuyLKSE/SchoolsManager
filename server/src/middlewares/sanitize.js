import mongoSanitize from 'express-mongo-sanitize';

/**
 * Sanitize user input to prevent NoSQL injection
 * Removes keys that start with '$' or contain '.'
 */
export const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️  Sanitized input: ${key} in ${req.path}`);
  },
});

/**
 * Trim string inputs recursively
 */
export const trimInputs = (req, res, next) => {
  const trimValue = (value) => {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Array.isArray(value)) {
      return value.map(trimValue);
    }
    if (value && typeof value === 'object') {
      const trimmed = {};
      for (const key in value) {
        trimmed[key] = trimValue(value[key]);
      }
      return trimmed;
    }
    return value;
  };

  if (req.body) {
    req.body = trimValue(req.body);
  }
  if (req.query) {
    req.query = trimValue(req.query);
  }
  if (req.params) {
    req.params = trimValue(req.params);
  }

  next();
};
