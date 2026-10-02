import { Request, Response } from 'express';
import { AuthService } from './auth.service';

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const user = await AuthService.registerUser(req.body);
      res.status(201).json({ message: 'User registered successfully', user });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const { user, accessToken, refreshToken } = await AuthService.loginUser(email, password);

      res.cookie('accessToken', accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
      res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

      res.status(200).json({ message: 'Login successful', user });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
  }

  static async requestOtp(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const response = await AuthService.requestOtp(email);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async verifyOtp(req: Request, res: Response) {
    try {
      const { email, code } = req.body;
      const response = await AuthService.verifyOtp(email, code);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const response = await AuthService.forgotPassword(email);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;
      const response = await AuthService.resetPassword(token, newPassword);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
