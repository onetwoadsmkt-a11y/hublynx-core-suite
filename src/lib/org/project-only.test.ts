import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isProjectOnlyAccess, projectOnlyAllows } from "./modules-map";
import { taskPath } from "../tasks/task-notify.server";

describe("equipe de projeto vê só Projetos", () => {
  it("identifica quem é só da equipe de projeto", () => {
    assert.equal(isProjectOnlyAccess({ isSuperAdmin: false, isOrgAdmin: false, modules: ["projects", "tasks"] }), true);
    assert.equal(isProjectOnlyAccess({ isSuperAdmin: false, isOrgAdmin: false, modules: ["projects", "crm"] }), false);
    assert.equal(isProjectOnlyAccess({ isSuperAdmin: false, isOrgAdmin: true, modules: ["projects"] }), false);
    assert.equal(isProjectOnlyAccess({ isSuperAdmin: false, isOrgAdmin: false, modules: ["crm"] }), false);
  });
  it("libera só Projetos e Minhas tarefas", () => {
    assert.equal(projectOnlyAllows("/projetos"), true);
    assert.equal(projectOnlyAllows("/projetos/abc"), true);
    assert.equal(projectOnlyAllows("/minhas-tarefas"), true);
    assert.equal(projectOnlyAllows("/dashboard"), false);
    assert.equal(projectOnlyAllows("/clientes"), false);
    assert.equal(projectOnlyAllows("/projetosx"), false);
  });
  it("link do aviso leva à tarefa no projeto ou na agenda", () => {
    assert.equal(taskPath({ id: "t1", project_id: "p1" }), "/projetos/p1?aba=etapas&tarefa=t1");
    assert.equal(taskPath({ id: "t1", project_id: null }), "/tarefas?task=t1");
  });
});
