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
}
