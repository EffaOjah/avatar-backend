import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    phone: z.string().optional(),
    role: z.nativeEnum(Role, {
      message: 'Invalid role specified',
    }),
    profileData: z.object({
      name: z.string().min(2, 'Name must be at least 2 characters long'),
    }).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const requestOtpSchema = z.object({
  body: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
});
