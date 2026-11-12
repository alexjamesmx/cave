/** The Cave's mark (M14, "Arches"): three arches on the sunset gradient, as in the app icon. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="brand-mark">
      <defs>
        <linearGradient id="brand-arches" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a62" />
          <stop offset="1" stopColor="#ff3d7f" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#brand-arches)" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="40">
        <path d="M116 350A140 140 0 0 1 396 350" />
        <path d="M166 350A90 90 0 0 1 346 350" strokeOpacity=".72" />
        <path d="M216 350A40 40 0 0 1 296 350" strokeOpacity=".45" />
      </g>
    </svg>
  );
}
