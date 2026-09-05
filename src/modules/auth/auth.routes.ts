import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middlewares/validate.middleware';
import { registerSchema, loginSchema, requestOtpSchema } from './auth.schema';

const router = Router();

router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login', validate(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/otp/request', validate(requestOtpSchema), AuthController.requestOtp);

export default router;
