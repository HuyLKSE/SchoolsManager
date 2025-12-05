import AuditLog from '../models/AuditLog.js';
import logger from '../config/logger.js';

/**
 * Middleware để log audit trail
 * @param {string} action - Hành động (STUDENT_CREATE, SCORE_UPDATE, etc.)
 * @param {string} resourceType - Loại resource (Student, Score, Payment, etc.)
 */
export const auditLog = (action, resourceType) => {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Flag to prevent duplicate logging
    let logged = false;

    // Override res.json to capture response
    res.json = function (data) {
      if (!logged) {
        logAudit(req, res, data, action, resourceType);
        logged = true;
      }
      return originalJson.call(this, data);
    };

    // Override res.send to capture response
    res.send = function (data) {
      if (!logged) {
        logAudit(req, res, data, action, resourceType);
        logged = true;
      }
      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Log audit trail to database
 */
const logAudit = async (req, res, responseData, action, resourceType) => {
  try {
    // Only log if user is authenticated
    if (!req.user) return;

    // Determine status from response
    const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';

    // Extract resource ID from response or request
    let resourceId = null;
    if (responseData?.data?._id) {
      resourceId = responseData.data._id;
    } else if (req.params?.id) {
      resourceId = req.params.id;
    } else if (req.body?.studentId || req.body?.paymentId || req.body?.scoreId) {
      resourceId = req.body.studentId || req.body.paymentId || req.body.scoreId;
    }

    // Get IP address
    const ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown';

    // Prepare audit log data
    const auditData = {
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action,
      resourceType,
      resourceId,
      oldData: req.body.oldData || null, // If provided by controller
      newData: status === 'success' ? req.body : null,
      ipAddress,
      userAgent: req.headers['user-agent'] || 'unknown',
      status,
      errorMessage: status === 'failure' ? responseData?.message : null,
      metadata: {
        method: req.method,
        path: req.path,
        query: req.query,
      },
      schoolId: req.user.schoolId,
    };

    // Save to database (async, don't block response)
    await AuditLog.create(auditData);

    // Log to Winston
    logger.info(`[AUDIT] ${action} by ${req.user.email} - Status: ${status}`, {
      action,
      userId: req.user._id,
      resourceType,
      resourceId,
      status,
    });
  } catch (error) {
    // Don't throw error, just log it
    logger.error('Audit log error:', error);
  }
};

/**
 * Helper function để manually log audit (cho complex operations)
 */
export const createAuditLog = async ({
  userId,
  userEmail,
  userRole,
  action,
  resourceType,
  resourceId,
  oldData,
  newData,
  schoolId,
  ipAddress,
  userAgent,
  metadata,
}) => {
  try {
    await AuditLog.create({
      userId,
      userEmail,
      userRole,
      action,
      resourceType,
      resourceId,
      oldData,
      newData,
      ipAddress,
      userAgent,
      status: 'success',
      metadata,
      schoolId,
    });

    logger.info(`[AUDIT] ${action} by ${userEmail}`, {
      action,
      userId,
      resourceType,
      resourceId,
    });
  } catch (error) {
    logger.error('Create audit log error:', error);
  }
};
