/**
 * How a real exam paper runs, as data: its sections, each section's time,
 * whether sections lock, and its marking. One shape serves both places it is
 * stored — `pyq.exam_patterns.pattern` (what admin edits) and
 * `pyq.practice_sessions.pattern` (the copy a mock was started with) — so
 * there is exactly one parser and one set of rules.
 *
 * Adding a rule later (a break between parts, marking per section) means a
 * new field and `version: 2`; `parseExamPattern` keeps reading every stored
 * version.
 */

export const EXAM_PATTERN_VERSION = 1;
export const MAX_PATTERN_SECTIONS = 10;
/** FMGE's 300 is the largest real paper. Other sessions are capped at 200. */
export const MAX_PATTERN_QUESTIONS = 300;
export const MAX_SECTION_MINUTES = 300;
/** Longest whole paper (FMGE: 2 × 150 min), plus headroom. */
export const MAX_PATTERN_MINUTES = 6 * 60;
export const MAX_SECTION_NAME = 40;
export const MAX_MARK = 100;
export const MAX_MARK_DENOMINATOR = 12;

/** An exact mark, so "1/3" is never 0.33. */
export interface Fraction {
  num: number;
  den: number;
}

export interface PatternSection {
  name: string;
  questions: number;
  minutes: number;
}

export interface ExamPattern {
  version: typeof EXAM_PATTERN_VERSION;
  sections: PatternSection[];
  /**
   * True (NEET-PG, FMGE): each section opens when the one before it closes,
   * and closes for good when its own time ends — no going back, no moving on
   * early. False (INI-CET): one clock for the whole paper, free navigation.
   */
  sectionsLocked: boolean;
  marking: {
    /** Marks for a right answer. */
    correct: Fraction;
    /** Marks taken off for a wrong answer (0 = no negative marking). Unanswered is always 0. */
    incorrect: Fraction;
  };
}

export class ExamPatternError extends Error {}

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function parseFraction(value: unknown, label: string, allowZero: boolean): Fraction {
  const raw = value as Partial<Fraction> | null;
  if (!raw || !isInt(raw.num) || !isInt(raw.den)) throw new ExamPatternError(`${label} must be a number`);
  if (raw.den < 1 || raw.den > MAX_MARK_DENOMINATOR) {
    throw new ExamPatternError(`${label}: use a fraction over at most ${MAX_MARK_DENOMINATOR}`);
  }
  if (raw.num < (allowZero ? 0 : 1) || raw.num > MAX_MARK * raw.den) {
    throw new ExamPatternError(`${label} must be ${allowZero ? 'from 0' : 'more than 0'} up to ${MAX_MARK}`);
  }
  const divisor = gcd(raw.num, raw.den) || 1;
  return { num: raw.num / divisor, den: raw.den / divisor };
}

