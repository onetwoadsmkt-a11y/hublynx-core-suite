import logoUrl from "@/assets/core-suite-logo.svg?url";
import logoDarkUrl from "@/assets/core-suite-logo-dark.svg?url";
import symbolUrl from "@/assets/core-suite-symbol.svg?url";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Logo do topo do menu. Se a empresa ativa tem logo própria (white label), ela
 * substitui a da Core Suite, contida em no máximo 100×50 px sem distorcer.
 * Sem logo cadastrada, mostra a da Core Suite.
 */
export function HublynxLogo({
  className = "",
  collapsed = false,
  onDark = false,
}: {
  className?: string;
  collapsed?: boolean;
  /** sobre fundo escuro fixo (ex.: painel da tela de login) */
  onDark?: boolean;
}) {
  const { activeOrganization, brand } = useWorkspace();
  const orgLogo = brand?.logoUrl ?? null;

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

  // Logo da Core Suite: quatro blocos + "CORE SUITE". No tema escuro, versão clara do texto.
  if (collapsed) {
    return (
      <div className={`flex items-center ${className}`}>
        <img src={symbolUrl} alt="Core Suite" className="h-[34px] w-[34px]" />
      </div>
    );
  }
  return (
    <div className={`flex items-center ${className}`}>
      {onDark ? (
        <img src={logoDarkUrl} alt="Core Suite" className="h-10 w-auto" />
      ) : (
        <>
          <img src={logoUrl} alt="Core Suite" className="h-10 w-auto dark:hidden" />
          <img src={logoDarkUrl} alt="Core Suite" className="hidden h-10 w-auto dark:block" />
        </>
      )}
    </div>
  );
}
