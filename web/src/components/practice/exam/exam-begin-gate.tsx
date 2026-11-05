"use client";

import type { SessionDetail } from "@jsmf/core/data-source";
import { useBeginSession } from "@/hooks/pyq";
import { useAuthStore } from "@/store/auth-store";
import { ExamHeader } from "./exam-header";
import { ExamInstructionsScreen } from "./exam-instructions";
import { useExamTitle } from "./exam-question-screen";

/**
 * A test that has not begun: its instructions, and "I am ready to begin".
 * Beginning starts the clock on the server and returns the questions, which
 * the begin hook writes into the session cache — the runner then renders
 * the console in place of this screen.
 */
export function ExamBeginGate({ detail }: { detail: SessionDetail }) {
  const { session } = detail;
  const profile = useAuthStore((s) => s.profile);
  const title = useExamTitle(session);
  const begin = useBeginSession(session.id);

  return (
    <ExamInstructionsScreen
      session={session}
      beginning={begin.isPending}
      onBegin={() => begin.mutate()}
      header={
        <ExamHeader
          title={title}
          timed={false}
          studentName={profile.name}
          avatarUrl={profile.avatarUrl}
          exitHref={session.sourceHref ?? "/dashboard"}
        />
      }
    />
  );
}
