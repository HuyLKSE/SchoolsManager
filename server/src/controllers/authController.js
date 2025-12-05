import { User } from '../models/User.js';
import { School } from '../models/School.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { ensureSchoolWorkspace } from '../services/workspaceService.js';

export const register = async (req, res) => {
  try {
    const { username, email, password, fullName, schoolName, requestedRole } = req.body;

    // DEBUG: Log received data
    console.log('📥 Register Request:', { username, email, fullName, schoolName, requestedRole });

    // Validate required fields
    if (!username || !email || !password || !fullName || !schoolName) {
      console.log('❌ Missing fields:', { username, email, password: !!password, fullName, schoolName });
      return errorResponse(res, 'Vui long dien day du thong tin bat buoc', 'MISSING_FIELDS', 400);
    }

    // Validate schoolName
    if (schoolName.trim().length < 3) {
      return errorResponse(res, 'Ten truong phai co it nhat 3 ky tu', 'INVALID_SCHOOL_NAME', 400);
    }

    // Validate username format (only letters, numbers, underscore)
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return errorResponse(res, 'Ten dang nhap chi duoc chua chu cai, so va dau gach duoi (3-20 ky tu)', 'INVALID_USERNAME', 400);
    }

    // Validate password strength
    if (password.length < 6) {
      return errorResponse(res, 'Mat khau phai co it nhat 6 ky tu', 'WEAK_PASSWORD', 400);
    }

    // Find or create school (Multi-tenant isolation)
    let school = await School.findOne({
      schoolName: { $regex: new RegExp(`^${schoolName.trim()}$`, 'i') }
    });

    let isNewSchool = false;
    if (!school) {
      // Create new school (first user will be admin)
      school = new School({
        schoolName: schoolName.trim(),
        isActive: true,
      });
      await school.save();
      isNewSchool = true;
    }

    // Check if subscription is active
    if (!school.isSubscriptionActive()) {
      return errorResponse(res, 'Truong da het han dang ky. Vui long lien he quan tri vien', 'SUBSCRIPTION_EXPIRED', 403);
    }

    try {
      await ensureSchoolWorkspace(school);
    } catch (workspaceError) {
      console.error('Ensure school workspace failed:', workspaceError);
      return errorResponse(res, 'Khong the khoi tao workspace cho truong', 'WORKSPACE_ERROR', 500);
    }

    // Check email duplicate WITHIN this school (workspace isolation)
    const existingEmail = await User.findOne({
      email,
      schoolId: school._id
    });
    if (existingEmail) {
      return errorResponse(res, 'Email da ton tai trong truong nay', 'EMAIL_EXISTS', 400);
    }

    // Check username duplicate WITHIN this school
    const existingUsername = await User.findOne({
      username,
      schoolId: school._id
    });
    if (existingUsername) {
      return errorResponse(res, 'Ten dang nhap da ton tai trong truong nay', 'USERNAME_EXISTS', 400);
    }

    // Determine role logic:
    // 1. If new school (first user) -> MUST be admin
    // 2. If existing school + requestedRole = 'admin' -> Need existing admin approval (default to user)
    // 3. If existing school + requestedRole = 'user' -> user role
    const userCount = await User.countDocuments({ schoolId: school._id });
    let assignedRole;
    let requiresApproval = false;

    if (isNewSchool || userCount === 0) {
      // First user of new school = admin automatically
      assignedRole = 'admin';
    } else {
      // Existing school
      if (requestedRole === 'admin') {
        // Request admin role -> needs approval, default to inactive user
        assignedRole = 'user';
        requiresApproval = true;
      } else if (requestedRole && ['teacher', 'student', 'parent'].includes(requestedRole)) {
        // Assign requested role (teacher/student/parent need approval)
        assignedRole = requestedRole;
        requiresApproval = true;
      } else {
        // Regular user registration
        assignedRole = 'user';
      }
    }

    const user = new User({
      username,
      email,
      password, // Will be hashed in pre-save hook
      fullName,
      role: assignedRole,
      schoolId: school._id,
      isActive: !requiresApproval, // If requires approval, set inactive
    });
    await user.save();

    // Update school statistics
    if (assignedRole === 'admin') {
      school.totalTeachers += 1;
    }
    await school.save();

    // Don't send password in response
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
  } catch (error) {
    console.error('Register error:', error);
    return errorResponse(res, error.message || 'Loi he thong khi dang ky', 'REGISTER_ERROR', 500);
  }
};

