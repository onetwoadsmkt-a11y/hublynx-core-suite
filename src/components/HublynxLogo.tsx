import logoAsset from "@/assets/hublynx-logo-v3.png.asset.json";

export function HublynxLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img src={logoAsset.url} alt="Hublynx Core Suite" className="w-auto object-contain" style={{ height: "80px" }} />
    </div>
  );
}
