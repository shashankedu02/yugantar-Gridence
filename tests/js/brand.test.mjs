import test from "node:test";
import assert from "node:assert/strict";
import { modelLabel } from "../../dashboard/js/copy.js";

test("only the two known server model IDs get a readable name", () => {
  assert.equal(modelLabel("monsoontwin-localnet-c64-unvalidated"), "LocalNet C64 (unvalidated)");
  assert.equal(modelLabel("monsoontwin-dap-unvalidated"), "DAP (unvalidated)");
  for (const other of ["placeholder-persistence", "monsoontwin-localnet-c64", "x-monsoontwin-dap-unvalidated", "<img src=x>"]) {
    assert.equal(modelLabel(other), other);
  }
  assert.equal(modelLabel(undefined), "unknown");
});
