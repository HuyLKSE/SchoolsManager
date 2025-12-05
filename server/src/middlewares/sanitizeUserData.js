import { sanitizeDisplayName, getSafeInitial } from '../utils/textSanitizer.js';

/**
 * Middleware to sanitize user data before passing to views
 * Prevents encoding issues and ensures clean display
 */
export const sanitizeUserData = (req, res, next) => {
  // Only run if user exists
  if (req.user) {
    // Sanitize fullName
    if (req.user.fullName) {
      req.user.fullName = sanitizeDisplayName(req.user.fullName);
    }
    
    // Add helper method for initial
    req.user.getInitial = function() {
      return getSafeInitial(this.fullName || this.username);
    };
  }
  
  // Add sanitizer helper to res.locals for views
  res.locals.sanitize = sanitizeDisplayName;
  res.locals.getInitial = getSafeInitial;
  
  next();
};
