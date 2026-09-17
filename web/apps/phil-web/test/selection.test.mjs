import test from "node:test";
import assert from "node:assert/strict";
import { createSelection } from "../src/selection.mjs";
function fixture(saved) {
  let draws = 0;
  let record = saved;
  const frames = [];
  const selection = createSelection({
    store: {
      get: async () => record,
      put: async (_k, v) => (record = structuredClone(v)),
    },
    draw: () => ({ recipeId: String(++draws), nameId: String(draws + 100) }),
    onFrame: async (v, i, n) => frames.push({ v, i, n }),
  });
  return { selection, frames, record: () => record, draws: () => draws };
}
test("session count counts generation only; loading, keeping, releasing and undo never add rolls", async () => {
  const f = fixture();
  await f.selection.load();
  assert.equal(f.selection.rolls, 0);
  await f.selection.roll();
  await f.selection.roll();
  assert.equal(f.selection.rolls, 2);
  assert.equal((await f.selection.undo()).recipeId, "1");
  assert.equal(f.selection.rolls, 2);
  assert.equal(f.selection.current().kept, true);
  await assert.rejects(f.selection.roll(), /KEPT/);
  await f.selection.release();
  await f.selection.keep();
  const reopened = fixture(f.record());
  await reopened.selection.load();
  assert.equal(reopened.selection.rolls, 0);
  assert.equal(reopened.selection.current().recipeId, "1");
});
for (const n of [10, 100])
  test(
    "canonical " +
      n +
      " batch generates exactly that many art/name pairs and retains only final selection",
    async () => {
      const f = fixture();
      await f.selection.roll();
      await f.selection.roll(n);
      assert.equal(f.draws(), n + 1);
      assert.equal(f.selection.rolls, n + 1);
      assert.equal(f.frames.length, n);
      assert.equal(f.record().recipeId, String(n + 1));
      assert.equal(f.record().nameId, String(n + 101));
      assert.equal(f.record().previous, null);
      await assert.rejects(f.selection.undo(), /SELECTION_REQUIRED/);
    },
  );
test("legacy Web selection migrates without generating artwork; invalid batch counts draw nothing", async () => {
  const f = fixture({ recipeId: "17", nameId: "9" });
  await f.selection.load();
  assert.equal(f.selection.current().recipeId, "17");
  assert.equal(f.selection.rolls, 0);
  for (const n of [0, 2, 11, "10", 101])
    await assert.rejects(f.selection.roll(n), /COUNT/);
  assert.equal(f.draws(), 0);
});

test("interrupted batch preserves saved selection and counts only generated frames", async () => {
  let saved = { recipeId: "7", nameId: "8" },
    draws = 0;
  const selection = createSelection({
    store: {
      get: async () => saved,
      put: async (_k, v) => {
        saved = v;
      },
    },
    draw: () => ({ recipeId: String(++draws), nameId: "1" }),
    onFrame: async (_v, i) => {
      await assert.rejects(selection.roll(), /WEB_BUSY/);
      if (i === 3) selection.cancel();
    },
  });
  await selection.load();
  await assert.rejects(selection.roll(10), /SELECTION_CANCELLED/);
  assert.equal(selection.rolls, 3);
  assert.equal(selection.current().recipeId, "7");
  assert.equal(saved.recipeId, "7");
});
