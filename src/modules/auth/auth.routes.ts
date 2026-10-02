import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middlewares/validate.middleware';
import { registerSchema, loginSchema, requestOtpSchema, verifyOtpSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema';

const router = Router();

router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login', validate(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/otp/request', validate(requestOtpSchema), AuthController.requestOtp);
router.post('/otp/verify', validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/forgot-password', validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), AuthController.resetPassword);

export default router;
