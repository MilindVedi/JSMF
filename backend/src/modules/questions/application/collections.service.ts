import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { VISIBLE_QUESTION } from '../domain/question-view';

/** Guard rails, not product limits: big enough that nobody meets them. */
export const MAX_COLLECTIONS_PER_USER = 100;
export const MAX_QUESTIONS_PER_COLLECTION = 2000;

export interface CollectionInput {
  name: string;
  description?: string | null;
  questionIds?: string[];
}

/**
 * User-named lists of questions. Every read and write is scoped to the owner;
 * another user's collection id is a 404 so ids cannot be probed.
 */
@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.questionCollection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          where: { question: VISIBLE_QUESTION },
          orderBy: { addedAt: 'asc' },
          select: { questionId: true, addedAt: true },
        },
      },
    });
    return rows.map((row) => this.view(row));
  }

  async create(userId: string, input: CollectionInput) {
    const count = await this.prisma.questionCollection.count({ where: { userId } });
    if (count >= MAX_COLLECTIONS_PER_USER) {
      throw new BadRequestException(`You can have at most ${MAX_COLLECTIONS_PER_USER} collections`);
    }
    const questionIds = await this.visibleIds(input.questionIds ?? []);
    const row = await this.prisma.questionCollection.create({
      data: {
        userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        items: { create: questionIds.map((questionId) => ({ questionId })) },
      },
      include: { items: { select: { questionId: true, addedAt: true } } },
    });
    activity(this.logger, 'pyq.collection_created', {
      userId,
      collectionId: row.id,
      questions: questionIds.length,
    });
    return this.view(row);
  }

  async update(userId: string, id: string, input: Partial<Pick<CollectionInput, 'name' | 'description'>>) {
    await this.owned(userId, id);
    await this.prisma.questionCollection.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.questionCollection.delete({ where: { id } });
    activity(this.logger, 'pyq.collection_deleted', { userId, collectionId: id });
  }

  async addQuestion(userId: string, id: string, questionId: string) {
    await this.owned(userId, id);
    if ((await this.visibleIds([questionId])).length === 0) {
      throw new NotFoundException('Question not found');
    }
    const size = await this.prisma.collectionQuestion.count({ where: { collectionId: id } });
    if (size >= MAX_QUESTIONS_PER_COLLECTION) {
      throw new BadRequestException(`A collection holds at most ${MAX_QUESTIONS_PER_COLLECTION} questions`);
    }
    await this.prisma.collectionQuestion.upsert({
      where: { collectionId_questionId: { collectionId: id, questionId } },
      create: { collectionId: id, questionId },
      update: {},
    });
    return this.get(userId, id);
  }

  async removeQuestion(userId: string, id: string, questionId: string) {
    await this.owned(userId, id);
    await this.prisma.collectionQuestion.deleteMany({ where: { collectionId: id, questionId } });
    return this.get(userId, id);
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.questionCollection.findFirst({
      where: { id, userId },
      include: {
        items: {
          where: { question: VISIBLE_QUESTION },
          orderBy: { addedAt: 'asc' },
          select: { questionId: true, addedAt: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Collection not found');
    return this.view(row);
  }

  private view(row: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: { questionId: string; addedAt: Date }[];
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      questionIds: row.items.map((item) => item.questionId),
      items: row.items,
    };
  }

  private async owned(userId: string, id: string): Promise<void> {
    const found = await this.prisma.questionCollection.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Collection not found');
  }

  private async visibleIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)].slice(0, MAX_QUESTIONS_PER_COLLECTION);
    if (unique.length === 0) return [];
    const rows = await this.prisma.question.findMany({
      where: { ...VISIBLE_QUESTION, id: { in: unique } },
      select: { id: true },
    });
    const ok = new Set(rows.map((row) => row.id));
    return unique.filter((id) => ok.has(id));
  }
}
