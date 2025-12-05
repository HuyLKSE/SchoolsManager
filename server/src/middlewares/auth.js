import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { resolveSchoolId } from '../utils/school.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Vui long dang nhap',
        },
      });
    }

    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_INVALID',
          message: 'Token khong hop le',
        },
      });
    }

    const user = await User.findById(decoded.userId).select('-password -refreshToken');

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Nguoi dung khong ton tai',
        },
      });
    }

    if (!user.schoolId) {
      return res.status(403).json({
        error: {
          code: 'NO_SCHOOL_ASSIGNED',
          message: 'Tai khoan chua duoc gan truong. Lien he quan tri vien',
        },
      });
    }

    // Expose english flags on the request for downstream middleware
    user.englishEnabled = user.englishProfile?.enabled ?? false;
    user.cefr = user.englishProfile?.cefr ?? 'A1';

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'AUTH_ERROR',
        message: 'Loi xac thuc',
      },
    });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Vui long dang nhap',
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Khong co quyen truy cap',
        },
      });
    }

    next();
  };
};

// Alias for better naming (as per UserAdmin.md spec)
export const requireAuth = authenticate;
export const requireRole = authorize;
