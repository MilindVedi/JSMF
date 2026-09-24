"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Options {
  /** Read at the moment of leaving — never a snapshot from an earlier render. */
  isDirty: () => boolean;
  /** Name of the step being left, for the dialog copy. */
  stepLabel: () => string;
}

interface Pending {
  label: string;
  answer: (leave: boolean) => void;
}

/**
 * The single place that decides whether leaving unsaved work is allowed.
 *
 * Every way out of the editor funnels through `guardLeave()`: the step
 * navigation, the Products link, and the browser's own Back button. They differ
 * only in what they do with the answer, so the question — and the wording of
 * it — is asked identically each time.
 *
 * Returns a promise rather than taking a callback because the caller is usually
 * already doing something async, and `if (await guardLeave()) …` reads the same
 * way `window.confirm` did, which is what this replaces.
 */
export function useUnsavedChanges({ isDirty, stepLabel }: Options) {
  const [pending, setPending] = useState<Pending | null>(null);

  // The effect below is installed once, but must always consult the *current*
  // step's dirty state, so the callbacks live in a ref instead of the
  // dependency array — re-installing the history sentinel on every render
  // would push a new entry each time.
  const latest = useRef({ isDirty, stepLabel });
  useEffect(() => {
    latest.current = { isDirty, stepLabel };
  });

  /** Whether the history sentinel below has been installed for this editor. */
  const armed = useRef(false);

  const guardLeave = useCallback(() => {
    if (!latest.current.isDirty()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setPending({ label: latest.current.stepLabel(), answer: resolve });
    });
  }, []);

  /**
   * Browser Back is not a click we can intercept, so it is caught after the
   * fact: an extra history entry for this same URL sits on top of the editor,
   * and Back consumes that instead of leaving. `popstate` then fires with the
   * page still on screen, which is the moment to ask.
   *
   * Answering "leave" walks back past both entries; answering "stay" puts the
   * sentinel back so the next Back press behaves the same way.
   */
  useEffect(() => {
    const sentinel = () => window.history.pushState(null, "", window.location.href);

    // Strict Mode runs this effect twice on mount, and a second sentinel would
    // silently add a history entry nobody accounts for — every later `go(-2)`
    // would then land back on the editor. The ref survives the remount because
    // it belongs to the component, not the effect.
    if (!armed.current) {
      armed.current = true;
      sentinel();
    }

    // Set once the user has committed to leaving, so the popstate our own
    // history call provokes is not mistaken for another Back press.
    let leaving = false;

    // A history move made synchronously from inside a popstate handler is
    // discarded by the browser — it is still dispatching the previous one. The
    // timeout puts ours in the next task, where it takes effect.
    function travel(delta: number) {
      leaving = true;
      setTimeout(() => window.history.go(delta), 0);
    }

    async function onPopState() {
      if (leaving) return;

      if (!latest.current.isDirty()) {
        // Nothing to lose — consume the real entry too, so one Back press
        // still feels like one Back press.
        travel(-1);
        return;
      }

      sentinel();
      if (await guardLeave()) travel(-2);
    }

    // Reload and tab-close cannot show our dialog — the browser only allows its
    // own generic prompt — but losing the work silently there would be worse.
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!latest.current.isDirty()) return;
      event.preventDefault();
    }

    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [guardLeave]);

  function answer(leave: boolean) {
    pending?.answer(leave);
    setPending(null);
  }

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && answer(false)}>
      <AlertDialogContent>
        <div className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          <TriangleAlert className="size-4.5" />
        </div>

        <AlertDialogTitle className="mt-4">Hold on — this isn&apos;t saved</AlertDialogTitle>
        <AlertDialogDescription>
          Your edits to <span className="font-medium text-foreground">{pending?.label}</span> are
          still only in this browser. Leave now and they go with it — there is no undo.
        </AlertDialogDescription>

        <AlertDialogFooter>
          <Button variant="ghost" size="lg" onClick={() => answer(true)}>
            Discard them
          </Button>
          <Button size="lg" autoFocus onClick={() => answer(false)}>
            Keep editing
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { guardLeave, dialog };
}
