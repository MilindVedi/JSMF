/**
 * What every step of the product editor exposes to the Save button and the
 * unsaved-changes guard that live outside it, in the step navigation.
 *
 * Each step edits a draft held in the browser and touches the server only when
 * `save()` is called, so the editor as a whole has one rule: nothing is written
 * until Save is pressed, and leaving a step with pending edits asks first.
 */
export interface StepSectionHandle {
  /** True when the step holds edits that have not been written to the server. */
  isDirty: boolean;
  /** Writes the step's pending edits. Resolves once they are saved. */
  save: () => Promise<void>;
  /** Drops the step's pending edits with no server request. */
  discard: () => void;
}
