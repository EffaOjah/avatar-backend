import { Request, Response } from 'express';
import { CategoriesService } from './categories.service';

export class CategoriesController {
  static async getCategories(req: Request, res: Response) {
    try {
      const categories = await CategoriesService.getCategories();
      res.status(200).json({ categories });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createCategory(req: Request, res: Response) {
    try {
      const category = await CategoriesService.createCategory(req.body);
      res.status(201).json({ message: 'Category created successfully', category });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async uploadImage(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      if (!req.file) { res.status(400).json({ error: 'No image file provided' }); return; }
      const category = await CategoriesService.uploadImage(id, req.file);
      res.status(200).json({ message: 'Category image uploaded', category });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
