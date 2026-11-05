import { AccessType, Prisma, ProductStatus, ProductType } from '@prisma/client';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * Starter PYQ subscription plans for a fresh database, as ordinary products
 * (COURSE type, metadata `{"pyqSubscription": true, "durationMonths": N}`).
 * Create-only: a plan that already exists is left alone, because a plan's
 * price and length never change in place (see src/shared/pyq-plan.ts). After
 * the first run, plans are managed from admin → PYQ → Plans & trial.
 * The benefits list is shared by every plan and lives in
 * pyq.subscription_settings, not here. Usage: `npm run db:seed:pyq-plans`.
 */
const PLANS = [
  {
    slug: 'pyq-all-access-monthly',
    title: 'All Access Pro — Monthly',
    subtitle: 'Unlimited practice across NEET-PG, FMGE and INI-CET for 30 days.',
    priceAmountMinor: 99_900n,
    metadata: {
      pyqSubscription: true,
      durationMonths: 1,
    },
  },
  {
    slug: 'pyq-all-access-quarterly',
    title: 'All Access Pro — Quarterly',
    subtitle: 'Three months of unlimited practice.',
    priceAmountMinor: 249_900n,
    metadata: {
      pyqSubscription: true,
      durationMonths: 3,
    },
  },
  {
    slug: 'pyq-all-access-yearly',
    title: 'All Access Pro — Yearly',
    subtitle: 'A full year of unlimited practice at the best price.',
    priceAmountMinor: 799_900n,
    metadata: {
      pyqSubscription: true,
      durationMonths: 12,
      popular: true,
    },
  },
];

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    for (const plan of PLANS) {
      const data = {
        title: plan.title,
        subtitle: plan.subtitle,
        type: ProductType.COURSE,
        accessType: AccessType.PAID,
        status: ProductStatus.PUBLISHED,
        priceAmountMinor: plan.priceAmountMinor,
        currency: 'INR',
        metadata: plan.metadata as Prisma.InputJsonValue,
      };
      const existing = await prisma.product.findUnique({ where: { slug: plan.slug }, select: { id: true } });
      if (existing) {
        console.log(`plan ${plan.slug} already exists, left as it is`);
        continue;
      }
      await prisma.product.create({ data: { slug: plan.slug, publishedAt: new Date(), ...data } });
      console.log(`plan ${plan.slug} created`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
