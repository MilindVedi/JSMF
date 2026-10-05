import { AccessType, Prisma, ProductStatus, ProductType } from '@prisma/client';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * PYQ subscription plans as ordinary products (COURSE type, metadata
 * `{"pyqSubscription": true, "durationDays": N}`). Prices follow
 * web/src/data/mock/plans.ts (All Access Pro). Upserted by slug, so re-running
 * updates in place. Usage: `npm run db:seed:pyq-plans`.
 */
const PLANS = [
  {
    slug: 'pyq-all-access-monthly',
    title: 'All Access Pro — Monthly',
    subtitle: 'Unlimited practice across NEET-PG, FMGE and INI-CET for 30 days.',
    priceAmountMinor: 99_900n,
    metadata: {
      pyqSubscription: true,
      durationDays: 30,
      period: 'month',
      features: [
        'Unlimited practice across all 3 exams',
        'All 19 subjects, last 5 years',
        'Timed custom tests & full statistics',
      ],
    },
  },
  {
    slug: 'pyq-all-access-quarterly',
    title: 'All Access Pro — Quarterly',
    subtitle: 'Three months of unlimited practice.',
    priceAmountMinor: 249_900n,
    metadata: {
      pyqSubscription: true,
      durationDays: 90,
      period: 'quarter',
      features: [
        'Unlimited practice across all 3 exams',
        'All 19 subjects, last 5 years',
        'Timed custom tests & full statistics',
      ],
    },
  },
  {
    slug: 'pyq-all-access-yearly',
    title: 'All Access Pro — Yearly',
    subtitle: 'A full year of unlimited practice at the best price.',
    priceAmountMinor: 799_900n,
    metadata: {
      pyqSubscription: true,
      durationDays: 365,
      period: 'year',
      popular: true,
      features: [
        'Unlimited practice across all 3 exams',
        'All 19 subjects, last 5 years',
        'Timed custom tests & full statistics',
        'Early access to new question drops',
        'Priority support',
      ],
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
      await prisma.product.upsert({
        where: { slug: plan.slug },
        create: { slug: plan.slug, publishedAt: new Date(), ...data },
        update: data,
      });
      console.log(`plan ${plan.slug} upserted`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
