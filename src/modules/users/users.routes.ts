import { Router } from 'express';
import { UsersController } from './users.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { updateProfileSchema } from './users.schema';

const router = Router();

router.get('/me', authenticate, UsersController.getProfile);
router.put('/me', authenticate, validate(updateProfileSchema), UsersController.updateProfile);

export default router;
