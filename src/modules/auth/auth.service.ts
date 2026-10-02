import prisma from '../../database/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { sendEmail } from '../../utils/email';

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
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Incorrect password');
    }

    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return { user, accessToken, refreshToken };
  }

  static async requestOtp(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('User not found');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Save or update OTP in DB
    await prisma.otpCode.upsert({
      where: { email },
      update: { code, expiresAt },
      create: { email, code, expiresAt }
    });

    console.log(`[OTP Request] Generated OTP ${code} for email ${email}`);

    // Send OTP via email
    await sendEmail(
      email,
      'Your AVATAR Verification Code',
      `Your verification code is: ${code}. It expires in 10 minutes.`,
      `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 10 minutes.</p>`
    );

    return { message: "OTP sent successfully" };
  }

  static async verifyOtp(email: string, code: string) {
    const otpRecord = await prisma.otpCode.findUnique({ where: { email } });

    if (!otpRecord) {
      throw new Error('No OTP request found for this email');
    }

    if (otpRecord.code !== code) {
      throw new Error('Invalid OTP');
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new Error('OTP has expired');
    }

    // Mark user as active if this is a registration verification
    const user = await prisma.user.update({
      where: { email },
      data: { isActive: true },
      select: { id: true, email: true, role: true, isActive: true }
    });

    // Delete the OTP record so it can't be reused
    await prisma.otpCode.delete({ where: { email } });

    return { message: "OTP verified successfully", user };
  }

  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond with success to prevent user enumeration attacks
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await prisma.passwordResetToken.upsert({
      where: { email },
      update: { token, expiresAt },
      create: { email, token, expiresAt },
    });

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    await sendEmail(
      email,
      'Reset your AVATAR password',
      `Click the link to reset your password: ${resetLink}. This link expires in 1 hour.`,
      `<p>Click the link below to reset your AVATAR password:</p>
       <p><a href="${resetLink}">Reset Password</a></p>
       <p>This link expires in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>`
    );

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  static async resetPassword(token: string, newPassword: string) {
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record) {
      throw new Error('Invalid or expired reset token');
    }

    if (new Date() > record.expiresAt) {
      await prisma.passwordResetToken.delete({ where: { token } });
      throw new Error('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email: record.email },
      data: { password: hashedPassword },
    });

    // Invalidate the token after use
    await prisma.passwordResetToken.delete({ where: { token } });

    return { message: 'Password reset successfully. You can now log in.' };
  }
}
