import prisma from '../../database/prisma';

export class CategoriesService {
  static async getCategories() {
    return prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  static async createCategory(data: { name: string, description?: string, imageUrl?: string }) {
    let slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    // Check for existing slug
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      slug += `-${Math.floor(Math.random() * 10000)}`;
    }

    return prisma.category.create({
      data: {
        ...data,
        slug,
      },
    });
  }

  static async uploadImage(categoryId: string, file: Express.Multer.File) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new Error('Category not found');
    const ext = file.mimetype.split('/')[1];
    const path = `category-${categoryId}/image.${ext}`;
    const { uploadFile } = await import('../../utils/storage');
    const url = await uploadFile('categories', path, file.buffer, file.mimetype);
    return prisma.category.update({ where: { id: categoryId }, data: { imageUrl: url } });
  }
}
