import { Router } from 'express';
import { UsersController } from './users.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/me', authenticate, UsersController.getProfile);

export default router;
