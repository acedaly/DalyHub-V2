/**
 * DS-10 Inspector — small decorative glyph(s). In-house inline SVG, `aria-hidden`.
 */

export function CloseGlyph({ className }: { readonly className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M5 5l10 10" />
      <path d="M15 5 5 15" />
    </svg>
  );
}
