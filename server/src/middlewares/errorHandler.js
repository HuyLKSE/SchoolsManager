import { config } from '../config/env.js';

/**
 * Global error handler middleware
 * Catches all errors and returns consistent JSON response
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error caught by errorHandler:', {
    message: err.message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Du lieu khong hop le',
        details,
      },
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json({
      error: {
        code: 'DUPLICATE_ERROR',
        message: `Gia tri '${field}' da ton tai`,
        details: [{ field, message: 'Trung lap du lieu' }],
      },
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: 'ID khong hop le',
        details: [{ field: err.path, message: 'Dinh dang ID khong dung' }],
      },
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: {
        code: 'TOKEN_INVALID',
        message: 'Token khong hop le',
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Token da het han',
      },
    });
  }

  // Custom application errors (if err.statusCode is set)
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Loi he thong';

  return res.status(statusCode).json({
    error: {
      code,
      message: config.nodeEnv === 'development' ? message : 'Loi he thong',
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Khong tim thay endpoint: ${req.method} ${req.path}`,
    },
  });
};
