import logoAsset from "@/assets/hublynx-logo-v4.png.asset.json";
import iconAsset from "@/assets/hublynx-icon.png.asset.json";

export function HublynxLogo({ className = "", collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={collapsed ? iconAsset.url : logoAsset.url}
        alt="Hublynx Core Suite"
        className="w-auto object-contain"
        style={{ height: collapsed ? "40px" : "80px" }}
      />
    </div>
  );
}
