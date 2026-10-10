import { describe, expect, test } from "bun:test";
import { effectiveModules, subscriberSchema, withModuleDependencies } from "./access-rules";

describe("permissões de novas contas", () => {
  test("empresa suspensa não libera módulos nem para administrador da empresa", () => {
    expect(effectiveModules("suspended", ["crm"], "org_admin", ["crm"])).toEqual([]);
  });
  test("membro comum recebe apenas módulos contratados e permitidos", () => {
    expect(effectiveModules("active", ["crm", "tasks"], "user", ["crm", "projects"])).toEqual(["crm"]);
  });
  test("conta sem permissões individuais não recebe módulos automaticamente", () => {
    expect(effectiveModules("active", ["crm"], "user", [])).toEqual([]);
  });
  test("projetos inclui tarefas como dependência", () => {
    expect(withModuleDependencies(["projects"])).toEqual(["projects", "tasks"]);
  });
  test("cadastro requer exatamente uma empresa de destino e não aceita papel global", () => {
    const input = { email: "new@example.com", password: "abcdef", accountName: "Nova conta", plan: "comercial", priceMonthly: 0, capabilities: [], role: "user", moduleCodes: ["crm"] };
    expect(subscriberSchema.safeParse(input).success).toBe(false);
    expect(subscriberSchema.safeParse({ ...input, organizationName: "Empresa" }).success).toBe(true);
    expect(subscriberSchema.safeParse({ ...input, organizationName: "Empresa", role: "super_admin" }).success).toBe(false);
  });
});