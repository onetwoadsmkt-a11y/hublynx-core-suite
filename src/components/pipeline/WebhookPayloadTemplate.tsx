import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

const TEMPLATE = `{
  "name": "{{nome}}",
  "email": "{{email}}",
  "phone": "{{telefone}}",
  "company": "{{empresa}}",
  "city": "{{cidade}}",
  "state": "{{estado}}",
  "value": "{{valor}}",
  "source": "{{origem}}",
  "utm_source": "{{utm_source}}",
  "utm_medium": "{{utm_medium}}",
  "utm_campaign": "{{utm_campaign}}",
  "utm_term": "{{utm_term}}",
  "utm_content": "{{utm_content}}",
  "gclid": "{{gclid}}",
  "fbclid": "{{fbclid}}",
  "landing_url": "{{url_da_pagina}}",
  "referrer": "{{referrer}}",
  "message": "{{mensagem}}"
}`;

/** Modelo de corpo JSON pronto para colar no módulo HTTP do Make. */
export function WebhookPayloadTemplate() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Modelo JSON para colar na automação</p>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar JSON"}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        No Make: módulo <strong>HTTP → Make a request</strong>, método <strong>POST</strong>, Body type{" "}
        <strong>Raw</strong>, Content type <strong>application/json</strong>. Cole o modelo abaixo e
        substitua os valores entre chaves pelos campos do formulário.
      </p>
      <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
        {TEMPLATE}
      </pre>
    </div>
  );
}
