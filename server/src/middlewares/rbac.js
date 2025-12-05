/**
 * RBAC (Role-Based Access Control) Middleware
 * Enforces permission-based access control for protected routes
 * 
 * Usage:
 * - requirePermission('canCreate') - Requires specific permission
 * - requireAdmin() - Requires admin role
 * - requireAuth() - Just authentication check (from auth.js)
 */

import { errorResponse } from '../utils/response.js';

/**
 * Middleware: Require specific permission
 * @param {string} permission - Permission name (canCreate, canUpdate, canDelete, canViewAll, canManageUsers, canManageSchool)
 * @returns {Function} Express middleware
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated (should be set by requireAuth middleware)
      if (!req.user) {
        return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
      }

      // Check if user has required permission
      if (!req.user.hasPermission(permission)) {
        return errorResponse(
          res, 
          `Bạn không có quyền thực hiện thao tác này. Yêu cầu quyền: ${permission}`,
          'PERMISSION_DENIED',
          403
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Failed to check permissions', 'INTERNAL_ERROR', 500);
    }
  };
};

/**
 * Middleware: Require admin role
 * @returns {Function} Express middleware
 */
export const requireAdmin = () => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
      }

      if (!req.user.isAdmin()) {
        return errorResponse(
          res, 
          'Chỉ QUẢN TRỊ VIÊN mới có quyền truy cập chức năng này',
          'ADMIN_ONLY',
          403
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Failed to check admin role', 'INTERNAL_ERROR', 500);
    }
  };
};

/**
 * Middleware: Require ownership (user can only access their own data)
 * @param {string} paramName - Parameter name in req.params (default: 'id')
 * @param {string} userField - Field in req.user to compare (default: '_id')
 * @returns {Function} Express middleware
 */
export const requireOwnership = (paramName = 'id', userField = '_id') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
      }

      const resourceId = req.params[paramName];
      const userId = req.user[userField]?.toString();

      // Admin can access everything
      if (req.user.isAdmin()) {
        return next();
      }

      // Check ownership
      if (resourceId !== userId) {
        return errorResponse(
          res, 
          'Bạn chỉ có thể truy cập dữ liệu của chính mình',
          'OWNERSHIP_REQUIRED',
          403
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Failed to check ownership', 'INTERNAL_ERROR', 500);
    }
  };
};

/**
 * Middleware: Require same school (workspace isolation check)
 * Ensures user can only access data from their school
 * @param {Function} getSchoolId - Function to extract schoolId from request (req => schoolId)
 * @returns {Function} Express middleware
 */
export const requireSameSchool = (getSchoolId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
      }

      const targetSchoolId = await getSchoolId(req);
      
      if (!targetSchoolId) {
        return errorResponse(res, 'School ID not found in request', 'INVALID_REQUEST', 400);
      }

      // Check if user belongs to the same school
      if (!req.user.isSameSchool(targetSchoolId)) {
        return errorResponse(
          res, 
          'Bạn không thể truy cập dữ liệu của trường khác',
          'CROSS_SCHOOL_ACCESS_DENIED',
          403
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Failed to verify school access', 'INTERNAL_ERROR', 500);
    }
  };
};

/**
 * Middleware: Log permission check (for audit trail)
 * @param {string} action - Action description
 * @returns {Function} Express middleware
 */
export const logPermissionCheck = (action) => {
  return (req, res, next) => {
    console.log(`[RBAC] User ${req.user?.username} (${req.user?.role}) attempting: ${action}`);
    next();
  };
};

/**
 * Helper: Check multiple permissions (OR logic)
 * User needs at least ONE of the specified permissions
 * @param {...string} permissions - Permission names
 * @returns {Function} Express middleware
 */
export const requireAnyPermission = (...permissions) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
      }

      const hasAnyPermission = permissions.some(perm => req.user.hasPermission(perm));

      if (!hasAnyPermission) {
        return errorResponse(
          res, 
          `Yêu cầu ít nhất một trong các quyền: ${permissions.join(', ')}`,
          'PERMISSION_DENIED',
          403
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Failed to check permissions', 'INTERNAL_ERROR', 500);
    }
  };
};

/**
 * Helper: Check multiple permissions (AND logic)
 * User needs ALL of the specified permissions
 * @param {...string} permissions - Permission names
 * @returns {Function} Express middleware
 */
export const requireAllPermissions = (...permissions) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return errorResponse(res, 'Authentication required', 'UNAUTHORIZED', 401);
      }

      const hasAllPermissions = permissions.every(perm => req.user.hasPermission(perm));

      if (!hasAllPermissions) {
        return errorResponse(
          res, 
          `Yêu cầu tất cả các quyền: ${permissions.join(', ')}`,
          'PERMISSION_DENIED',
          403
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Failed to check permissions', 'INTERNAL_ERROR', 500);
    }
  };
};
