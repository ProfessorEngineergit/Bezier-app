/** A flat double-headed handle; one head always points back to its target. */
const ARROW = 'M6 13H34M13 6L6 13L13 20M27 6L34 13L27 20';

export function GizmoArrow() {
  return (
    <svg aria-hidden="true" height={26} viewBox="0 0 40 26" width={40}>
      <path
        d={ARROW}
        fill="none"
        stroke="var(--gizmo-arrow-outline)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={6}
      />
      <path
        d={ARROW}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={4}
      />
    </svg>
  );
}
