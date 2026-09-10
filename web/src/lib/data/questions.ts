import type { ExamId, Question, SessionFilters } from "@/types";
import { QUESTIONS, getQuestionById as _getQuestionById } from "@/data/mock/questions";
import { EXAMS } from "@/data/mock/exams";
import { SUBJECTS } from "@/data/mock/subjects";
import { TOPICS, getTopicsBySubject as _getTopicsBySubject } from "@/data/mock/topics";

/**
 * Thin async wrappers around the static mock arrays. Every call site in the
 * app already `await`s these, so swapping the body for a real `fetch()` call
 * to the future NestJS API is a localized change — nothing above this layer
 * needs to change. See docs/05-ui-ux-plan.md, "State Management".
 */

export async function getExams() {
  return EXAMS;
}

export async function getSubjects() {
  return SUBJECTS;
}

export async function getTopics(subjectId?: string) {
  if (!subjectId) return TOPICS;
  return _getTopicsBySubject(subjectId);
}

export interface QuestionFilters extends SessionFilters {
  search?: string;
}

export async function getQuestions(filters: QuestionFilters = {}): Promise<Question[]> {
  let results = QUESTIONS;

  if (filters.examIds?.length) {
    const set = new Set<ExamId>(filters.examIds);
    results = results.filter((q) => set.has(q.examId));
  }
  if (filters.years?.length) {
    const set = new Set(filters.years);
    results = results.filter((q) => set.has(q.year));
  }
  if (filters.subjectIds?.length) {
    const set = new Set(filters.subjectIds);
    results = results.filter((q) => set.has(q.subjectId));
  }
  if (filters.topicIds?.length) {
    const set = new Set(filters.topicIds);
    results = results.filter((q) => set.has(q.topicId));
  }
  if (filters.search?.trim()) {
    const needle = filters.search.trim().toLowerCase();
    results = results.filter((q) => q.stem.toLowerCase().includes(needle));
  }

  return results;
}

export async function getQuestionById(id: string): Promise<Question | undefined> {
  return _getQuestionById(id);
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  const map = new Map(QUESTIONS.map((q) => [q.id, q] as const));
  return ids.map((id) => map.get(id)).filter((q): q is Question => Boolean(q));
}
