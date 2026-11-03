import { test } from "node:test";
import assert from "node:assert/strict";
import { bellDuplicates, dueRecipients } from "./project-mail.server";

const now = new Date("2026-10-30T20:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

test("movimentação espera 15 min, mensagem espera 5 min", () => {
  const rows = [
    { user_id: "a", is_message: false, created_at: ago(10) }, // ainda não
    { user_id: "b", is_message: false, created_at: ago(16) }, // já
    { user_id: "c", is_message: true, created_at: ago(6) }, // mensagem: já
    { user_id: "d", is_message: true, created_at: ago(2) }, // ainda não
    { user_id: "d", is_message: false, created_at: ago(14) }, // ainda não
  ];
  assert.deepEqual(dueRecipients(rows, now).sort(), ["b", "c"]);
});

test("um aviso antigo leva junto os novos da mesma pessoa", () => {
  const rows = [
    { user_id: "a", is_message: false, created_at: ago(20) },
    { user_id: "a", is_message: false, created_at: ago(1) },
  ];
  assert.deepEqual(dueRecipients(rows, now), ["a"]);
});

test("bellDuplicates: descarta o aviso do sino que repete um aviso do projeto", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 10, 3, 14, 0, s)).toISOString();
  {
    const rows = [
      { id: "a", user_id: "u", project_id: "p", kind: "message", created_at: at(0) },
      { id: "b", user_id: "u", project_id: "p", kind: "bell", created_at: at(1) },
      { id: "c", user_id: "u", project_id: null, kind: "bell", created_at: at(2) },
      { id: "d", user_id: "v", project_id: "p", kind: "bell", created_at: at(2) },
    ];
    assert.deepEqual(bellDuplicates(rows as any), ["b"]);
  }
});
