export function HublynxLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <defs>
          <linearGradient id="hl-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#00D084" />
          </linearGradient>
        </defs>
        <rect x="7" y="5" width="6" height="30" rx="1.5" fill="#2563EB" />
        <rect x="27" y="5" width="6" height="30" rx="1.5" fill="#00D084" />
        <path d="M9 22 C 16 18, 24 18, 31 14" stroke="url(#hl-grad)" strokeWidth="4" strokeLinecap="round" fill="none" />
      </svg>
      <div className="font-display leading-none">
        <div className="text-base font-semibold tracking-tight">
          <span style={{ color: "#071A3D" }}>HUB</span>
          <span style={{ color: "#00D084" }}>LYNX</span>
        </div>
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground">CORE</div>
      </div>
    </div>
  );
}
