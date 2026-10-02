import prisma from '../../database/prisma';

export class UsersService {
  static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        business: true,
        rider: true,
        addresses: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Omit password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static async updateUserProfile(userId: string, data: any) {
    const { phone, business } = data;

    // Verify user exists and get their role
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Update core user data
    if (phone !== undefined) {
      // Check if phone is already taken by someone else
      if (phone !== null) {
        const existing = await prisma.user.findUnique({ where: { phone } });
        if (existing && existing.id !== userId) {
          throw new Error('Phone number is already in use');
        }
      }
      await prisma.user.update({
        where: { id: userId },
        data: { phone }
      });
    }

    // Update role-specific profile data
    if (user.role === 'BUSINESS' && business) {
      const updateData: any = { ...business };
      
      // If name changes, we auto-update the slug
      if (business.name) {
        updateData.slug = business.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        // Ensure new slug is unique
        const existingSlug = await prisma.business.findUnique({ where: { slug: updateData.slug } });
        if (existingSlug && existingSlug.userId !== userId) {
          // Append random string if slug collision
          updateData.slug += `-${Math.floor(Math.random() * 10000)}`;
        }
      }

      await prisma.business.update({
        where: { userId },
        data: updateData
      });
    }

    // Return the fresh updated profile
    return this.getUserProfile(userId);
  }

  static async becomeBusiness(userId: string, data: { name: string, description?: string, address?: string }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { business: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.business) {
      throw new Error('User already has a business account');
    }

    // Generate unique slug
    let slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existingSlug = await prisma.business.findUnique({ where: { slug } });
    if (existingSlug) {
      slug += `-${Math.floor(Math.random() * 10000)}`;
    }

    // Create business profile
    await prisma.business.create({
      data: {
        userId,
        name: data.name,
        slug,
        description: data.description,
        address: data.address,
      },
    });

    // Update user role to BUSINESS to grant business permissions
    if (user.role === 'CUSTOMER') {
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'BUSINESS' },
      });
    }

    return this.getUserProfile(userId);
  }

  static async uploadAvatar(userId: string, file: Express.Multer.File) {
    const ext = file.mimetype.split('/')[1];
    const path = `user-${userId}/avatar.${ext}`;
    const { uploadFile } = await import('../../utils/storage');
    const url = await uploadFile('avatars', path, file.buffer, file.mimetype);
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    return this.getUserProfile(userId);
  }

  static async uploadBusinessImage(userId: string, file: Express.Multer.File, type: 'logoUrl' | 'coverImageUrl') {
    const business = await prisma.business.findUnique({ where: { userId } });
    if (!business) throw new Error('User does not have a business profile');

    const ext = file.mimetype.split('/')[1];
    const path = `business-${business.id}/${type}.${ext}`;
    const { uploadFile } = await import('../../utils/storage');
    const url = await uploadFile('businesses', path, file.buffer, file.mimetype);
    
    await prisma.business.update({ where: { userId }, data: { [type]: url } });
    return this.getUserProfile(userId);
  }
}
