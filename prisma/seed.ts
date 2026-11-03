import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

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

const defaultSettings = [
  { key: 'commission_rate_default', value: '0.10' },
  { key: 'delivery_fee_rules', value: '{"baseFee": 500, "perKmFee": 100}' },
  { key: 'rider_claim_timeout_seconds', value: '60' },
  { key: 'refund_auto_approval_limit', value: '5000' },
  { key: 'refund_super_admin_threshold', value: '50000' },
  { key: 'wallet_adjustment_threshold', value: '20000' },
  { key: 'payout_schedule', value: 'weekly' },
  { key: 'payout_approval_threshold', value: '100000' },
  { key: 'support_sla_targets', value: '{"firstResponseMinutes": 15, "resolutionHours": 24}' },
  { key: 'moderation_strike_thresholds', value: '3' },
  { key: 'feature_flags', value: '{"feed": true, "stories": true}' },
  { key: 'maintenance_mode', value: 'false' },
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

  console.log('\n⚙️ Seeding default platform settings...');
  for (const setting of defaultSettings) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
    console.log(`  ✓ ${setting.key}`);
  }

  console.log('\n👑 Seeding default Super Admin...');
  const superAdminEmail = process.env.DEFAULT_SUPER_ADMIN_EMAIL || 'superadmin@avatar.com';
  const superAdminPassword = process.env.DEFAULT_SUPER_ADMIN_PASSWORD || 'SuperAdmin@Avatar2026!';
  const passwordHash = await bcrypt.hash(superAdminPassword, 12);

  const superAdmin = await prisma.adminUser.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      name: 'System Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      passwordHash,
      mfaEnabled: false,
    },
  });
  console.log(`  ✓ Super Admin created (${superAdmin.email})`);

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
