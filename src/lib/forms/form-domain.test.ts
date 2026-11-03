import { test } from "node:test";
import assert from "node:assert/strict";
import { isFormDomainPath, isFormHost, slugPart } from "./form-domain";

test("form domain: só formulários e arquivos", () => {
  assert.equal(isFormHost("form.hublynx.com.br"), true);
  assert.equal(isFormHost("core.hublynx.com.br"), false);
  assert.equal(isFormDomainPath("/f/abc123-franquias"), true);
  assert.equal(isFormDomainPath("/api/public/form-assets/x/logo.svg"), true);
  assert.equal(isFormDomainPath("/"), false);
  assert.equal(isFormDomainPath("/admin"), false);
  assert.equal(slugPart("k3j9x-franquias"), "franquias");
  assert.equal(slugPart("k3j9x-formulario-fisp-2026"), "formulario-fisp-2026");
  assert.equal(slugPart("k3j9x"), null);
});
