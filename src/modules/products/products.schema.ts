import { z } from 'zod';

export const createProductSchema = z.object({
  body: z.object({
    categoryId: z.string().uuid('Invalid category ID'),
    name: z.string().min(2, 'Product name must be at least 2 characters'),
    description: z.string().optional(),
    price: z.number().positive('Price must be greater than 0'),
    inventory: z.number().int().nonnegative('Inventory cannot be negative').default(0),
    variants: z.array(z.any()).optional(),
    isAvailable: z.boolean().optional(),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    categoryId: z.string().uuid().optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    price: z.number().positive().optional(),
    inventory: z.number().int().nonnegative().optional(),
    variants: z.array(z.any()).optional(),
    isAvailable: z.boolean().optional(),
  }),
});
