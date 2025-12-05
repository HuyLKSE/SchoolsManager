import { User } from '../models/User.js';
import { School } from '../models/School.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { ROLES } from '../constants/roles.js';
import * as SchoolService from '../services/schoolService.js';
import * as UserService from '../services/userService.js';
import { ensureSchoolWorkspace } from '../services/workspaceService.js';
import { withTransactionRetry } from '../utils/transaction.js';
import logger from '../config/logger.js'; // <-- QUAN TRỌNG: Phải import cái này

export const register = async (req, res) => {
  try {
    const { username, email, password, fullName, schoolName, requestedRole } = req.body;

    // Thay console.log bằng logger.info
    logger.info('📥 Register Request: %o', { username, email, fullName, schoolName, requestedRole });

    return await withTransactionRetry(async (session) => {
      // 1. Find or create school
      const { school, isNewSchool } = await SchoolService.findOrCreateSchool(schoolName, session);

      // 2. Check subscription
      SchoolService.checkSubscription(school);

      // 3. Ensure workspace exists
      try {
        await ensureSchoolWorkspace(school, session);
      } catch (workspaceError) {
        // Thay console.error bằng logger.error
        logger.error('Ensure school workspace failed: %o', workspaceError);
        throw new Error('Khong the khoi tao workspace cho truong');
      }

      // 4. Check duplicates
      if (await UserService.checkEmailExists(email, school._id, session)) {
        return errorResponse(res, 'Email da ton tai trong truong nay', 'EMAIL_EXISTS', 400);
      }
      if (await UserService.checkUsernameExists(username, school._id, session)) {
        return errorResponse(res, 'Ten dang nhap da ton tai trong truong nay', 'USERNAME_EXISTS', 400);
      }

      // 5. Determine Role
      const userCount = await UserService.countUsersInSchool(school._id, session);
      let assignedRole;
      let requiresApproval = false;

      if (isNewSchool || userCount === 0) {
        assignedRole = ROLES.ADMIN;
      } else {
        if (requestedRole === ROLES.ADMIN) {
          assignedRole = ROLES.USER;
          requiresApproval = true;
        } else if (requestedRole && [ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT].includes(requestedRole)) {
          assignedRole = requestedRole;
          requiresApproval = true;
        } else {
          assignedRole = ROLES.USER;
        }
      }

      // 6. Create User
      const user = await UserService.createUser({
        username,
        email,
        password,
        fullName,
        role: assignedRole,
        schoolId: school._id,
        isActive: !requiresApproval,
      }, session);

      // 7. Update school stats
      if (assignedRole === ROLES.ADMIN) {
        school.totalTeachers += 1;
        await school.save({ session });
      }

      // 8. Response
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.refreshToken;

      return successResponse(
        res,
        {
          user: userResponse,
          school: {
            _id: school._id,
            schoolName: school.schoolName,
            schoolCode: school.schoolCode,
          },
          isFirstUser: isNewSchool || userCount === 0,
          requiresApproval,
        },
        requiresApproval
          ? 'Dang ky thanh cong! Tai khoan cua ban can duoc quan tri vien duyet truoc khi su dung.'
          : (isNewSchool || userCount === 0)
            ? 'Dang ky thanh cong! Ban la quan tri vien dau tien cua truong.'
            : 'Dang ky thanh cong! Vui long dang nhap.',
        201
      );
    });
  } catch (error) {
    logger.error('Register error: %o', error); // Dùng logger
    if (res.headersSent) return;
    return errorResponse(res, error.message || 'Loi he thong khi dang ky', 'REGISTER_ERROR', 500);
  }
};

