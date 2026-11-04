/**
 * The history's playhead as a number of built steps, 0 to the step count. The session's rollback
 * marker is the same number, except that the whole model is null.
 */
export function headOf(rollback: number | null, steps: number): number {
  return rollback === null ? steps : Math.min(rollback, steps);
}

export function rollbackAt(head: number, steps: number): number | null {
  const at = Math.max(0, Math.min(head, steps));
  return at === steps ? null : at;
}

/** The gap between rows nearest to `y`, given each row's top and bottom. */
export function gapAt(y: number, rows: readonly { top: number; bottom: number }[]): number {
  return rows.filter((row) => y > (row.top + row.bottom) / 2).length;
}

/** What play does next: wait for the rewind or a build, take a step, or stop at the end. */
export function playMove(
  built: number,
  steps: number,
  rewinding: boolean,
): 'wait' | 'step' | 'end' {
  if (rewinding && built > 0) return 'wait';
  return built >= steps ? 'end' : 'step';
}
