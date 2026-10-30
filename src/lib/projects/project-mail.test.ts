import { test } from "node:test";
import assert from "node:assert/strict";
import { dueRecipients } from "./project-mail.server";

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
