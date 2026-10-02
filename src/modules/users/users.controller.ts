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

  static async becomeBusiness(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const profile = await UsersService.becomeBusiness(userId, req.body);
      res.status(201).json({ message: 'Successfully converted to a business account', profile });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async uploadAvatar(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      if (!req.file) { res.status(400).json({ error: 'No image file provided' }); return; }
      const profile = await UsersService.uploadAvatar(userId, req.file);
      res.status(200).json({ message: 'Avatar uploaded successfully', profile });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async uploadBusinessLogo(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      if (!req.file) { res.status(400).json({ error: 'No image file provided' }); return; }
      const profile = await UsersService.uploadBusinessImage(userId, req.file, 'logoUrl');
      res.status(200).json({ message: 'Business logo uploaded successfully', profile });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async uploadBusinessCover(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
      if (!req.file) { res.status(400).json({ error: 'No image file provided' }); return; }
      const profile = await UsersService.uploadBusinessImage(userId, req.file, 'coverImageUrl');
      res.status(200).json({ message: 'Business cover uploaded successfully', profile });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
