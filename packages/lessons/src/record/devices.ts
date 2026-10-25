/**
 * A user-facing explanation of why a camera or microphone failed to start. The browser's own
 * message goes to the console.
 */
export function deviceProblem(kind: 'microphone' | 'camera', problem: unknown): string {
  console.warn(`${kind} not available`, problem);
  const name = problem instanceof DOMException ? problem.name : '';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return kind === 'camera' ? 'No camera was found.' : 'No microphone was found.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return `The ${kind} is in use by another app.`;
  }
  return `Access to the ${kind} was not allowed. Allow it in the system's privacy settings, then record again.`;
}
