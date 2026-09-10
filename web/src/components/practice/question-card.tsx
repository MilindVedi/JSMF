import type { Question } from "@/types";
import { FigurePlaceholder } from "@/components/common/figure-placeholder";
import { SubjectBadge } from "@/components/common/subject-badge";
import { ExamBadge } from "@/components/common/exam-badge";
import { OptionButton } from "./option-button";
import { getTopicById } from "@/data/mock/topics";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL: Record<Question["difficulty"], string> = {
  easy: "Easy",
  medium: "Moderate",
  hard: "Hard",
};

export function QuestionCard({
  question,
  submitted,
  selectedOptionId,
  onSelect,
}: {
  question: Question;
  submitted: boolean;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
}) {
  const topic = getTopicById(question.topicId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ExamBadge examId={question.examId} />
        <SubjectBadge subjectId={question.subjectId} />
        {topic && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {topic.name}
          </span>
        )}
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
            question.difficulty === "easy" && "bg-success text-success-foreground",
            question.difficulty === "medium" && "bg-flag text-flag-foreground",
            question.difficulty === "hard" && "bg-error text-error-foreground"
          )}
        >
          {DIFFICULTY_LABEL[question.difficulty]}
        </span>
      </div>

      <p className="prose-reading text-foreground">{question.stem}</p>
      {question.stemFigure && <FigurePlaceholder figure={question.stemFigure} />}

      <div role="radiogroup" className="flex flex-col gap-2.5">
        {question.options.map((option, i) => (
          <OptionButton
            key={option.id}
            index={i}
            text={option.text}
            submitted={submitted}
            isSelected={selectedOptionId === option.id}
            isCorrectOption={question.correctOptionId === option.id}
            onSelect={() => onSelect(option.id)}
          />
        ))}
      </div>
    </div>
  );
}
