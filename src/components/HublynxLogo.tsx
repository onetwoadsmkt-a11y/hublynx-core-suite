import logoAsset from "@/assets/core-suite-logo.png.asset.json";
import iconAsset from "@/assets/core-suite-icon.png.asset.json";

export function HublynxLogo({ className = "", collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={collapsed ? iconAsset.url : logoAsset.url}
        alt="Core Suite"
        className="w-auto object-contain"
        style={{ height: collapsed ? "34px" : "56px" }}
      />
    </div>
  );
}
