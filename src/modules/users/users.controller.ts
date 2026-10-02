import { Request, Response } from 'express';
import { UsersService } from './users.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export class UsersController {
  static async getProfile(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const profile = await UsersService.getUserProfile(userId);
      res.status(200).json({ profile });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async updateProfile(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const profile = await UsersService.updateUserProfile(userId, req.body);
      res.status(200).json({ message: 'Profile updated successfully', profile });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
