import { z } from 'zod';

export const updateProfileSchema = z.object({
  body: z.object({
    phone: z.string().optional(),
    business: z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      logoUrl: z.string().url().optional(),
      coverImageUrl: z.string().url().optional(),
      address: z.string().optional(),
      locationLat: z.number().optional(),
      locationLng: z.number().optional(),
    }).optional(),
    rider: z.object({
      // Add any specific rider fields here in the future
    }).optional(),
  }),
});
