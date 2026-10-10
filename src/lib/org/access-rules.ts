import { z } from "zod";
import { ORG_MODULE_DEPENDS_ON, type OrgModuleCode } from "./modules-map";

export function organizationIsActive(status: string) {
  return status === "active" || status === "trial";
}

export function effectiveModules(status: string, enabled: string[], role: string, permitted: string[]) {
  if (!organizationIsActive(status)) return [];
  return role === "org_admin" || role === "super_admin"
    ? enabled
    : enabled.filter((code) => permitted.includes(code));
}

export function withModuleDependencies(codes: OrgModuleCode[]): OrgModuleCode[] {
  return [...new Set(codes.flatMap((code) => [code, ...(ORG_MODULE_DEPENDS_ON[code] ?? [])]))];
}

export const subscriberSchema = z.object({
  email: z.string().trim().email().max(160).transform((v) => v.toLowerCase()),
  password: z.string().min(6).max(128),
  accountName: z.string().trim().min(1).max(160),
  plan: z.string().trim().min(1).max(80),
  priceMonthly: z.number().finite().min(0),
  capabilities: z.array(z.enum(["hub", "comercial", "operacao", "configuracoes"])),
  organizationId: z.string().uuid().optional(),
  organizationName: z.string().trim().min(1).max(160).optional(),
  role: z.enum(["org_admin", "user", "guest"]),
  moduleCodes: z.array(z.enum(["crm", "tasks", "projects"])),
}).refine((d) => Boolean(d.organizationId) !== Boolean(d.organizationName), {
  message: "Selecione uma empresa ou informe o nome da nova empresa.",
});

export type NewSubscriberInput = z.infer<typeof subscriberSchema>;