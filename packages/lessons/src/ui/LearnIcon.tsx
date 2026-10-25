/** The Learn icon, used in navigation and on project badges. */
export function LearnIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 6C9.5 4.4 6.4 4 3 4.5v14c3.4-.5 6.5-.1 9 1.5 2.5-1.6 5.6-2 9-1.5v-14c-3.4-.5-6.5-.1-9 1.5Zm0 0v14" />
      <path d="M6 9h3M6 12h3" opacity=".5" />
      <path d="m15 8.5 4 3-4 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}
