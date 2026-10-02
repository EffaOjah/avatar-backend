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
}
