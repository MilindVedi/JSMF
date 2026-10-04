import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PracticeService } from './application/practice.service';
import { ProgressService } from './application/progress.service';
import { PyqAccessService } from './application/pyq-access.service';
import { QuestionBankService } from './application/question-bank.service';
import { QuestionImportService } from './application/question-import.service';
import { PyqTaxonomyAdminService } from './application/pyq-taxonomy-admin.service';
import { QuestionAdminService } from './application/question-admin.service';
import { AdminQuestionContentController } from './http/admin-question-content.controller';
import { AdminQuestionsController } from './http/admin-questions.controller';
import { PyqController } from './http/pyq.controller';
import { PyqLearningController } from './http/pyq-learning.controller';
import { CollectionsService } from './application/collections.service';
import { LearningService } from './application/learning.service';
import { PyqPlansController } from './http/pyq-plans.controller';
import { PyqPlansService } from './application/pyq-plans.service';

/**
 * The PYQ (previous-year questions) bank and the practice built on it.
 *
 * Self-contained: its tables reference only users, and the one thing it asks
 * of the rest of the platform — "is this person a subscriber" — goes through
 * the entitlements module's public service, behind PyqAccessService. Nothing
 * depends on this module.
 */
@Module({
  imports: [PrismaModule, EntitlementsModule],
  controllers: [
    PyqController,
    PyqLearningController,
    PyqPlansController,
    AdminQuestionsController,
    AdminQuestionContentController,
  ],
  providers: [
    QuestionBankService,
    QuestionImportService,
    PracticeService,
    ProgressService,
    CollectionsService,
    LearningService,
    PyqAccessService,
    PyqPlansService,
    QuestionAdminService,
    PyqTaxonomyAdminService,
  ],
  exports: [QuestionImportService],
})
export class QuestionsModule {}
