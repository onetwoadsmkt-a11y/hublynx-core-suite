import logoAsset from "@/assets/hublynx-logo-v2.png.asset.json";

export function HublynxLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img src={logoAsset.url} alt="Hublynx Core Suite" className="h-10 w-auto object-contain" />
    </div>
  );
}
