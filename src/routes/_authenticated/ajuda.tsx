import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Building2, Calendar, ChevronDown, FileText, Filter, FolderKanban, LifeBuoy,
  Lightbulb, Rocket, Search, Settings, Smartphone, Users, X, ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppLink } from "@/components/AppLink";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { isProjectOnlyAccess } from "@/lib/org/modules-map";
import { searchHelp, visibleHelp, type HelpArticle, type HelpCategory } from "@/lib/help/articles";

type Search = { tema?: string; artigo?: string; q?: string };

export const Route = createFileRoute("/_authenticated/ajuda")({
  head: () => ({ meta: [{ title: "Central de ajuda — Core Suite" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    tema: typeof s.tema === "string" ? s.tema : undefined,
    artigo: typeof s.artigo === "string" ? s.artigo : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: HelpCenter,
});

const ICONS: Record<HelpCategory["icon"], typeof Rocket> = {
  start: Rocket, pipeline: Filter, leads: Users, forms: FileText, agenda: Calendar,
  clients: Building2, projects: FolderKanban, reports: BarChart3, settings: Settings, mobile: Smartphone,
};

function HelpCenter() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { isAdmin } = useIsAdmin();
  const org = useOrgAccess();
  const projectOnly = isProjectOnlyAccess(org);
  const all = useMemo(() => visibleHelp({ projectOnly, isAdmin: isAdmin || org.isOrgAdmin }), [projectOnly, isAdmin, org.isOrgAdmin]);

  const [query, setQuery] = useState(search.q ?? "");
  const results = useMemo(() => searchHelp(all, query), [all, query]);
  const searching = query.trim().length > 0;
  const activeTopic = searching ? null : all.find((c) => c.id === search.tema) ?? null;
  const shown = searching ? results : activeTopic ? [activeTopic] : all;
  const totalArticles = results.reduce((n, c) => n + c.articles.length, 0);

  const setTopic = (tema?: string) => navigate({ search: (s: Search) => ({ ...s, tema, artigo: undefined }), replace: true });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-10">
      <header className="lead-gradient-card overflow-hidden rounded-3xl px-5 py-7 sm:px-8 sm:py-9">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--band-sub)" }}>
          <LifeBuoy className="h-4 w-4" /> Central de ajuda
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Como podemos ajudar?</h1>
        <p className="mt-1 max-w-xl text-sm" style={{ color: "var(--band-sub)" }}>
          O passo a passo de cada área do Core Suite. Pesquise ou escolha um tema.
        </p>
        <div className="relative mt-5 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex.: automação, duplicado, publicar formulário…"
            aria-label="Pesquisar na ajuda"
            className="h-12 rounded-xl border-0 bg-background pl-10 pr-10 text-base text-foreground shadow-sm"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {!searching && (
        <nav aria-label="Temas da ajuda" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {all.map((c) => {
            const Icon = ICONS[c.icon];
            const on = activeTopic?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setTopic(on ? undefined : c.id)}
                aria-pressed={on}
                className={cn(
                  "flex min-h-[92px] flex-col items-start gap-2 rounded-2xl border bg-card p-3 text-left transition-colors hover:border-primary",
                  on && "border-primary ring-2 ring-primary/40",
                )}
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-foreground"><Icon className="h-[18px] w-[18px]" /></span>
                <span className="text-sm font-bold leading-tight">{c.title}</span>
                <span className="text-xs text-muted-foreground">{c.articles.length} {c.articles.length === 1 ? "guia" : "guias"}</span>
              </button>
            );
          })}
        </nav>
      )}

      {searching && (
        <p className="text-sm text-muted-foreground">
          {totalArticles ? `${totalArticles} ${totalArticles === 1 ? "guia encontrado" : "guias encontrados"} para "${query.trim()}".` : `Nada encontrado para "${query.trim()}". Tente outra palavra, como "tarefa" ou "etapa".`}
        </p>
      )}
      {activeTopic && (
        <button type="button" onClick={() => setTopic(undefined)} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Ver todos os temas
        </button>
      )}

      <div className="space-y-8">
        {shown.map((c) => (
          <CategorySection key={c.id} category={c} openId={search.artigo} forceOpen={searching && totalArticles <= 3} />
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15"><LifeBuoy className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Ainda precisa de ajuda?</p>
          <p className="text-sm text-muted-foreground">
            Fale com o administrador da sua empresa ou com o suporte do Core Suite, dizendo a tela em que estava e o que aconteceu (um print ajuda bastante).
          </p>
        </div>
      </section>
    </div>
  );
}

function CategorySection({ category, openId, forceOpen }: { category: HelpCategory; openId?: string; forceOpen: boolean }) {
  const Icon = ICONS[category.icon];
  return (
    <section aria-labelledby={`tema-${category.id}`} className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon className="h-[18px] w-[18px]" /></span>
        <div>
          <h2 id={`tema-${category.id}`} className="text-lg font-extrabold leading-tight">{category.title}</h2>
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </div>
      </div>
      <div className="space-y-2">
        {category.articles.map((a) => (
          <ArticleItem key={a.id} article={a} categoryId={category.id} defaultOpen={forceOpen || openId === a.id} />
        ))}
      </div>
    </section>
  );
}

function ArticleItem({ article, categoryId, defaultOpen }: { article: HelpArticle; categoryId: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  useEffect(() => {
    if (defaultOpen && ref.current) ref.current.scrollIntoView({ block: "start", behavior: "smooth" });
    // só ao chegar por link direto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const panelId = `artigo-${categoryId}-${article.id}`;
  return (
    <div ref={ref} className={cn("rounded-2xl border bg-card transition-shadow", open && "shadow-sm")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-snug">{article.title}</span>
          <span className="block text-sm text-muted-foreground">{article.summary}</span>
        </span>
        <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground sm:inline">{article.steps.length} passos</span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="border-t px-4 pb-5 pt-4 sm:px-5">
          <ol className="space-y-4">
            {article.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">{i + 1}</span>
                <div className="min-w-0 pt-0.5">
                  <p className="font-semibold leading-snug">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          {article.tips?.length ? (
            <div className="mt-5 space-y-2 rounded-xl bg-muted/60 p-3.5">
              {article.tips.map((t, i) => (
                <p key={i} className="flex gap-2 text-sm"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>{t}</span></p>
              ))}
            </div>
          ) : null}
          {article.path && (
            <AppLink href={article.path} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
              Abrir esta tela <ArrowRight className="h-4 w-4" />
            </AppLink>
          )}
        </div>
      )}
    </div>
  );
}
