import { Router } from 'express';
import { ProductsController } from './products.controller';
import { authenticate, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { createProductSchema, updateProductSchema } from './products.schema';

const router = Router();

// Public routes
router.get('/', ProductsController.getProducts);
router.get('/:id', ProductsController.getProductById);

// Business-only routes
router.post('/', authenticate, authorizeRoles('BUSINESS'), validate(createProductSchema), ProductsController.createProduct);
router.put('/:id', authenticate, authorizeRoles('BUSINESS'), validate(updateProductSchema), ProductsController.updateProduct);
router.delete('/:id', authenticate, authorizeRoles('BUSINESS'), ProductsController.deleteProduct);
router.post('/:id/images', authenticate, authorizeRoles('BUSINESS'), upload.array('images', 5), ProductsController.uploadImages);

export default router;
