import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import type { PublicForm } from "@/lib/forms/public.functions";

type FormData = NonNullable<PublicForm>;
type Question = FormData["questions"][number];
type Answer = string | string[] | boolean | null;

const TEXT_TYPES = ["short_text", "long_text", "email", "phone", "number", "date"];

function isAnswered(q: Question, a: Answer): boolean {
  if (q.question_type === "consent") return a === true;
  if (Array.isArray(a)) return a.length > 0;
  if (typeof a === "string") return a.trim().length > 0;
  return false;
}

function validate(q: Question, a: Answer): string | null {
  if (!isAnswered(q, a)) {
    if (!q.required) return null;
    return q.question_type === "consent"
      ? "É necessário aceitar para continuar."
      : "Esta resposta é obrigatória.";
  }
  if (q.question_type === "email" && typeof a === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))
    return "Informe um e-mail válido.";
  if (q.question_type === "phone" && typeof a === "string" && a.replace(/\D/g, "").length < 10)
    return "Informe um telefone com DDD.";
  return null;
}

export function FormRenderer({
  form,
  preview = false,
  onSubmit,
}: {
  form: FormData;
  preview?: boolean;
  onSubmit?: (answers: Record<string, Answer>) => void | Promise<void>;
}) {
  const theme = form.theme ?? {};
  const primary = String(theme["primary_color"] ?? "#22C55E");
  const radius = String(theme["border_radius"] ?? "14px");

  const questions = useMemo(
    () => [...form.questions].sort((a, b) => a.order_index - b.order_index),
    [form.questions],
  );

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  if (!questions.length) {
    return (
      <p className="rounded-lg bg-[#F6F8FA] p-4 text-sm text-[#64748B]">
        Este formulário ainda não tem perguntas cadastradas.
      </p>
    );
  }

  const q = questions[Math.min(step, questions.length - 1)]!;
  const value = answers[q.id] ?? (q.question_type === "multi_choice" ? [] : null);
  const progress = Math.round((step / questions.length) * 100);

  const setValue = (v: Answer) => {
    setError(null);
    setAnswers((prev) => ({ ...prev, [q.id]: v }));
  };

  const goNext = async (override?: Answer) => {
    const current = override !== undefined ? override : value;
    const err = validate(q, current);
    if (err) {
      setError(err);
      return;
    }
    if (step + 1 >= questions.length) {
      const payload = { ...answers, [q.id]: current };
      try {
        setSending(true);
        await onSubmit?.(payload);
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível enviar. Tente novamente.");
      } finally {
        setSending(false);
      }
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const restart = () => {
    setAnswers({});
    setStep(0);
    setDone(false);
    setError(null);
    setSending(false);
  };

  if (done) {
    return (
      <div className="py-6 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${primary}20`, color: primary }}
        >
          <Check className="h-6 w-6" />
        </div>
        <p className="mt-3 text-base font-medium">
          {preview ? "Fim da pré-visualização" : (form.success_message ?? "Resposta enviada!")}
        </p>
        <p className="mt-1 text-sm text-[#64748B]">
          {preview
            ? "Nenhuma resposta foi gravada. Você percorreu todas as perguntas."
            : "Obrigado! Em breve entraremos em contato."}
        </p>
        {preview && (
          <button
            type="button"
            onClick={restart}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#E6EAF0] px-4 py-2 text-sm"
          >
            <RotateCcw className="h-4 w-4" /> Recomeçar
          </button>
        )}
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[#E6EAF0] bg-white px-4 py-3 text-sm outline-none focus:border-[#94A3B8]";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF2F6]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(progress, 4)}%`, backgroundColor: primary }}
          />
        </div>
        <span className="font-mono text-[12.2px] tabular-nums text-[#64748B]">
          {step + 1}/{questions.length}
        </span>
      </div>

      <div className="rounded-lg border border-[#E6EAF0] p-5" style={{ borderRadius: radius }}>
        <p className="text-base font-medium">
          {q.question}
          {q.required && <span style={{ color: primary }}> *</span>}
        </p>
        {q.help_text && <p className="mt-1 text-sm text-[#64748B]">{q.help_text}</p>}
        {!q.required && (
          <p className="mt-1 text-[12.2px] text-[#94A3B8]">Opcional</p>
        )}

        <div className="mt-4 grid gap-2">
          {q.question_type === "single_choice" &&
            q.options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setValue(o.label);
                  void goNext(o.label);
                }}
                className="w-full border border-[#E6EAF0] px-4 py-3 text-left text-sm transition-colors hover:bg-[#F6F8FA]"
                style={{
                  borderRadius: radius,
                  ...(value === o.label ? { borderColor: primary, backgroundColor: `${primary}12` } : {}),
                }}
              >
                {o.label}
              </button>
            ))}

          {q.question_type === "multi_choice" &&
            q.options.map((o) => {
              const arr = Array.isArray(value) ? value : [];
              const active = arr.includes(o.label);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() =>
                    setValue(active ? arr.filter((x) => x !== o.label) : [...arr, o.label])
                  }
                  className="flex w-full items-center justify-between border border-[#E6EAF0] px-4 py-3 text-left text-sm transition-colors hover:bg-[#F6F8FA]"
                  style={{
                    borderRadius: radius,
                    ...(active ? { borderColor: primary, backgroundColor: `${primary}12` } : {}),
                  }}
                >
                  {o.label}
                  {active && <Check className="h-4 w-4" style={{ color: primary }} />}
                </button>
              );
            })}

          {q.question_type === "rating" && (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setValue(String(n));
                    void goNext(String(n));
                  }}
                  className="h-12 flex-1 rounded-lg border border-[#E6EAF0] text-sm font-medium transition-colors hover:bg-[#F6F8FA]"
                  style={value === String(n) ? { borderColor: primary, backgroundColor: `${primary}12` } : {}}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {q.question_type === "consent" && (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => setValue(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>Li e concordo.</span>
            </label>
          )}

          {TEXT_TYPES.includes(q.question_type) &&
            (q.question_type === "long_text" ? (
              <textarea
                rows={4}
                className={inputClass}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <input
                className={inputClass}
                type={
                  q.question_type === "email"
                    ? "email"
                    : q.question_type === "number"
                      ? "number"
                      : q.question_type === "date"
                        ? "date"
                        : q.question_type === "phone"
                          ? "tel"
                          : "text"
                }
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void goNext();
                  }
                }}
              />
            ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => {
              setError(null);
              setStep(Math.max(0, step - 1));
            }}
            className="inline-flex items-center gap-1.5 text-sm text-[#64748B] disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: primary }}
          >
            {sending ? "Enviando…" : step + 1 === questions.length ? "Concluir" : "Continuar"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
