type ProductGlyphProps = {
  kind?: "adapter" | "headphones" | "hub" | "device";
};

export function ProductGlyph({ kind = "device" }: ProductGlyphProps) {
  if (kind === "adapter") {
    return (
      <svg viewBox="0 0 240 180" role="img" aria-label="Power adapter illustration">
        <rect x="62" y="40" width="116" height="100" rx="22" fill="currentColor" />
        <rect x="96" y="20" width="13" height="28" rx="4" fill="currentColor" />
        <rect x="131" y="20" width="13" height="28" rx="4" fill="currentColor" />
        <path d="M178 89c35 0 44 20 44 44v17" fill="none" stroke="currentColor" strokeWidth="10" />
        <rect x="211" y="144" width="18" height="25" rx="6" fill="currentColor" />
        <path d="M103 78h34l-18 25h24l-42 35 13-29H91z" fill="var(--color-surface)" />
      </svg>
    );
  }

  if (kind === "headphones") {
    return (
      <svg viewBox="0 0 240 180" role="img" aria-label="Headphones illustration">
        <path
          d="M48 99V80a72 72 0 0 1 144 0v19"
          fill="none"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <rect x="34" y="89" width="42" height="65" rx="18" fill="currentColor" />
        <rect x="164" y="89" width="42" height="65" rx="18" fill="currentColor" />
        <rect x="49" y="102" width="14" height="38" rx="7" fill="var(--color-surface)" />
        <rect x="177" y="102" width="14" height="38" rx="7" fill="var(--color-surface)" />
      </svg>
    );
  }

  if (kind === "hub") {
    return (
      <svg viewBox="0 0 240 180" role="img" aria-label="USB hub illustration">
        <rect x="43" y="54" width="154" height="82" rx="22" fill="currentColor" />
        <rect x="68" y="76" width="30" height="12" rx="5" fill="var(--color-surface)" />
        <rect x="105" y="76" width="30" height="12" rx="5" fill="var(--color-surface)" />
        <rect x="142" y="76" width="30" height="12" rx="5" fill="var(--color-surface)" />
        <circle cx="83" cy="111" r="7" fill="var(--color-surface)" />
        <path d="M197 94h25" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 240 180" role="img" aria-label="Electronics item illustration">
      <rect x="63" y="20" width="114" height="140" rx="24" fill="currentColor" />
      <rect x="74" y="36" width="92" height="96" rx="12" fill="var(--color-surface)" />
      <circle cx="120" cy="145" r="7" fill="var(--color-surface)" />
      <path d="M94 76h52M94 92h36" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