export const login = async (req, res) => {
  try {
    const { username, password, schoolName } = req.body;

    // Log info login attempt
    logger.info('Login attempt: %o', { username, schoolName });

    const school = await School.findOne({
      schoolName: { $regex: new RegExp(`^${schoolName.trim()}$`, 'i') }
    });

    if (!school) {
      logger.warn('School not found: %s', schoolName); // Dùng logger.warn cho lỗi logic nhẹ
      return errorResponse(res, 'Truong khong ton tai trong he thong', 'SCHOOL_NOT_FOUND', 404);
    }

    if (!school.isSubscriptionActive()) {
      return errorResponse(res, 'Truong da het han dang ky. Vui long lien he quan tri vien', 'SUBSCRIPTION_EXPIRED', 403);
    }

    const user = await User.findOne({
      schoolId: school._id,
      $or: [{ username }, { email: username }]
    }).populate('schoolId', 'schoolName schoolCode');

    if (!user) {
      logger.warn('User not found in school: %o', { username, schoolId: school._id });
      return errorResponse(res, 'Email hoac ten dang nhap khong ton tai trong truong nay', 'USER_NOT_FOUND', 401);
    }

    if (!user.isActive) {
      logger.warn('User inactive: %s', username);
      return errorResponse(res, 'Tai khoan da bi vo hieu hoa. Lien he quan tri vien', 'ACCOUNT_DISABLED', 401);
    }

    // Verify password - KHÔNG LOG PASSWORD, KỂ CẢ LENGTH
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      logger.warn('Invalid password for user: %s', username);
      return errorResponse(res, 'Mat khau khong dung', 'INVALID_PASSWORD', 401);
    }

    const accessToken = generateAccessToken({
      userId: user._id,
      role: user.role,
      schoolId: user.schoolId._id,
      permissions: user.permissions,
      englishEnabled: user.englishProfile?.enabled ?? false,
      cefr: user.englishProfile?.cefr ?? 'A1',
    });
    const refreshToken = generateRefreshToken({
      userId: user._id,
      schoolId: user.schoolId._id,
    });

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshToken;

    return successResponse(
      res,
      {
        user: userResponse,
        school: {
          _id: user.schoolId._id,
          schoolName: user.schoolId.schoolName,
          schoolCode: user.schoolId.schoolCode,
        },
        accessToken
      },
      `Chao mung ${user.role === ROLES.ADMIN ? 'Quan tri vien' : 'Nguoi dung'} ${user.fullName}!`
    );
  } catch (error) {
    logger.error('Login error: %o', error);
    return errorResponse(res, error.message, 'LOGIN_ERROR', 500);
  }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return errorResponse(res, 'Refresh token khong ton tai', 'NO_REFRESH_TOKEN', 401);
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return errorResponse(res, 'Refresh token khong hop le', 'INVALID_REFRESH_TOKEN', 401);
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive || user.refreshToken !== refreshToken) {
      return errorResponse(res, 'Refresh token khong hop le', 'INVALID_REFRESH_TOKEN', 401);
    }

    if (!user.schoolId) {
      return errorResponse(res, 'Tai khoan chua duoc gan truong', 'NO_SCHOOL_ASSIGNED', 403);
    }

    const newAccessToken = generateAccessToken({
      userId: user._id,
      role: user.role,
      schoolId: user.schoolId,
      permissions: user.permissions,
      englishEnabled: user.englishProfile?.enabled ?? false,
      cefr: user.englishProfile?.cefr ?? 'A1',
    });

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return successResponse(res, { accessToken: newAccessToken }, 'Lam moi token thanh cong');
  } catch (error) {
    logger.error('Refresh error: %o', error);
    return errorResponse(res, error.message, 'REFRESH_ERROR', 500);
  }
};

export const logout = async (req, res) => {
  try {
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          refreshToken: null,
          lastLogout: new Date(),
        }
      });
    }

    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    return successResponse(res, { redirectTo: '/login' }, 'Dang xuat thanh cong');
  } catch (error) {
    logger.error('Logout error: %o', error);
    return errorResponse(res, 'Loi khi dang xuat', 'LOGOUT_ERROR', 500);
  }
};

export const getProfile = async (req, res) => {
  return successResponse(res, { user: req.user }, 'Lay thong tin thanh cong');
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'Thieu mat khau hien tai hoac mat khau moi', 'MISSING_FIELDS', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'Mat khau moi phai co it nhat 6 ky tu', 'INVALID_PASSWORD', 400);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return errorResponse(res, 'Khong tim thay nguoi dung', 'USER_NOT_FOUND', 404);
    }

    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return errorResponse(res, 'Mat khau hien tai khong dung', 'INVALID_CURRENT_PASSWORD', 401);
    }

    user.password = newPassword;
    user.refreshToken = null;
    await user.save();

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return successResponse(res, null, 'Doi mat khau thanh cong. Vui long dang nhap lai');
  } catch (error) {
    logger.error('Change password error: %o', error);
    return errorResponse(res, error.message, 'CHANGE_PASSWORD_ERROR', 500);
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { fullName, email, phone, avatar } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return errorResponse(res, 'Khong tim thay nguoi dung', 'USER_NOT_FOUND', 404);
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
      if (existingUser) {
        return errorResponse(res, 'Email da duoc su dung', 'EMAIL_EXISTS', 400);
      }
      user.email = email;
    }

    if (fullName) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    return successResponse(res, { user }, 'Cap nhat thong tin thanh cong');
  } catch (error) {
    logger.error('Update profile error: %o', error);
    return errorResponse(res, error.message, 'UPDATE_PROFILE_ERROR', 500);
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshToken')
      .populate('schoolId', 'schoolName');

    if (!user) {
      return errorResponse(res, 'User not found', 'USER_NOT_FOUND', 404);
    }

    return successResponse(res, user, 'User fetched successfully');
  } catch (error) {
    logger.error('Get Me error: %o', error);
    return errorResponse(res, 'Error fetching user', 'FETCH_ERROR', 500, [error.message]);
  }
};