export const login = async (req, res) => {
  try {
    const { username, password, schoolName } = req.body;

    // Validate schoolName
    if (!schoolName || schoolName.trim().length < 3) {
      return errorResponse(res, 'Vui long nhap ten truong', 'SCHOOL_NAME_REQUIRED', 400);
    }

    // Find school (Multi-tenant isolation)
    console.log('Login attempt:', { username, schoolName });
    const school = await School.findOne({
      schoolName: { $regex: new RegExp(`^${schoolName.trim()}$`, 'i') }
    });

    if (!school) {
      console.log('School not found:', schoolName);
      return errorResponse(res, 'Truong khong ton tai trong he thong', 'SCHOOL_NOT_FOUND', 404);
    }

    // Check if subscription is active
    if (!school.isSubscriptionActive()) {
      return errorResponse(res, 'Truong da het han dang ky. Vui long lien he quan tri vien', 'SUBSCRIPTION_EXPIRED', 403);
    }

    // Find user within this school's workspace
    const user = await User.findOne({
      schoolId: school._id, // CRITICAL: workspace isolation
      $or: [{ username }, { email: username }]
    }).populate('schoolId', 'schoolName schoolCode');

    // Check if user exists in this school
    if (!user) {
      console.log('User not found in school:', { username, schoolId: school._id });
      return errorResponse(res, 'Email hoac ten dang nhap khong ton tai trong truong nay', 'USER_NOT_FOUND', 401);
    }

    // Check if account is active
    if (!user.isActive) {
      console.log('User inactive:', username);
      return errorResponse(res, 'Tai khoan da bi vo hieu hoa. Lien he quan tri vien', 'ACCOUNT_DISABLED', 401);
    }

    // Verify password (kiểm tra mật khẩu trong database)
    console.log(`Verifying password for ${username}. Received length: ${password.length}, Stored hash start: ${user.password.substring(0, 10)}`);
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      console.log(`Invalid password for user: '${username}'`);
      return errorResponse(res, 'Mat khau khong dung', 'INVALID_PASSWORD', 401);
    }

    // Generate tokens for session (include schoolId for workspace isolation + English profile)
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

    // Update user in database
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    // Set httpOnly cookies for security
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Don't send sensitive data in response
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
      `Chao mung ${user.role === 'admin' ? 'Quan tri vien' : 'Nguoi dung'} ${user.fullName}!`
    );
  } catch (error) {
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
    return errorResponse(res, error.message, 'REFRESH_ERROR', 500);
  }
};

export const logout = async (req, res) => {
  try {
    // Clear user's refresh token from database (invalidate all sessions)
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          refreshToken: null,
          lastLogout: new Date(),
        }
      });
    }

    // Clear all auth cookies
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

    // Return success response - client will redirect to /login
    return successResponse(res, { redirectTo: '/login' }, 'Dang xuat thanh cong');
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse(res, 'Loi khi dang xuat', 'LOGOUT_ERROR', 500);
  }
};

export const getProfile = async (req, res) => {
  return successResponse(res, { user: req.user }, 'Lay thong tin thanh cong');
};

// Change password
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
    user.refreshToken = null; // Invalidate all refresh tokens
    await user.save();

    // Clear cookies to force re-login
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return successResponse(res, null, 'Doi mat khau thanh cong. Vui long dang nhap lai');
  } catch (error) {
    return errorResponse(res, error.message, 'CHANGE_PASSWORD_ERROR', 500);
  }
};

// Update profile
export const updateProfile = async (req, res) => {
  try {
    const { fullName, email, phone, avatar } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return errorResponse(res, 'Khong tim thay nguoi dung', 'USER_NOT_FOUND', 404);
    }

    // Check if email is already taken by another user
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
    return errorResponse(res, error.message, 'UPDATE_PROFILE_ERROR', 500);
  }
};

// Get current user info
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
    return errorResponse(res, 'Error fetching user', 'FETCH_ERROR', 500, [error.message]);
  }
};
