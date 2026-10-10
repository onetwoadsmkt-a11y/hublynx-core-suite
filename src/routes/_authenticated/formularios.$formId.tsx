import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, Bold, ChevronDown, ChevronUp, Eye, GripVertical, Italic, Plus, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormMobilePreview } from "@/components/forms/FormMobilePreview";
import { ImageUploadField } from "@/components/forms/ImageUploadField";
import { RulesEditor } from "@/components/forms/RulesEditor";
import { Textarea } from "@/components/ui/textarea";
import { normalizeFormDraft } from "@/lib/forms/editor-defaults";
import { calculatePossibleScoreRange, fieldKindLabels, fieldKinds, type FormDraft, type FormField, validateScoreRangeCoverage, validateScoringQuestions } from "@/lib/forms/domain";
import { getFormDraft, publishForm, saveFormDraft } from "@/lib/forms/forms.functions";

export const Route = createFileRoute("/_authenticated/formularios/$formId")({
  component: FormEditor,
  head: () => ({ meta: [
    { title: "Editor de formulário — Hublynx Core" },
    { name: "description", content: "Configure perguntas, pontuação e identidade visual do formulário." },
    { property: "og:title", content: "Editor de formulário" },
    { property: "og:description", content: "Construtor visual de formulários de captação." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type DraftData = Awaited<ReturnType<typeof getFormDraft>>;

/** Rascunho salvo (JSON) + colunas do formulário → estado do editor. */
function toDraft(data: DraftData): FormDraft {
  const d = data.draft as unknown as Partial<FormDraft>;
  const tokens = (d.appearance?.tokens ?? {}) as Partial<FormDraft["appearance"]["tokens"]>;
  return normalizeFormDraft({
    formId: data.form.id,
    mode: data.form.mode === "direct" ? "direct" : "scoring",
    name: data.form.name,
    slug: data.form.slug,
    fields: (d.fields ?? []) as FormDraft["fields"],
    ranges: (d.ranges ?? []) as FormDraft["ranges"],
    rules: (d.rules ?? []) as FormDraft["rules"],
    appearance: {
      presetKey: d.appearance?.presetKey ?? "focus",
      tokens: {
        primary: tokens.primary ?? "#00D084",
        secondary: tokens.secondary ?? "#0B1220",
        background: tokens.background ?? "#FFFFFF",
        text: tokens.text ?? "#171717",
        radius: tokens.radius ?? "medium",
      },
      assets: d.appearance?.assets ?? {},
      copy: d.appearance?.copy ?? {},
    },
    completionPages: (d.completionPages?.length
      ? d.completionPages
      : [{ key: "success", title: "Obrigado!", description: "Recebemos suas informações.", buttonLabel: null, actionType: "none", actionTarget: null }]) as FormDraft["completionPages"],
  });
}

type Destination = { pipelineId: string | null; stageId: string | null; defaultSource: string | null };

type TextTarget = "title" | "subtitle" | "question";

const legacyTextColors: Record<string, string> = {
  default: "#171717", muted: "#6b7280", primary: "#d9a900", blue: "#2563eb",
  green: "#16834b", red: "#dc2626", orange: "#ea580c", purple: "#9333ea",
};

function TextFormattingControls({ draft, target, onChange }: { draft: FormDraft; target: TextTarget; onChange: (draft: FormDraft) => void }) {
  const copy = draft.appearance.copy;
  const update = (key: string, value: string) => onChange({ ...draft, appearance: { ...draft.appearance, copy: { ...copy, [`${target}${key}`]: value } } });
  const alignment = copy[`${target}Align`] ?? "left";
  const weight = copy[`${target}Weight`] ?? (target === "subtitle" ? "normal" : "bold");
  const italic = copy[`${target}Italic`] === "true";
  const savedColor = copy[`${target}Color`] ?? "default";
  const color = savedColor.startsWith("#") ? savedColor : legacyTextColors[savedColor] ?? legacyTextColors["default"];
  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">Formatação</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input p-0.5">
          {([['left', AlignLeft, 'Alinhar à esquerda'], ['center', AlignCenter, 'Centralizar'], ['right', AlignRight, 'Alinhar à direita']] as const).map(([value, Icon, label]) => <Button key={value} type="button" size="icon" variant={alignment === value ? "secondary" : "ghost"} className="size-8" aria-label={label} title={label} onClick={() => update("Align", value)}><Icon className="size-4" /></Button>)}
        </div>
        <Button type="button" size="icon" variant={weight === "bold" ? "secondary" : "outline"} className="size-9" aria-label="Negrito" title="Negrito" onClick={() => update("Weight", weight === "bold" ? "normal" : "bold")}><Bold className="size-4" /></Button>
        <Button type="button" size="icon" variant={italic ? "secondary" : "outline"} className="size-9" aria-label="Itálico" title="Itálico" onClick={() => update("Italic", italic ? "false" : "true")}><Italic className="size-4" /></Button>
        <Select value={copy[`${target}Size`] ?? "medium"} onValueChange={(value) => update("Size", value)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">Pequeno</SelectItem><SelectItem value="medium">Médio</SelectItem><SelectItem value="large">Grande</SelectItem></SelectContent></Select>
        <div className="flex min-w-44 flex-1 items-center gap-2 sm:max-w-56">
          <Input type="color" className="w-14 shrink-0 p-1" value={color} aria-label="Selecionar cor do texto" onChange={(event) => update("Color", event.target.value)} />
          <Input value={color} aria-label="Código da cor do texto" onChange={(event) => update("Color", event.target.value)} />
        </div>
      </div>
    </div>
  );
}

function FormEditor() {
  const { formId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchDraft = useServerFn(getFormDraft);
  const save = useServerFn(saveFormDraft);
  const publish = useServerFn(publishForm);
  const query = useQuery({ queryKey: ["form-draft", formId], queryFn: () => fetchDraft({ data: { formId } }) });
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [destination, setDestination] = useState<Destination>({ pipelineId: null, stageId: null, defaultSource: null });
  useEffect(() => {
    if (!query.data) return;
    setDraft(toDraft(query.data));
    setDestination({
      pipelineId: query.data.form.pipeline_id,
      stageId: query.data.form.stage_id,
      defaultSource: query.data.form.default_source,
    });
  }, [query.data]);
  const publishedDefinition = (query.data?.publishedVersion?.definition ?? null) as { mode?: string; fields?: Array<{ key: string }> } | null;
  const draftActiveKeys = draft ? draft.fields.filter((field) => field.active !== false).map((field) => field.key) : [];
  const publishedKeys = publishedDefinition?.fields?.map((field) => field.key) ?? [];
  const hasUnpublishedChanges = Boolean(draft) && Boolean(publishedDefinition) && (
    (publishedDefinition?.mode ?? "scoring") !== draft?.mode || draftActiveKeys.join("|") !== publishedKeys.join("|")
  );
  const mutation = useMutation({
    mutationFn: async (mode: "save" | "publish") => {
      if (!draft) throw new Error("Formulário indisponível.");
      const payload = { ...draft, destination };
      return mode === "publish" ? publish({ data: payload }) : save({ data: payload });
    },
    onSuccess: (result) => {
      toast.success("version" in result ? `Versão ${result.version} publicada` : "Alterações salvas");
      queryClient.invalidateQueries({ queryKey: ["lead-forms"] });
      queryClient.invalidateQueries({ queryKey: ["form-draft", formId] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.error) return (
    <div className="space-y-3">
      <p className="text-destructive">{(query.error as Error).message}</p>
      <Button variant="outline" onClick={() => navigate({ to: "/formularios" })}>Voltar para a central</Button>
    </div>
  );
  if (query.isLoading || !draft) return <p className="text-muted-foreground">Carregando editor...</p>;

  const updateField = (index: number, update: Partial<FormField>) => setDraft((current) => current ? ({ ...current, fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...update } : field) }) : current);
  const moveField = (index: number, direction: -1 | 1) => setDraft((current) => {
    if (!current) return current;
    const target = index + direction;
    if (target < 0 || target >= current.fields.length) return current;
    const fields = [...current.fields];
    const currentField = fields[index];
    const targetField = fields[target];
    if (!currentField || !targetField) return current;
    fields[index] = targetField;
    fields[target] = currentField;
    return { ...current, fields: fields.map((field, position) => ({ ...field, position })) };
  });
  const addField = () => setDraft((current) => current ? ({ ...current, fields: [...current.fields, { key: `campo_${current.fields.length + 1}`, kind: current.mode === "direct" ? "text" : "single_choice", section: current.mode === "direct" ? "identity" : "qualification", label: current.mode === "direct" ? "Novo campo" : "Nova pergunta", description: null, placeholder: null, required: true, active: true, position: current.fields.length, validation: {}, settings: {}, options: current.mode === "direct" ? [] : [{ value: "opcao_1", label: "Opção 1", score: 0, position: 0 }] }] }) : current);
  const possibleScoreRange = calculatePossibleScoreRange(draft.fields);
  const coverageErrors = validateScoreRangeCoverage(draft.ranges, possibleScoreRange);
  const scoringQuestionErrors = draft.mode === "scoring" ? validateScoringQuestions(draft.fields) : [];


  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Voltar" onClick={() => navigate({ to: "/formularios" })}><ArrowLeft className="size-4" /></Button>
          <div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Editor</p><h1 className="text-2xl font-extrabold">{draft.name}</h1>{hasUnpublishedChanges ? <p className="mt-1 text-xs font-semibold text-destructive">A prévia mostra as alterações ainda não publicadas. Clique em Publicar para aplicar no link público.</p> : null}</div>
        </div>
        <div className="flex gap-2">
          {query.data?.form.active_version_id ? <Button variant="outline" asChild><a href={`/f/${query.data.form.public_id}-${draft.slug}`} target="_blank" rel="noreferrer"><Eye className="size-4" /> Visualizar</a></Button> : null}
          <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("save")}><Save className="size-4" /> Salvar</Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate("publish")}><Send className="size-4" /> Publicar</Button>
        </div>
      </div>

      <Tabs defaultValue="structure">
        <TabsList className="h-auto w-full justify-start overflow-x-auto bg-transparent p-0">
          {([['structure','Estrutura'],['fields','Campos'],['score','Pontuação'],['logic','Lógica'],['destination','Destino no CRM'],['appearance','Aparência'],['completion','Encerramento'],['settings','Configurações']] as const).map(([value,label]) => { const blocked = draft.mode !== "scoring" && (value === "score" || value === "logic"); return <TabsTrigger key={value} value={value} disabled={blocked} title={blocked ? "Não se aplica a formulários de captação de dados — disponível apenas no modo lead scoring" : undefined} className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none disabled:opacity-40">{label}</TabsTrigger>; })}
        </TabsList>
        {draft.mode !== "scoring" ? <p className="mt-2 text-xs text-muted-foreground">Pontuação e Lógica: não se aplica a formulários de captação de dados — disponível apenas no modo lead scoring.</p> : null}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            <TabsContent value="structure" className="mt-6">
              <div className="space-y-5">
              <div><h2 className="text-lg font-bold">Estrutura do formulário</h2><p className="text-sm text-muted-foreground">Defina o formato e os textos que a pessoa verá.</p></div>
              <div><Label>Tipo de formulário</Label><Select value={draft.mode} onValueChange={(value) => setDraft({ ...draft, mode: value as FormDraft["mode"] })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="scoring">Qualificação com lead scoring</SelectItem><SelectItem value="direct">Captação de dados</SelectItem></SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">{draft.mode === "scoring" ? "Uma pergunta por etapa, com pontuação, classificação e regras. Somente perguntas marcadas como ativas entram no fluxo." : "Todos os campos aparecem juntos, com consentimento e envio direto."}</p>{scoringQuestionErrors.length > 0 ? <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert"><p className="font-semibold">Este formulário ainda não pode ser publicado como lead scoring.</p><p className="mt-1">{scoringQuestionErrors[0]}</p></div> : null}</div>
               <div className="space-y-3"><div><Label htmlFor="public-title">Título do formulário</Label><Input id="public-title" className="mt-2" value={draft.appearance.copy["title"] ?? ""} placeholder={draft.name} onChange={(event) => setDraft({ ...draft, appearance: { ...draft.appearance, copy: { ...draft.appearance.copy, title: event.target.value } } })} /></div><TextFormattingControls draft={draft} target="title" onChange={setDraft} /></div>
               <div className="space-y-3"><div><Label htmlFor="public-subtitle">Subtítulo</Label><Textarea id="public-subtitle" className="mt-2" value={draft.appearance.copy["subtitle"] ?? ""} placeholder="Explique brevemente o objetivo deste formulário." onChange={(event) => setDraft({ ...draft, appearance: { ...draft.appearance, copy: { ...draft.appearance.copy, subtitle: event.target.value } } })} /></div><TextFormattingControls draft={draft} target="subtitle" onChange={setDraft} /></div>
               <div><Label>Texto das perguntas</Label><div className="mt-2"><TextFormattingControls draft={draft} target="question" onChange={setDraft} /></div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageUploadField id="logo" formId={draft.formId} organizationId={query.data?.form.organization_id ?? ""} label="Logo ou imagem do cabeçalho (opcional)" hint="Recomendado: 320 × 80 px (PNG ou SVG com fundo transparente), até 5 MB." value={draft.appearance.assets["logo"] ?? ""} onChange={(value) => { const assets = { ...draft.appearance.assets }; if (value) assets["logo"] = value; else delete assets["logo"]; setDraft({ ...draft, appearance: { ...draft.appearance, assets } }); }} />
                <ImageUploadField id="hero" formId={draft.formId} organizationId={query.data?.form.organization_id ?? ""} label="Imagem principal (opcional)" hint="Recomendado: 800 × 1000 px (PNG ou JPG, retrato), até 5 MB." value={draft.appearance.assets["hero"] ?? ""} onChange={(value) => { const assets = { ...draft.appearance.assets }; if (value) assets["hero"] = value; else delete assets["hero"]; setDraft({ ...draft, appearance: { ...draft.appearance, assets } }); }} />
              </div>
              <div><Label htmlFor="submit-label">Texto do botão de envio</Label><Input id="submit-label" className="mt-2" value={draft.appearance.copy["submitLabel"] ?? ""} placeholder="Enviar" onChange={(event) => setDraft({ ...draft, appearance: { ...draft.appearance, copy: { ...draft.appearance.copy, submitLabel: event.target.value } } })} /></div>
              <div><Label htmlFor="consent-text">Texto de consentimento</Label><Textarea id="consent-text" className="mt-2" value={draft.appearance.copy["consentText"] ?? ""} placeholder="Autorizo o uso dos meus dados para contato." onChange={(event) => setDraft({ ...draft, appearance: { ...draft.appearance, copy: { ...draft.appearance.copy, consentText: event.target.value } } })} /></div>
              </div>
            </TabsContent>

            <TabsContent value="fields" className="mt-6 space-y-4">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Campos e perguntas</h2><p className="text-sm text-muted-foreground">Os dados pessoais e as perguntas seguem a ordem abaixo.</p></div><Button size="sm" onClick={addField}><Plus className="size-4" /> Adicionar</Button></div>
          {draft.fields.map((field, index) => (
            <div key={`${field.key}-${index}`} className="card-surface p-4">
              <div className="grid gap-4 lg:grid-cols-[32px_1fr_180px_auto] lg:items-start">
                <GripVertical className="mt-2 hidden size-4 text-muted-foreground lg:block" />
                <div className="space-y-3"><Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} aria-label="Pergunta" /><div className="grid gap-3 sm:grid-cols-2"><Input value={field.key} onChange={(event) => updateField(index, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} aria-label="Identificador" /><Select value={field.section} onValueChange={(value) => updateField(index, { section: value as FormField["section"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="identity">Dados pessoais</SelectItem>{draft.mode === "scoring" ? <SelectItem value="qualification">Qualificação</SelectItem> : null}</SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2"><Input value={field.description ?? ""} onChange={(event) => updateField(index, { description: event.target.value || null })} placeholder="Descrição (opcional)" /><Input value={field.placeholder ?? ""} onChange={(event) => updateField(index, { placeholder: event.target.value || null })} placeholder="Texto dentro do campo (opcional)" /></div></div>
                <Select value={field.kind} onValueChange={(value) => updateField(index, { kind: value as FormField["kind"], options: value === "single_choice" || value === "multi_choice" ? field.options.length ? field.options : [{ value: "opcao_1", label: "Opção 1", score: 0, position: 0 }] : [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fieldKinds.map((kind) => <SelectItem key={kind} value={kind}>{fieldKindLabels[kind]}</SelectItem>)}</SelectContent></Select>
                <div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => moveField(index, -1)} disabled={index === 0} aria-label="Mover para cima"><ChevronUp className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => moveField(index, 1)} disabled={index === draft.fields.length - 1} aria-label="Mover para baixo"><ChevronDown className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, itemIndex) => itemIndex !== index).map((item, position) => ({ ...item, position })) })} aria-label="Excluir"><Trash2 className="size-4" /></Button></div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-6"><div className="flex items-center gap-2"><Switch checked={field.required} onCheckedChange={(required) => updateField(index, { required })} id={`required-${index}`} /><Label htmlFor={`required-${index}`}>Obrigatório</Label></div><div className="flex items-center gap-2"><Switch checked={field.active !== false} onCheckedChange={(active) => updateField(index, { active })} id={`active-${index}`} /><Label htmlFor={`active-${index}`}>Ativa no formulário</Label></div>{field.active === false ? <span className="text-xs text-muted-foreground">Não aparece para o lead.</span> : null}</div>
              {(field.kind === "single_choice" || field.kind === "multi_choice") ? <div className="mt-4 space-y-2 border-t border-border pt-4">{field.options.map((option, optionIndex) => <div key={optionIndex} className="grid gap-2 sm:grid-cols-[1fr_110px_36px]"><Input value={option.label} onChange={(event) => updateField(index, { options: field.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, label: event.target.value, value: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `opcao_${optionIndex + 1}` } : item) })} /><Input type="number" value={option.score} onChange={(event) => updateField(index, { options: field.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, score: Number(event.target.value) } : item) })} aria-label="Pontos" /><Button variant="ghost" size="icon" onClick={() => updateField(index, { options: field.options.filter((_, itemIndex) => itemIndex !== optionIndex).map((item, position) => ({ ...item, position })) })}><Trash2 className="size-4" /></Button></div>)}<Button variant="ghost" size="sm" onClick={() => updateField(index, { options: [...field.options, { value: `opcao_${field.options.length + 1}`, label: `Opção ${field.options.length + 1}`, score: 0, position: field.options.length }] })}><Plus className="size-4" /> Opção</Button></div> : null}
            </div>
          ))}
            </TabsContent>

            <TabsContent value="score" className="mt-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold">Pontuação das perguntas</h2>
                <p className="text-sm text-muted-foreground">A pontuação e as faixas de classificação são configuradas somente aqui e valem apenas para este formulário. Intervalo possível: {possibleScoreRange.minPossible} a {possibleScoreRange.maxPossible} pontos.</p>
                {coverageErrors.length > 0 ? <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert"><p className="font-semibold">A publicação será bloqueada até ajustar as faixas:</p><ul className="mt-1 list-disc space-y-1 pl-5">{coverageErrors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
              </div>
              {draft.fields.filter((field) => field.options.length > 0).length === 0 ? <p className="text-sm text-muted-foreground">Crie perguntas de seleção na aba Campos para distribuir pontos.</p> : null}
              {draft.fields.map((field, index) => field.options.length === 0 ? null : (
                <div key={field.key} className="card-surface space-y-2 p-5">
                  <div className="flex items-center justify-between gap-3"><p className="font-semibold">{field.label}</p>{field.active === false ? <span className="text-xs text-muted-foreground">Inativa — não pontua</span> : null}</div>
                  {field.options.map((option, optionIndex) => <div key={optionIndex} className="grid items-center gap-2 sm:grid-cols-[1fr_110px]"><span className="text-sm text-muted-foreground">{option.label}</span><Input type="number" value={option.score} aria-label={`Pontos de ${option.label}`} onChange={(event) => updateField(index, { options: field.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, score: Number(event.target.value) } : item) })} /></div>)}
                </div>
              ))}
              <div><h2 className="text-lg font-bold">Faixas de classificação</h2><p className="text-sm text-muted-foreground">As faixas não podem se sobrepor nem deixar lacunas.</p></div>{draft.ranges.map((range, index) => <div key={range.slug} className="grid gap-3 border-b border-border bg-background p-4 sm:grid-cols-[1fr_120px_120px_auto]"><Input value={range.name} onChange={(event) => setDraft({ ...draft, ranges: draft.ranges.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /><Input type="number" value={range.minScore} onChange={(event) => setDraft({ ...draft, ranges: draft.ranges.map((item, itemIndex) => itemIndex === index ? { ...item, minScore: Number(event.target.value) } : item) })} /><Input type="number" value={range.maxScore} onChange={(event) => setDraft({ ...draft, ranges: draft.ranges.map((item, itemIndex) => itemIndex === index ? { ...item, maxScore: Number(event.target.value) } : item) })} /><Button variant="ghost" size="icon" onClick={() => setDraft({ ...draft, ranges: draft.ranges.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="size-4" /></Button></div>)}<Button variant="outline" onClick={() => setDraft({ ...draft, ranges: [...draft.ranges, { name: "Nova faixa", slug: `faixa_${draft.ranges.length + 1}`, minScore: (draft.ranges.at(-1)?.maxScore ?? -1) + 1, maxScore: (draft.ranges.at(-1)?.maxScore ?? -1) + 20, visualToken: "neutral", position: draft.ranges.length }] })}><Plus className="size-4" /> Nova faixa</Button></TabsContent>

            <TabsContent value="logic" className="mt-6"><RulesEditor draft={draft} formId={formId} onChange={(rules) => setDraft({ ...draft, rules })} /></TabsContent>
            <TabsContent value="destination" className="mt-6">
              <DestinationPanel
                pipelines={query.data?.pipelines ?? []}
                value={destination}
                formName={draft.name}
                onChange={setDestination}
              />
              <div className="mt-8 space-y-3 sm:max-w-xl">
                <div>
                  <h2 className="text-lg font-bold">Rastreamento</h2>
                  <p className="text-sm text-muted-foreground">Opcional. Use o pixel da sua empresa para medir as conversões das campanhas.</p>
                </div>
                <div>
                  <Label htmlFor="meta-pixel">ID do Meta Pixel (Facebook)</Label>
                  <Input
                    id="meta-pixel"
                    className="mt-2"
                    inputMode="numeric"
                    placeholder="Ex.: 123456789012345"
                    value={draft.appearance.copy["metaPixelId"] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        appearance: { ...draft.appearance, copy: { ...draft.appearance.copy, metaPixelId: e.target.value.replace(/\D/g, "") } },
                      })
                    }
                  />
                  <p className="mt-2 text-xs text-muted-foreground">O formulário registra PageView ao abrir e Lead ao enviar.</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="appearance" className="mt-6 space-y-5"><div><h2 className="text-lg font-bold">Identidade visual</h2><p className="text-sm text-muted-foreground">Cores e formato pertencem somente a este formulário.</p></div><div className="grid gap-5 sm:grid-cols-2"><div><Label>Modelo</Label><Select value={draft.appearance.presetKey} onValueChange={(value) => setDraft({ ...draft, appearance: { ...draft.appearance, presetKey: value as FormDraft["appearance"]["presetKey"] } })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="focus">Foco</SelectItem><SelectItem value="split">Dividido</SelectItem><SelectItem value="immersive">Imersivo</SelectItem></SelectContent></Select></div>{([['primary','Cor principal'],['secondary','Cor secundária'],['background','Fundo'],['text','Texto']] as const).map(([key,label]) => <div key={key}><Label>{label}</Label><div className="mt-2 flex gap-2"><Input type="color" className="w-14 p-1" value={draft.appearance.tokens[key]} onChange={(event) => setDraft({ ...draft, appearance: { ...draft.appearance, tokens: { ...draft.appearance.tokens, [key]: event.target.value } } })} /><Input value={draft.appearance.tokens[key]} onChange={(event) => setDraft({ ...draft, appearance: { ...draft.appearance, tokens: { ...draft.appearance.tokens, [key]: event.target.value } } })} /></div></div>)}</div></TabsContent>
             <TabsContent value="completion" className="mt-6 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Telas finais</h2><p className="text-sm text-muted-foreground">Defina as mensagens e os botões apresentados após o envio.</p></div><Button type="button" size="sm" onClick={() => { let number = draft.completionPages.length + 1; while (draft.completionPages.some((page) => page.key === `tela_final_${number}`)) number++; setDraft({ ...draft, completionPages: [...draft.completionPages, { key: `tela_final_${number}`, title: "Nova tela final", description: "", buttonLabel: null, actionType: "none", actionTarget: null }] }); }}><Plus className="size-4" /> Adicionar tela</Button></div>{draft.completionPages.map((page, index) => {
              const updatePage = (patch: Partial<FormDraft["completionPages"][number]>) => setDraft({ ...draft, completionPages: draft.completionPages.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
              return (<div key={page.key} className="card-surface space-y-3 p-5">
                 <div className="flex items-center justify-between gap-3"><p className="font-semibold">{page.title || `Tela ${index + 1}`}</p><Button type="button" variant="ghost" size="icon" aria-label={`Excluir tela ${page.title || index + 1}`} title={draft.completionPages.length === 1 ? "Mantenha ao menos uma tela final" : "Excluir tela"} disabled={draft.completionPages.length === 1} onClick={() => { const used = draft.rules.some((rule) => rule.actions.some((action) => (action.type === "select_completion_page" && action.value === page.key) || (action.type === "terminate" && action.completionPageKey === page.key))); if (used) { toast.error("Esta tela é usada em uma regra. Altere a regra antes de excluir."); return; } setDraft({ ...draft, completionPages: draft.completionPages.filter((_, itemIndex) => itemIndex !== index) }); }}><Trash2 className="size-4" /></Button></div>
                <div><Label>Título</Label><Input className="mt-2" value={page.title} onChange={(event) => updatePage({ title: event.target.value })} /></div>
                <div><Label>Mensagem</Label><Textarea className="mt-2" value={page.description} onChange={(event) => updatePage({ description: event.target.value })} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Texto do botão</Label><Input className="mt-2" placeholder="Ex.: Acessar o site" value={page.buttonLabel ?? ""} onChange={(event) => updatePage({ buttonLabel: event.target.value.trim().length ? event.target.value : null })} /></div>
                  <div><Label>Link de redirecionamento</Label><Input className="mt-2" placeholder="https://suaempresa.com.br" value={page.actionTarget ?? ""} onChange={(event) => { const value = event.target.value.trim(); updatePage({ actionTarget: value.length ? event.target.value : null, actionType: value.length ? "url" : "none" }); }} /></div>
                </div>
                <p className="text-xs text-muted-foreground">O botão só aparece para o lead quando houver um link preenchido.</p>
              </div>);
            })}</TabsContent>
            <TabsContent value="settings" className="mt-6"><div className="grid gap-5 bg-background p-5 sm:max-w-xl"><div><Label>Nome interno</Label><Input className="mt-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div><div><Label>Endereço público</Label><div className="mt-2 flex items-center"><span className="rounded-l-md border border-r-0 border-input bg-secondary px-3 py-2 text-sm text-muted-foreground">/f/…-</span><Input className="rounded-l-none" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/--+/g, "-") })} /></div></div></div></TabsContent>
          </div>

          <aside className="mt-6 lg:sticky lg:top-6">
            <p className="mb-3 text-sm font-semibold">Prévia mobile em tempo real</p>
            <FormMobilePreview draft={draft} />
          </aside>
        </div>
      </Tabs>
    </div>
  );
}
type PipelineOption = { id: string; name: string; stages: Array<{ id: string; name: string; color: string }> };

/** Para onde vão os leads deste formulário dentro do CRM. */
function DestinationPanel({
  pipelines,
  value,
  formName,
  onChange,
}: {
  pipelines: PipelineOption[];
  value: Destination;
  formName: string;
  onChange: (v: Destination) => void;
}) {
  const pipeline = pipelines.find((p) => p.id === value.pipelineId) ?? null;
  const stages = pipeline?.stages ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Destino no CRM</h2>
        <p className="text-sm text-muted-foreground">
          Cada envio cria um lead neste pipeline, já com a pontuação e a classificação no card. Não precisa de webhook nem token.
        </p>
      </div>
      {pipelines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Esta empresa ainda não tem pipeline. Crie um em Pipeline e volte aqui.
        </p>
      ) : (
        <div className="grid gap-4 sm:max-w-xl">
          <div>
            <Label>Pipeline</Label>
            <Select
              value={value.pipelineId ?? ""}
              onValueChange={(id) => {
                const next = pipelines.find((p) => p.id === id);
                onChange({ ...value, pipelineId: id, stageId: next?.stages[0]?.id ?? null });
              }}
            >
              <SelectTrigger className="mt-2"><SelectValue placeholder="Escolha o pipeline" /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Etapa de entrada</Label>
            <Select
              value={value.stageId ?? ""}
              onValueChange={(id) => onChange({ ...value, stageId: id })}
              disabled={!pipeline}
            >
              <SelectTrigger className="mt-2"><SelectValue placeholder="Primeira etapa do pipeline" /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">Etapas de ganho e perda não aparecem aqui.</p>
          </div>
          <div>
            <Label htmlFor="default-source">Origem do lead</Label>
            <Input
              id="default-source"
              className="mt-2"
              value={value.defaultSource ?? ""}
              placeholder={`Formulário — ${formName}`}
              onChange={(e) => onChange({ ...value, defaultSource: e.target.value || null })}
            />
            <p className="mt-2 text-xs text-muted-foreground">Aparece no card e nos relatórios. Em branco, usa o nome do formulário.</p>
          </div>
        </div>
      )}
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-semibold">O que chega no lead</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Nome, e-mail, telefone, cidade e estado (dos campos do tipo correspondente)</li>
          <li>Pontuação e classificação por faixa, em destaque no card</li>
          <li>Todas as respostas na ficha do lead, e UTMs da campanha</li>
        </ul>
      </div>
    </div>
  );
}
