import { Router } from 'express';
import { CategoriesController } from './categories.controller';
import { authenticate, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { createCategorySchema } from './categories.schema';

const router = Router();

router.get('/', CategoriesController.getCategories);
router.post('/', authenticate, authorizeRoles('ADMIN'), validate(createCategorySchema), CategoriesController.createCategory);
router.post('/:id/image', authenticate, authorizeRoles('ADMIN'), upload.single('image'), CategoriesController.uploadImage);

export default router;
