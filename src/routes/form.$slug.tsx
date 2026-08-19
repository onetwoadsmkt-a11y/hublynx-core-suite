import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicForm } from "@/lib/forms/public.functions";
import { FormRenderer } from "@/components/forms/FormRenderer";

export const Route = createFileRoute("/form/$slug")({
  loader: async ({ params }) => {
    const form = await getPublicForm({ data: { slug: params.slug } });
    if (!form) throw notFound();
    return form;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.name ? `${loaderData.name}` : "Formulário" },
      {
        name: "description",
        content:
          loaderData?.intro_message ?? "Responda algumas perguntas rápidas para falar com a gente.",
      },
      { property: "og:title", content: loaderData?.name ?? "Formulário" },
      {
        property: "og:description",
        content: loaderData?.intro_message ?? "Leva menos de um minuto para responder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => <FallbackScreen title="Formulário indisponível" />,
  notFoundComponent: () => <FallbackScreen title="Formulário não encontrado" />,
  component: PublicFormPage,
});

function FallbackScreen({ title }: { title: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F8FA] px-5">
      <div className="w-full max-w-md rounded-[14px] border border-[#E6EAF0] bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-[#0F172A]">{title}</h1>
        <p className="mt-2 text-sm text-[#64748B]">
          Verifique o link ou entre em contato com quem o enviou.
        </p>
      </div>
    </main>
  );
}

function PublicFormPage() {
  const form = Route.useLoaderData();
  const theme = form.theme ?? {};
  const primary = String(theme["primary_color"] ?? "#22C55E");
  const background = String(theme["background_color"] ?? "#F6F8FA");
  const text = String(theme["text_color"] ?? "#0F172A");
  const radius = String(theme["border_radius"] ?? "14px");
  const logo = theme["logo_url"] ? String(theme["logo_url"]) : null;

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-5 py-10"
      style={{ background, color: text }}
    >
      <div
        className="w-full max-w-xl border border-[#E6EAF0] bg-white p-6 sm:p-8"
        style={{ borderRadius: radius }}
      >
        {logo && (
          <img src={logo} alt={form.name} className="mb-5 h-10 w-auto object-contain" />
        )}
        <h1 className="text-xl font-semibold sm:text-2xl">{form.name}</h1>
        {form.intro_message && (
          <p className="mt-2 text-sm text-[#64748B]">{form.intro_message}</p>
        )}

        <div className="mt-6">
          <FormRenderer form={form} />
        </div>

        <div
          className="mt-6 h-1 w-16 rounded-full"
          style={{ backgroundColor: primary }}
          aria-hidden
        />
      </div>
    </main>
  );
}
