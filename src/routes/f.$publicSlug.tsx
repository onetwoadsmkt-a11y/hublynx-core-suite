import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, ChevronsUpDown, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brazilCitiesByUf, brazilStates } from "@/lib/forms/brazil-locations";
import type { FormDraft } from "@/lib/forms/domain";
import { getPublicForm, submitPublicForm, type PublicFormData } from "@/lib/forms/forms-public.functions";
import { initMetaPixel, trackMetaLead } from "@/lib/forms/meta-pixel";
import { evaluateRules } from "@/lib/forms/rules-engine";
import { formThemeVars } from "@/lib/forms/theme";

const alignClasses = { left: "text-left", center: "text-center", right: "text-right" } as const;
const publicTitleSizeClasses = { small: "text-2xl sm:text-4xl lg:text-5xl", medium: "text-[1.75rem] sm:text-5xl lg:text-6xl", large: "text-[2rem] sm:text-6xl lg:text-7xl" } as const;
const publicSubtitleSizeClasses = { small: "text-xs sm:text-sm", medium: "text-sm sm:text-base", large: "text-base sm:text-lg" } as const;
const publicQuestionSizeClasses = { small: "text-xl sm:text-2xl", medium: "text-[1.625rem] sm:text-3xl", large: "text-3xl sm:text-4xl" } as const;
const darkColorClasses = { default: "text-vs-on-dark", muted: "text-vs-on-dark/65", primary: "text-vs-yellow", blue: "text-form-text-blue", green: "text-form-text-green", red: "text-form-text-red", orange: "text-form-text-orange", purple: "text-form-text-purple" } as const;
const cardColorClasses = { default: "text-vs-ink", muted: "text-vs-muted", primary: "text-vs-yellow-strong", blue: "text-form-text-blue", green: "text-form-text-green", red: "text-form-text-red", orange: "text-form-text-orange", purple: "text-form-text-purple" } as const;

function formatClass(copy: Record<string, string>, target: "title" | "subtitle" | "question", sizes: Record<string, string>, colors: Record<string, string>) {
  const align = copy[`${target}Align`] as keyof typeof alignClasses;
  const color = copy[`${target}Color`] ?? "default";
  return `${alignClasses[align] ?? alignClasses.left} ${sizes[copy[`${target}Size`] ?? "medium"] ?? sizes["medium"]} ${color.startsWith("#") ? "" : colors[color] ?? colors["default"]} ${copy[`${target}Weight`] === "normal" ? "font-normal" : "font-extrabold"} ${copy[`${target}Italic`] === "true" ? "italic" : "not-italic"}`;
}

function textStyle(copy: Record<string, string>, target: "title" | "subtitle" | "question"): CSSProperties | undefined {
  const color = copy[`${target}Color`];
  return color?.startsWith("#") ? { color } : undefined;
}

function ufFromStateValue(stateValue: string): string {
  const byName = brazilStates.find((state) => state.name === stateValue);
  if (byName) return byName.uf;
  return brazilCitiesByUf[stateValue] ? stateValue : "";
}

