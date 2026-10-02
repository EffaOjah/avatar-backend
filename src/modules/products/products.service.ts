import prisma from '../../database/prisma';

export class ProductsService {
  static async getProducts(filters: { businessId?: string; categoryId?: string }) {
    return prisma.product.findMany({
      where: {
        isDeleted: false,
        ...(filters.businessId && { businessId: filters.businessId }),
        ...(filters.categoryId && { categoryId: filters.categoryId }),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        business: { select: { id: true, name: true, slug: true } },
        images: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getProductById(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, isDeleted: false },
      include: {
        category: true,
        business: { select: { id: true, name: true, slug: true } },
        images: true,
      },
    });
    if (!product) throw new Error('Product not found');
    return product;
  }

  static async createProduct(userId: string, data: any) {
    const business = await prisma.business.findUnique({ where: { userId } });
    if (!business) throw new Error('User does not have a business profile');

    return prisma.product.create({
      data: {
        ...data,
        businessId: business.id,
      },
      include: { category: true }
    });
  }

  static async updateProduct(userId: string, productId: string, data: any) {
    const business = await prisma.business.findUnique({ where: { userId } });
    if (!business) throw new Error('User does not have a business profile');

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.isDeleted) throw new Error('Product not found');
    
    if (product.businessId !== business.id) {
      throw new Error('You do not have permission to update this product');
    }

    return prisma.product.update({
      where: { id: productId },
      data,
      include: { category: true }
    });
  }

  static async deleteProduct(userId: string, productId: string) {
    const business = await prisma.business.findUnique({ where: { userId } });
    if (!business) throw new Error('User does not have a business profile');

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.isDeleted) throw new Error('Product not found');
    
    if (product.businessId !== business.id) {
      throw new Error('You do not have permission to delete this product');
    }

    // Soft delete
    return prisma.product.update({
      where: { id: productId },
      data: { isDeleted: true },
    });
  }

  static async uploadImages(userId: string, productId: string, files: Express.Multer.File[]) {
    const business = await prisma.business.findUnique({ where: { userId } });
    if (!business) throw new Error('User does not have a business profile');

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.isDeleted) throw new Error('Product not found');
    
    if (product.businessId !== business.id) {
      throw new Error('You do not have permission to modify this product');
    }

    const { uploadFile } = await import('../../utils/storage');
    
    await Promise.all(
      files.map(async (file, index) => {
        const ext = file.mimetype.split('/')[1];
        const path = `product-${productId}/image-${Date.now()}-${index}.${ext}`;
        const url = await uploadFile('products', path, file.buffer, file.mimetype);
        
        return prisma.productImage.create({
          data: {
            productId,
            url,
            isPrimary: index === 0, // First image uploaded gets marked as primary
          }
        });
      })
    );

    return this.getProductById(productId);
  }
}
