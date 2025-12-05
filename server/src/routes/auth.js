import express from 'express';
import { 
  register, 
  login, 
  refresh, 
  logout, 
  getProfile, 
  changePassword, 
  updateProfile,
  getMe
} from '../controllers/authController.js';
import { validate, registerSchema, loginSchema } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);

export default router;
