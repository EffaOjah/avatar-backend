import { Request, Response } from 'express';
import { ProductsService } from './products.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export class ProductsController {
  static async getProducts(req: Request, res: Response) {
    try {
      const { businessId, categoryId } = req.query;
      const products = await ProductsService.getProducts({ 
        businessId: businessId as string, 
        categoryId: categoryId as string 
      });
      res.status(200).json({ products });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getProductById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const product = await ProductsService.getProductById(id);
      res.status(200).json({ product });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async createProduct(req: AuthRequest, res: Response) {
    try {
      const product = await ProductsService.createProduct(req.user!.id, req.body);
      res.status(201).json({ message: 'Product created successfully', product });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async updateProduct(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const product = await ProductsService.updateProduct(req.user!.id, id, req.body);
      res.status(200).json({ message: 'Product updated successfully', product });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteProduct(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      await ProductsService.deleteProduct(req.user!.id, id);
      res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async uploadImages(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        res.status(400).json({ error: 'No image files provided' });
        return;
      }
      const product = await ProductsService.uploadImages(req.user!.id, id, req.files as Express.Multer.File[]);
      res.status(200).json({ message: 'Product images uploaded successfully', product });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
