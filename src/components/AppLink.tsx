import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Link interno a partir de um endereço pronto (com ?parâmetros), como os dos avisos.
 * Navega sem recarregar a página; Ctrl/Cmd+clique abre em nova aba normalmente.
 */
export function AppLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (!href.startsWith("/")) return;
        e.preventDefault();
        router.history.push(href);
      }}
    />
  );
}
