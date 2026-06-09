import logoAsset from "@/assets/hublynx-logo.png.asset.json";

export function HublynxLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src={logoAsset.url} alt="Hublynx" className="h-10 w-10 object-contain" />
      <div className="font-display leading-none">
        <div className="text-base font-semibold tracking-tight">
          <span style={{ color: "#071A3D" }}>HUB</span>
          <span style={{ color: "#00D084" }}>LYNX</span>
        </div>
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground mt-1">CORE</div>
      </div>
    </div>
  );
}