function StateSelect({ value, onChange, className }: { value: string; onChange: (next: string) => void; className?: string }) {
  return (
    <Select {...(value ? { value } : {})} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder="Selecione o estado" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {brazilStates.map((state) => <SelectItem key={state.uf} value={state.name}>{state.name} ({state.uf})</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CitySelect({ stateValue, value, onChange, className }: { stateValue: string; value: string; onChange: (next: string) => void; className?: string }) {
  const uf = ufFromStateValue(stateValue);
  const cities = uf ? brazilCitiesByUf[uf] ?? [] : [];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const matches = search.trim() ? cities.filter((city) => city.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))).slice(0, 100) : cities.slice(0, 100);
  return (
    <Popover open={open && !!uf} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label="Cidade" disabled={!uf} className={`${className ?? ""} w-full justify-between font-normal`}>{value || (uf ? "Selecione a cidade" : "Selecione o estado primeiro")}<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar cidade..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-64">
            {matches.length === 0 ? <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty> : matches.map((city) => <CommandItem key={city} value={city} onSelect={() => { onChange(city); setOpen(false); setSearch(""); }}><Check className={`mr-2 size-4 ${value === city ? "opacity-100" : "opacity-0"}`} />{city}</CommandItem>)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const;

type Attribution = {
  utm: Record<string, string>;
  origin: { page: string; landing_url: string; referrer: string };
};

function captureAttribution(publicSlug: string): Attribution {
  if (typeof window === "undefined") return { utm: {}, origin: { page: "", landing_url: "", referrer: "" } };
  const storageKey = `form-attribution:${publicSlug}`;
  const params = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(
    campaignKeys.flatMap((key) => {
      const value = params.get(key)?.trim();
      return value ? [[key, value.slice(0, 255)]] : [];
    }),
  );
  if (Object.keys(utm).length === 0) {
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Attribution;
        if (parsed && typeof parsed === "object" && parsed.utm && parsed.origin) return parsed;
      }
    } catch {
      // A captura atual continua funcionando quando o armazenamento do navegador está indisponível.
    }
  }
  const page = window.location.href.slice(0, 255);
  const captured = {
    utm,
    origin: {
      page,
      landing_url: page,
      referrer: document.referrer.slice(0, 255),
    },
  };
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(captured));
  } catch {
    // Alguns navegadores bloqueiam sessionStorage; o envio ainda usa a captura em memória.
  }
  return captured;
}

function fieldFormatError(kind: string, raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (kind === "email" && !emailPattern.test(raw.trim())) return "Informe um e-mail válido (exemplo: nome@empresa.com.br).";
  if (kind === "phone") {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) return "Informe um telefone com DDD.";
  }
  return null;
}

