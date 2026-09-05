import prisma from '../../database/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_here';

export class AuthService {
  static async registerUser(data: any) {
    const { email, phone, password, role, profileData } = data;

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] }
    });

    if (existingUser) {
      throw new Error('User already exists with this email or phone');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        password: hashedPassword,
        role: role as Role,
      }
    });

    // Create associated profile based on role
    if (role === Role.BUSINESS && profileData) {
      await prisma.business.create({
        data: {
          userId: user.id,
          name: profileData.name,
          slug: profileData.name.toLowerCase().replace(/ /g, '-'),
        }
      });
    } else if (role === Role.RIDER) {
      await prisma.rider.create({
        data: { userId: user.id }
      });
    }

    return user;
  }

  static async loginUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return { user, accessToken, refreshToken };
  }

  static async requestOtp(userId: string) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // In a real scenario we might save this in Redis or a dedicated OTP table.
    // For now we will use VerificationRecord as a placeholder or just log it.
    console.log(`[OTP Request] Generated OTP ${otp} for user ${userId}`);
    
    // Simulate sending OTP
    return { message: "OTP sent successfully (check console)" };
  }
}
