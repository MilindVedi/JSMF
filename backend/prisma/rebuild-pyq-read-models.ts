import { PrismaService } from '../src/shared/prisma/prisma.service';
import { QuestionStateService } from '../src/modules/questions/application/question-state.service';

/**
 * Recomputes `pyq.user_question_states` and `pyq.user_daily_activity` from
 * `pyq.attempts`, in one transaction (readers see the old rows until commit).
 *
 * Both tables are derived; the app keeps them current on every answer, flag
 * and submit. Run this only when they may have fallen behind — chiefly after
 * the app was rolled back past the release that introduced them and then
 * forward again, since the older version wrote attempts without updating
 * them. Safe to run any time, and as often as wanted: it converges on the
 * same result.
 */
async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await new QuestionStateService(prisma).rebuildAll();
    console.log(`Rebuilt ${result.states} question states and ${result.days} activity days.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