/** Validates and normalises a stored or submitted pattern; throws ExamPatternError with a message fit for an admin. */
export function parseExamPattern(value: unknown): ExamPattern {
  const raw = value as Partial<ExamPattern> | null;
  if (!raw || typeof raw !== 'object') throw new ExamPatternError('The pattern is missing');
  if (raw.version !== undefined && raw.version !== EXAM_PATTERN_VERSION) {
    throw new ExamPatternError(`Unknown pattern version ${String(raw.version)}`);
  }
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new ExamPatternError('A pattern needs at least one section');
  }
  if (raw.sections.length > MAX_PATTERN_SECTIONS) {
    throw new ExamPatternError(`A pattern can have at most ${MAX_PATTERN_SECTIONS} sections`);
  }
  const sections = raw.sections.map((section, index) => {
    const name = typeof section?.name === 'string' ? section.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) throw new ExamPatternError(`Section ${index + 1} needs a name`);
    if (name.length > MAX_SECTION_NAME) {
      throw new ExamPatternError(`${name}: keep the name to ${MAX_SECTION_NAME} characters`);
    }
    if (!isInt(section.questions) || section.questions < 1) {
      throw new ExamPatternError(`${name} needs at least one question`);
    }
    if (!isInt(section.minutes) || section.minutes < 1 || section.minutes > MAX_SECTION_MINUTES) {
      throw new ExamPatternError(`${name}: minutes must be from 1 to ${MAX_SECTION_MINUTES}`);
    }
    return { name, questions: section.questions, minutes: section.minutes };
  });
  const names = sections.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new ExamPatternError('Two sections have the same name');

  const totals = patternTotals({ sections });
  if (totals.questions > MAX_PATTERN_QUESTIONS) {
    throw new ExamPatternError(
      `A paper can have at most ${MAX_PATTERN_QUESTIONS} questions (this one has ${totals.questions})`,
    );
  }
  if (totals.minutes > MAX_PATTERN_MINUTES) {
    throw new ExamPatternError(`A paper can run at most ${MAX_PATTERN_MINUTES / 60} hours`);
  }
  if (typeof raw.sectionsLocked !== 'boolean') throw new ExamPatternError('Say whether sections lock');
  if (!raw.marking || typeof raw.marking !== 'object') throw new ExamPatternError('The marking is missing');

  return {
    version: EXAM_PATTERN_VERSION,
    sections,
    // A single section has nothing to lock against.
    sectionsLocked: sections.length > 1 && raw.sectionsLocked,
    marking: {
      correct: parseFraction(raw.marking.correct, 'Marks for a right answer', false),
      incorrect: parseFraction(raw.marking.incorrect, 'Marks taken off for a wrong answer', true),
    },
  };
}

/** Lenient read of a stored copy: null when absent or unreadable, never a throw. */
export function readExamPattern(value: unknown): ExamPattern | null {
  if (value == null) return null;
  try {
    return parseExamPattern(value);
  } catch {
    return null;
  }
}

export function patternTotals(pattern: Pick<ExamPattern, 'sections'>): { questions: number; minutes: number } {
  return pattern.sections.reduce(
    (sum, section) => ({ questions: sum.questions + section.questions, minutes: sum.minutes + section.minutes }),
    { questions: 0, minutes: 0 },
  );
}

export interface SectionWindow {
  index: number;
  name: string;
  /** Session positions [firstPosition, firstPosition + questions). */
  firstPosition: number;
  questions: number;
  opensAt: Date;
  closesAt: Date;
}

/**
 * When each section is open, counted from the moment the clock started.
 * With unlocked sections every window is the whole paper.
 */
export function sectionWindows(pattern: ExamPattern, clockStartedAt: Date): SectionWindow[] {
  const start = clockStartedAt.getTime();
  const paperEnd = start + patternTotals(pattern).minutes * 60_000;
  let position = 0;
  let elapsedMs = 0;
  return pattern.sections.map((section, index) => {
    const opensAt = pattern.sectionsLocked ? start + elapsedMs : start;
    elapsedMs += section.minutes * 60_000;
    const window: SectionWindow = {
      index,
      name: section.name,
      firstPosition: position,
      questions: section.questions,
      opensAt: new Date(opensAt),
      closesAt: new Date(pattern.sectionsLocked ? start + elapsedMs : paperEnd),
    };
    position += section.questions;
    return window;
  });
}

/** The window holding a session position, or null when the position is past the paper. */
export function windowForPosition(windows: SectionWindow[], position: number): SectionWindow | null {
  return windows.find((w) => position >= w.firstPosition && position < w.firstPosition + w.questions) ?? null;
}

/** Exact marks, rounded to two decimals only at the end. */
export function marksFor(pattern: ExamPattern, correct: number, incorrect: number): number {
  const { correct: c, incorrect: i } = pattern.marking;
  const numerator = correct * c.num * i.den - incorrect * i.num * c.den;
  return Math.round((numerator * 100) / (c.den * i.den)) / 100;
}

export function maxMarksFor(pattern: ExamPattern): number {
  return marksFor(pattern, patternTotals(pattern).questions, 0);
}
