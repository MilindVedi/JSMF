import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, from, mergeMap } from 'rxjs';
import { QuestionBankService } from '../application/question-bank.service';

/**
 * Drops the cached taxonomy after any successful admin write. One place for
 * every write — question edits, publish, import, exams, subjects, topics —
 * including ones added later, so none can forget to. Admin writes are rare,
 * so an invalidation that turns out unnecessary costs nothing.
 */
@Injectable()
export class InvalidateTaxonomyInterceptor implements NestInterceptor {
  constructor(private readonly bank: QuestionBankService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { method } = context.switchToHttp().getRequest<Request>();
    if (method === 'GET') return next.handle();
    return next
      .handle()
      .pipe(mergeMap((result) => from(this.bank.invalidateTaxonomy().then(() => result))));
  }
}
