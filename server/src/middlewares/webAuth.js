import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';

/**
 * Middleware to protect web routes (dashboard, students, etc.)
 * Checks for accessToken cookie and verifies user session
 * Redirects to /login if not authenticated
 */
export const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    // No token = not logged in -> redirect to login
    if (!token) {
      return res.redirect('/login?error=unauthorized&message=Vui+long+dang+nhap');
    }

    // Verify token
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.redirect('/login?error=invalid_token&message=Phien+dang+nhap+da+het+han');
    }

    // Check user exists in database and is active
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user || !user.isActive) {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.redirect('/login?error=user_not_found&message=Tai+khoan+khong+ton+tai');
    }

    // Normalize english flags for view rendering and middlewares
    user.englishEnabled = user.englishProfile?.enabled ?? false;
    user.cefr = user.englishProfile?.cefr ?? 'A1';

    // Check schoolId assigned
    if (!user.schoolId) {
      return res.redirect('/login?error=no_school&message=Tai+khoan+chua+duoc+gan+truong');
    }

    // Set user in request for use in views
    req.user = user;
    res.locals.user = user; // Make available in EJS templates
    
    next();
  } catch (error) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    return res.redirect('/login?error=auth_error&message=Loi+xac+thuc');
  }
};

/**
 * Middleware to redirect already logged in users away from login/register pages
 */
export const redirectIfAuthenticated = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return next();
    }

    const decoded = verifyAccessToken(token);
    if (decoded) {
      const user = await User.findById(decoded.userId);
      if (user && user.isActive) {
        // Already logged in -> redirect to dashboard
        return res.redirect('/dashboard');
      }
    }

    next();
  } catch (error) {
    // Token invalid, continue to login/register page
    next();
  }
};
