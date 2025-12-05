/**
 * Sanitize and validate user-facing text
 * Prevents encoding issues and XSS
 */

/**
 * Sanitize user fullName for display
 * @param {string} name - User fullName
 * @returns {string} - Sanitized name
 */
export function sanitizeDisplayName(name) {
  if (!name || typeof name !== 'string') {
    return 'User';
  }
  
  // Trim whitespace
  let sanitized = name.trim();
  
  // Remove control characters and non-printable characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  
  // Remove any HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Ensure valid UTF-8 by removing invalid characters
  sanitized = sanitized.replace(/[^\u0000-\u007F\u0080-\uFFFF]/g, '');
  
  // If empty after sanitization, return default
  if (sanitized.length === 0) {
    return 'User';
  }
  
  return sanitized;
}

/**
 * Get safe first character for avatar
 * @param {string} name - User fullName
 * @returns {string} - Single uppercase character
 */
export function getSafeInitial(name) {
  const sanitized = sanitizeDisplayName(name);
  
  // Get first letter that is alphanumeric
  const match = sanitized.match(/[a-zA-ZÀ-ỹ]/);
  if (match) {
    return match[0].toUpperCase();
  }
  
  // Fallback to first character if no letters found
  return sanitized.charAt(0).toUpperCase() || 'U';
}

/**
 * Ensure string is valid UTF-8
 * @param {string} str - Input string
 * @returns {string} - UTF-8 valid string
 */
export function ensureUTF8(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }
  
  try {
    // Try to encode/decode to ensure valid UTF-8
    const buffer = Buffer.from(str, 'utf8');
    return buffer.toString('utf8');
  } catch (error) {
    // If encoding fails, remove non-ASCII characters
    return str.replace(/[^\x00-\x7F]/g, '');
  }
}

/**
 * Sanitize email for display
 * @param {string} email - Email address
 * @returns {string} - Sanitized email
 */
export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return '';
  }
  
  // Convert to lowercase and trim
  const sanitized = email.toLowerCase().trim();
  
  // Basic email validation pattern
  const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  
  if (emailPattern.test(sanitized)) {
    return sanitized;
  }
  
  return '';
}
