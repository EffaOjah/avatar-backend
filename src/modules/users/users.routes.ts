import { Router } from 'express';
import { UsersController } from './users.controller';
import { authenticate, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { updateProfileSchema, becomeBusinessSchema } from './users.schema';

const router = Router();

router.get('/me', authenticate, UsersController.getProfile);
router.put('/me', authenticate, validate(updateProfileSchema), UsersController.updateProfile);
router.post('/become-business', authenticate, validate(becomeBusinessSchema), UsersController.becomeBusiness);
router.post('/me/avatar', authenticate, upload.single('avatar'), UsersController.uploadAvatar);
router.post('/business/logo', authenticate, authorizeRoles('BUSINESS'), upload.single('logo'), UsersController.uploadBusinessLogo);
router.post('/business/cover', authenticate, authorizeRoles('BUSINESS'), upload.single('cover'), UsersController.uploadBusinessCover);

export default router;
