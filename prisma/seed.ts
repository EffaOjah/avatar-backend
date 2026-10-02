import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const categories = [
  {
    name: 'Food & Beverages',
    slug: 'food-beverages',
    description: 'Restaurants, cafes, fast food, drinks and all things edible.',
  },
  {
    name: 'Groceries & Supermarket',
    slug: 'groceries-supermarket',
    description: 'Fresh produce, pantry staples, dairy, and household essentials.',
  },
  {
    name: 'Pharmacy & Health',
    slug: 'pharmacy-health',
    description: 'Medications, supplements, wellness products and health essentials.',
  },
  {
    name: 'Electronics & Gadgets',
    slug: 'electronics-gadgets',
    description: 'Phones, laptops, accessories, smart home devices and more.',
  },
  {
    name: 'Fashion & Clothing',
    slug: 'fashion-clothing',
    description: 'Men, women and children clothing, shoes, bags and accessories.',
  },
  {
    name: 'Beauty & Personal Care',
    slug: 'beauty-personal-care',
    description: 'Skincare, haircare, makeup, grooming and personal hygiene products.',
  },
  {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    description: 'Furniture, cookware, appliances, decor and home improvement products.',
  },
  {
    name: 'Books & Stationery',
    slug: 'books-stationery',
    description: 'Books, notebooks, office supplies, art materials and educational items.',
  },
  {
    name: 'Sports & Fitness',
    slug: 'sports-fitness',
    description: 'Gym equipment, sportswear, outdoor gear and fitness accessories.',
  },
  {
    name: 'Baby & Kids',
    slug: 'baby-kids',
    description: 'Baby essentials, toys, kids clothing, feeding and nursery products.',
  },
];

async function seed() {
  console.log('🌱 Seeding categories...');

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
    console.log(`  ✓ ${category.name}`);
  }

  console.log('\n✅ Seeding complete!');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