export const Route = createFileRoute("/f/$publicSlug")({
  loader: async ({ params }) =>
    (await getPublicForm({ data: { publicSlug: params.publicSlug } })) as unknown as PublicFormData,
  component: PublicForm,
  errorComponent: () => <main className="grid min-h-screen place-items-center bg-secondary p-6"><div className="max-w-md text-center"><h1 className="text-2xl font-bold">Formulário indisponível</h1><p className="mt-2 text-muted-foreground">O link pode estar incorreto ou a captação foi encerrada.</p></div></main>,
  notFoundComponent: () => <main className="grid min-h-screen place-items-center"><p>Formulário não encontrado.</p></main>,
  head: ({ loaderData }) => ({
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700;800&family=Hind:wght@400;500;600;700&display=swap" },
    ],
    meta: [
    { title: loaderData?.definition.name ?? "Formulário" },
    { name: "description", content: "Formulário de captação e qualificação." },
    { property: "og:title", content: loaderData?.definition.name ?? "Formulário" },
    { property: "og:description", content: "Formulário de captação e qualificação." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function PublicForm() {
  const data = Route.useLoaderData();
  const { publicSlug } = Route.useParams();
  const send = useServerFn(submitPublicForm);
  const fields = data.definition.fields;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [accepted, setAccepted] = useState(false);
  const [result, setResult] = useState<{ completionPageKey: string; message?: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const field = fields[step];
  const logoUrl = data.definition.appearance.assets["logo"];
  const heroUrl = data.definition.appearance.assets["hero"];
  const copy = data.definition.appearance.copy;
  const themeVars = useMemo(() => formThemeVars(data.definition.appearance.tokens), [data.definition.appearance.tokens]);
  const isDirect = data.definition.mode === "direct";
  const title = copy["title"] || (data.definition.schemaVersion < 2 ? "Seu futuro começa aqui." : data.definition.name);
  const subtitle = copy["subtitle"] || (isDirect ? "Preencha seus dados para falar com nossa equipe." : data.definition.schemaVersion < 2 ? "Mais oportunidades para quem constrói o amanhã." : "Responda às perguntas para continuar.");
  const submitLabel = copy["submitLabel"] || "Enviar";
  const consentText = copy["consentText"] || "Autorizo o uso dos meus dados para contato e atendimento desta solicitação.";
  const attribution = useMemo(() => captureAttribution(publicSlug), [publicSlug]);
  useEffect(() => {
    // Pixel da própria empresa, informado na aparência do formulário (opcional).
    initMetaPixel(copy["metaPixelId"]);
  }, [copy]);
  const mutation = useMutation({
     mutationFn: () => {
       idempotencyKey.current ??= crypto.randomUUID();
       return send({ data: { publicSlug, versionId: data.versionId, answers, consent: { accepted: true, acceptedAt: new Date().toISOString() }, idempotencyKey: idempotencyKey.current, companyWebsite, utm: attribution.utm, origin: attribution.origin } });
     },
    onSuccess: (response) => {
      trackMetaLead(response.token, { content_name: data.definition.name, content_category: response.classification ?? undefined, form_slug: publicSlug });
      setResult({ completionPageKey: response.completionPageKey, message: response.message });
      const redirect = response.redirect;
      // Pequena espera para o pixel concluir o envio do Lead antes de sair da página.
      if (redirect && typeof window !== "undefined") window.setTimeout(() => { window.location.href = redirect; }, 400);
    },
  });
  const value = field ? answers[field.key] : undefined;
  const filled = Array.isArray(value) ? value.length > 0 : value != null && value !== "";
  const emailInvalid = !!field && field.kind === "email" && typeof value === "string" && value.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  const isAnswered = (!field || !field.required || filled) && !emailInvalid;
  const completion = data.definition.completionPages.find((page: FormDraft["completionPages"][number]) => page.key === result?.completionPageKey) ?? data.definition.completionPages[0];
  const applyOutcome = (nextAnswers: Record<string, unknown>, fromStep: number) => {
    const outcome = evaluateRules(data.definition.rules, { answers: nextAnswers });
    setNotice(outcome.message ?? null);
    if (outcome.terminated || outcome.selectedCompletionPage) return setStep(fields.length);
    if (outcome.skipToFieldKey) {
      const target = fields.findIndex((item: FormDraft["fields"][number]) => item.key === outcome.skipToFieldKey);
      if (target > fromStep) return setStep(target);
    }
    setStep(fromStep + 1);
  };
  const continueForm = (nextAnswers = answers) => applyOutcome(nextAnswers, step);
  const directReady = fields.every((item: FormDraft["fields"][number]) => {
    const answer = answers[item.key];
    const filledItem = Array.isArray(answer) ? answer.length > 0 : answer != null && answer !== "";
    return (!item.required || filledItem) && !fieldFormatError(item.kind, answer);
  });

  if (result && completion) return <main style={themeVars} className="valesafe-form grid min-h-screen place-items-center bg-vs-canvas p-5 text-vs-on-dark"><section className="w-full max-w-xl rounded-3xl bg-vs-card p-7 text-center text-vs-ink shadow-vs-card sm:p-10"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-vs-yellow text-vs-ink"><Check className="size-7" /></div><h1 className="mt-6 text-3xl font-extrabold">{completion.title}</h1><p className="mt-3 text-lg text-vs-muted">{completion.description}</p>{result.message ? <p className="mt-5 rounded-xl border border-vs-line p-4 text-sm text-vs-muted">{result.message}</p> : null}{completion.actionTarget ? <Button className="mt-7 min-h-14 w-full rounded-2xl bg-vs-yellow font-bold text-vs-ink shadow-vs-button hover:bg-vs-yellow-hover" asChild><a href={completion.actionTarget} rel="noopener noreferrer">{completion.buttonLabel || "Continuar"}</a></Button> : null}</section></main>;

  if (isDirect) return (
    <main style={themeVars} className="valesafe-form min-h-screen bg-vs-canvas px-4 py-5 text-vs-on-dark sm:px-6 lg:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl content-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,34rem)] lg:items-center lg:gap-14">
        <section className="min-w-0">
          {logoUrl ? <img src={logoUrl} alt={data.definition.name} className="h-9 w-auto max-w-40 object-contain object-left sm:h-11" /> : <strong className="text-lg">{data.definition.name}</strong>}
           <h1 className={`mt-7 max-w-xl leading-tight ${formatClass(copy, "title", publicTitleSizeClasses, darkColorClasses)}`} style={textStyle(copy, "title")}>{title}</h1>
           <p className={`mt-3 max-w-xl leading-relaxed ${formatClass(copy, "subtitle", publicSubtitleSizeClasses, darkColorClasses)}`} style={textStyle(copy, "subtitle")}>{subtitle}</p>
          {heroUrl ? <img src={heroUrl} alt="" className="mt-6 max-h-64 w-full rounded-2xl object-cover lg:max-h-80" /> : null}
        </section>
        <section className="rounded-3xl bg-vs-card p-5 text-vs-ink shadow-vs-card sm:p-8">
          <input type="text" name="companyWebsite" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />
          <div className="space-y-4">
            {fields.map((item: FormDraft["fields"][number]) => {
              const itemValue = answers[item.key];
              const legendClass = `mb-2 ${formatClass(copy, "question", publicSubtitleSizeClasses, cardColorClasses)}`;
              const description = item.description ? <p className="mb-2 text-xs text-vs-muted">{item.description}</p> : null;
              if (item.kind === "single_choice" || item.kind === "boolean") {
                const options = item.kind === "boolean" ? [{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }] : item.options;
                  return <fieldset key={item.key}><legend className={legendClass} style={textStyle(copy, "question")}>{item.label}{item.required ? " *" : ""}</legend>{description}<div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <Button key={option.value} type="button" variant="outline" className={`h-auto min-h-11 justify-start whitespace-normal ${itemValue === option.value ? "border-vs-yellow bg-vs-yellow-soft" : "border-vs-line"}`} onClick={() => setAnswers({ ...answers, [item.key]: option.value })}>{option.label}</Button>)}</div></fieldset>;
              }
              if (item.kind === "multi_choice") return <fieldset key={item.key}><legend className={legendClass} style={textStyle(copy, "question")}>{item.label}{item.required ? " *" : ""}</legend>{description}<div className="grid gap-2">{item.options.map((option) => { const selected = Array.isArray(itemValue) && itemValue.includes(option.value); return <Label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-vs-line p-3"><Checkbox checked={selected} onCheckedChange={() => { const current = Array.isArray(itemValue) ? itemValue as string[] : []; setAnswers({ ...answers, [item.key]: selected ? current.filter((entry) => entry !== option.value) : [...current, option.value] }); }} />{option.label}</Label>; })}</div></fieldset>;
              if (item.kind === "state") {
                const cityKey = fields.find((entry: FormDraft["fields"][number]) => entry.kind === "city")?.key;
                return <div key={item.key}><Label className="text-sm font-bold">{item.label}{item.required ? " *" : ""}</Label>{item.description ? <p className="mt-1 text-xs text-vs-muted">{item.description}</p> : null}<StateSelect className="mt-2 h-12 rounded-xl border-vs-line" value={typeof itemValue === "string" ? itemValue : ""} onChange={(next) => setAnswers({ ...answers, [item.key]: next, ...(cityKey ? { [cityKey]: "" } : {}) })} /></div>;
              }
              if (item.kind === "city") {
                const stateKey = fields.find((entry: FormDraft["fields"][number]) => entry.kind === "state")?.key;
                const stateAnswer = stateKey && typeof answers[stateKey] === "string" ? answers[stateKey] as string : "";
                if (!stateKey) {
                  return <div key={item.key}><Label htmlFor={`direct-${item.key}`} className="text-sm font-bold">{item.label}{item.required ? " *" : ""}</Label>{item.description ? <p className="mt-1 text-xs text-vs-muted">{item.description}</p> : null}<Input id={`direct-${item.key}`} className="mt-2 h-12 rounded-xl border-vs-line" placeholder={item.placeholder ?? "Digite aqui"} value={typeof itemValue === "string" ? itemValue : ""} onChange={(event) => setAnswers({ ...answers, [item.key]: event.target.value })} /></div>;
                }
                return <div key={item.key}><Label className="text-sm font-bold">{item.label}{item.required ? " *" : ""}</Label>{item.description ? <p className="mt-1 text-xs text-vs-muted">{item.description}</p> : null}<CitySelect className="mt-2 h-12 rounded-xl border-vs-line" stateValue={stateAnswer} value={typeof itemValue === "string" ? itemValue : ""} onChange={(next) => setAnswers({ ...answers, [item.key]: next })} /></div>;
              }
              const itemError = fieldFormatError(item.kind, itemValue);
              return <div key={item.key}><Label htmlFor={`direct-${item.key}`} className="text-sm font-bold">{item.label}{item.required ? " *" : ""}</Label>{item.description ? <p className="mt-1 text-xs text-vs-muted">{item.description}</p> : null}<Input id={`direct-${item.key}`} className={`mt-2 h-12 rounded-xl ${itemError ? "border-destructive" : "border-vs-line"}`} type={item.kind === "email" ? "email" : item.kind === "number" ? "number" : item.kind === "phone" ? "tel" : "text"} placeholder={item.placeholder ?? "Digite aqui"} value={typeof itemValue === "string" || typeof itemValue === "number" ? itemValue : ""} onChange={(event) => setAnswers({ ...answers, [item.key]: event.target.value })} onBlur={(event) => setAnswers({ ...answers, [item.key]: event.target.value })} />{itemError ? <p className="mt-1 text-sm font-semibold text-destructive">{itemError}</p> : null}</div>;
            })}
          </div>
          <Label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-vs-line p-4 text-vs-muted"><Checkbox checked={accepted} onCheckedChange={(checked) => setAccepted(checked === true)} /><span className="text-sm leading-relaxed">{consentText}</span></Label>
          {mutation.error ? <p className="mt-4 text-sm text-destructive">{mutation.error.message}</p> : null}
          <Button type="button" disabled={!directReady || !accepted || mutation.isPending} onClick={() => mutation.mutate()} className="mt-5 min-h-14 w-full rounded-2xl bg-vs-yellow text-base font-bold text-vs-ink shadow-vs-button hover:bg-vs-yellow-hover">{mutation.isPending ? <><LoaderCircle className="size-4 animate-spin" /> Enviando...</> : <>{submitLabel} <ArrowRight className="size-4" /></>}</Button>
        </section>
      </div>
    </main>
  );

  return (
    <main style={themeVars} className="valesafe-form relative min-h-svh overflow-hidden bg-vs-canvas font-form-body text-vs-on-dark">
      <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col px-4 pb-4 sm:px-6 lg:max-w-7xl lg:px-10 lg:pb-7">
        <header className="relative z-30 grid grid-cols-1 items-end gap-4 pt-4 sm:pt-6 lg:pt-8">
          <div className="min-w-0">{logoUrl ? <img src={logoUrl} alt={data.definition.name} className="h-8 w-auto max-w-36 object-contain object-left sm:h-10 sm:max-w-44" /> : <strong className="truncate text-lg">{data.definition.name}</strong>}</div>
          <Progress value={fields.length ? Math.min(100, ((step + 1) / fields.length) * 100) : 100} className="h-1.5 border border-vs-on-dark/10 bg-vs-track [&>div]:bg-vs-yellow" />
        </header>

        <div className="relative grid flex-1 content-start grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,34rem)] lg:items-center lg:gap-12 xl:gap-20">
          <section className="relative pt-5 sm:pt-8 lg:min-h-[34rem] lg:pt-20">
            <div className="relative z-10 w-full lg:max-w-lg">
              <h1 className={`font-form-display leading-[1.08] ${formatClass(copy, "title", publicTitleSizeClasses, darkColorClasses)}`} style={textStyle(copy, "title")}>{title}</h1>
              <p className={`mt-2 leading-snug sm:mt-3 lg:max-w-sm ${formatClass(copy, "subtitle", publicSubtitleSizeClasses, darkColorClasses)}`} style={textStyle(copy, "subtitle")}>{subtitle}</p>
            </div>
            {heroUrl ? <img src={heroUrl} alt="Profissional ValeSafe com equipamento de segurança" className="relative z-0 mt-4 max-h-64 w-full object-contain object-center sm:mt-6 sm:max-h-80 lg:absolute lg:right-[-1rem] lg:bottom-[-2rem] lg:mt-0 lg:h-[31rem] lg:max-h-none lg:w-auto lg:max-w-[68%] lg:object-right-bottom" /> : null}
          </section>

          <div className="relative z-20 mt-5 lg:mt-0">
            <section key={step} className="animate-form-step rounded-2xl border border-vs-line bg-vs-card p-5 text-vs-ink shadow-vs-card sm:rounded-3xl sm:p-8">
               <input type="text" name="companyWebsite" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />
              {field ? <>
                 <h2 className={`font-form-display leading-tight ${formatClass(copy, "question", publicQuestionSizeClasses, cardColorClasses)}`} style={textStyle(copy, "question")}>{field.label}</h2>
                {field.description ? <p className="mt-2 text-sm leading-relaxed text-vs-muted sm:text-base">{field.description}</p> : null}
                <div className="mt-6">
                   {field.kind === "single_choice" || field.kind === "boolean" ? <div className="grid max-h-[42vh] gap-2.5 overflow-y-auto pr-1 lg:max-h-[48vh]">{(field.kind === "boolean" ? [{ value: "yes", label: "Sim", score: 0, position: 0 }, { value: "no", label: "Não", score: 0, position: 1 }] : field.options).map((option: FormDraft["fields"][number]["options"][number]) => <Button key={option.value} type="button" variant="outline" className={`h-auto min-h-13 justify-start rounded-xl border px-4 py-3 text-left text-sm font-semibold whitespace-normal transition-all active:scale-[0.99] ${value === option.value ? "border-vs-yellow bg-vs-yellow text-vs-ink hover:bg-vs-yellow-hover" : "border-vs-line bg-vs-card text-vs-ink hover:border-vs-yellow hover:bg-vs-yellow-soft"}`} onClick={() => { setAnswers({ ...answers, [field.key]: option.value }); setNotice(null); }}>{option.label}</Button>)}</div> : null}
                  {field.kind === "multi_choice" ? <div className="grid max-h-[42vh] gap-2.5 overflow-y-auto pr-1 lg:max-h-[48vh]">{field.options.map((option: FormDraft["fields"][number]["options"][number]) => { const selected = Array.isArray(value) && value.includes(option.value); return <Label key={option.value} className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold transition-colors ${selected ? "border-vs-yellow bg-vs-yellow-soft" : "border-vs-line bg-vs-card hover:border-vs-yellow"}`}><Checkbox checked={selected} onCheckedChange={() => { const current = Array.isArray(value) ? value as string[] : []; setAnswers({ ...answers, [field.key]: selected ? current.filter((item) => item !== option.value) : [...current, option.value] }); }} />{option.label}</Label>; })}</div> : null}
                  {field.kind === "state" ? (() => { const cityKey = fields.find((entry: FormDraft["fields"][number]) => entry.kind === "city")?.key; return <StateSelect className="h-13 rounded-xl border-2 border-vs-line bg-secondary px-4 text-base text-vs-ink focus:border-vs-yellow focus:bg-vs-card focus:ring-vs-yellow/25" value={typeof value === "string" ? value : ""} onChange={(next) => setAnswers({ ...answers, [field.key]: next, ...(cityKey ? { [cityKey]: "" } : {}) })} />; })() : null}
                  {field.kind === "city" ? (() => { const stateKey = fields.find((entry: FormDraft["fields"][number]) => entry.kind === "state")?.key; const stateAnswer = stateKey && typeof answers[stateKey] === "string" ? answers[stateKey] as string : ""; if (!stateKey) return <Input autoFocus className="h-13 rounded-xl border-2 border-vs-line bg-secondary px-4 text-base text-vs-ink placeholder:text-vs-muted focus-visible:border-vs-yellow focus-visible:bg-vs-card focus-visible:ring-vs-yellow/25" placeholder={field.placeholder ?? "Digite sua resposta"} value={typeof value === "string" ? value : ""} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} />; return <CitySelect className="h-13 rounded-xl border-2 border-vs-line bg-secondary px-4 text-base text-vs-ink focus:border-vs-yellow focus:bg-vs-card focus:ring-vs-yellow/25" stateValue={stateAnswer} value={typeof value === "string" ? value : ""} onChange={(next) => setAnswers({ ...answers, [field.key]: next })} />; })() : null}
                  {!['single_choice','multi_choice','boolean','state','city'].includes(field.kind) ? <Input autoFocus className="h-13 rounded-xl border-2 border-vs-line bg-secondary px-4 text-base text-vs-ink placeholder:text-vs-muted focus-visible:border-vs-yellow focus-visible:bg-vs-card focus-visible:ring-vs-yellow/25" type={field.kind === "email" ? "email" : field.kind === "number" ? "number" : field.kind === "phone" ? "tel" : "text"} inputMode={field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : field.kind === "number" ? "numeric" : "text"} placeholder={field.placeholder ?? "Digite sua resposta"} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && isAnswered && step < fields.length - 1) continueForm(); }} /> : null}
                   {emailInvalid ? <p className="mt-2 text-sm font-semibold text-destructive">Informe um e-mail válido (exemplo: nome@empresa.com.br).</p> : null}
                   {notice ? <p className="mt-4 rounded-xl border border-vs-line bg-vs-yellow-soft p-3 text-sm leading-relaxed text-vs-muted">{notice}</p> : null}
                 </div>
               </> : <div><ShieldCheck className="size-10 text-vs-yellow-strong" /><h2 className="mt-5 text-3xl font-extrabold">Tudo pronto para enviar</h2><p className="mt-3 text-vs-muted">Revise seus dados e confirme o consentimento para concluir.</p><Label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-vs-line p-4 text-vs-muted"><Checkbox checked={accepted} onCheckedChange={(checked) => setAccepted(checked === true)} /><span className="text-sm leading-relaxed">{consentText}</span></Label>{mutation.error ? <p className="mt-4 text-sm text-destructive">{mutation.error.message}</p> : null}</div>}

               {field ? <Button type="button" disabled={!isAnswered} onClick={() => continueForm()} className="mt-5 min-h-13 w-full rounded-xl bg-vs-ink text-sm font-bold uppercase text-vs-card transition-all hover:bg-vs-track active:scale-[0.99] disabled:bg-vs-line disabled:text-vs-muted">Continuar <ArrowRight className="size-4 text-vs-yellow" /></Button> : <Button type="button" disabled={!accepted || mutation.isPending} onClick={() => mutation.mutate()} className="mt-5 min-h-13 w-full rounded-xl bg-vs-ink text-sm font-bold uppercase text-vs-card transition-all hover:bg-vs-track active:scale-[0.99] disabled:bg-vs-line disabled:text-vs-muted">{mutation.isPending ? <><LoaderCircle className="size-4 animate-spin" /> Enviando...</> : <>{submitLabel} <ArrowRight className="size-4 text-vs-yellow" /></>}</Button>}
            </section>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 sm:py-4">
              <Button type="button" variant="ghost" disabled={step === 0 || mutation.isPending} onClick={() => { setNotice(null); setStep((current) => Math.max(0, current - 1)); }} className="w-fit px-0 text-xs font-bold uppercase text-vs-on-dark/55 hover:bg-transparent hover:text-vs-on-dark disabled:opacity-30"><ArrowLeft className="size-3.5" /> Voltar</Button>
               <div className="flex min-w-0 items-center justify-end gap-2 rounded-full border border-vs-on-dark/10 bg-vs-surface px-3 py-1.5 text-right text-[0.625rem] font-semibold uppercase leading-tight text-vs-on-dark/55"><span className="size-1.5 shrink-0 rounded-full bg-vs-yellow" /><span>Ambiente seguro</span></div>
            </div>
          </div>
        </div>

         <footer className="mt-auto pt-1 text-center text-[0.625rem] font-semibold uppercase text-vs-on-dark/35">{copy["footer"] ?? "Formulário seguro"}</footer>
      </div>
    </main>
  );
}