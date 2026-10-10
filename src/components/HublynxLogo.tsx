import logoAsset from "@/assets/core-suite-logo-horizontal.png.asset.json";
import iconAsset from "@/assets/core-suite-icon.png.asset.json";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Logo do topo do menu. Se a empresa ativa tem logo própria (white label), ela
 * substitui a da Core Suite, contida em no máximo 100×50 px sem distorcer.
 * Sem logo cadastrada, mostra a da Core Suite.
 */
export function HublynxLogo({ className = "", collapsed = false }: { className?: string; collapsed?: boolean }) {
  const { activeOrganization, brand, isLoading } = useWorkspace();
  const orgLogo = brand?.logoUrl ?? null;

  // Enquanto a empresa carrega e não há marca guardada, reserva o espaço em vez de mostrar a logo da Core.
  if (!orgLogo && isLoading && !brand) {
    return <div className={`flex items-center ${className}`} style={{ height: collapsed ? "34px" : "50px", width: collapsed ? "34px" : "100px" }} aria-hidden />;
  }

  if (orgLogo) {
    return (
      <div className={`flex items-center ${className}`}>
        <img
          src={orgLogo}
          alt={activeOrganization?.name ?? "Logo da empresa"}
          className="object-contain"
          style={
            collapsed
              ? { maxWidth: "34px", maxHeight: "34px", width: "auto", height: "auto" }
              : { maxWidth: "100px", maxHeight: "50px", width: "auto", height: "auto" }
          }
        />
      </div>
    );
  }

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
