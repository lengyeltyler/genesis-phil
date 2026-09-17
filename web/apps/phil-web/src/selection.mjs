// Public artwork selection only. Uses the canonical generator and never enters an authorization.
import generator from "../../../genesis/preview/random.cjs";
import names from "../../../genesis/production/names.cjs";
export function createSelection({
  store,
  onRoll = () => {},
  draw = () => ({
    ...generator.drawRecipe(),
    nameId: String(names.randomNameId()),
  }),
  onFrame = async () => {},
}) {
  let current = null,
    previous = null,
    kept = false,
    rolls = 0,
    generation = 0,
    busy = false;
  const choice = (value) =>
    value
      ? { recipeId: String(value.recipeId), nameId: String(value.nameId) }
      : null;
  const view = () =>
    current && { ...current, kept, canUndo: !!previous && !kept };
  async function persist(next, prior, keep) {
    await store.put("selection", {
      ...choice(next),
      previous: choice(prior),
      kept: keep,
    });
    current = choice(next);
    previous = choice(prior);
    kept = keep;
    return view();
  }
  const generate = () => {
    const value = choice(draw());
    rolls++;
    onRoll(rolls);
    return value;
  };
  return {
    async load() {
      const value = await store.get("selection");
      if (value) {
        current = choice(value);
        previous = choice(value.previous);
        kept = value.kept === true;
      }
      return view();
    },
    current: view,
    cancel() {
      generation++;
    },
    get rolls() {
      return rolls;
    },
    async roll(count = 1) {
      if (![1, 10, 100].includes(count)) throw Error("WEB_SELECTION_COUNT");
      if (kept) throw Error("WEB_SELECTION_KEPT");
      if (busy) throw Error("WEB_BUSY");
      busy = true;
      const started = generation;
      try {
        let value;
        for (let i = 1; i <= count; i++) {
          if (started !== generation) throw Error("WEB_SELECTION_CANCELLED");
          value = generate();
          if (count > 1) await onFrame(value, i, count);
        }
        if (started !== generation) throw Error("WEB_SELECTION_CANCELLED");
        return await persist(value, count === 1 ? current : null, false);
      } finally {
        busy = false;
      }
    },
    keep: () => persist(current, previous, true),
    release: () => persist(current, previous, false),
    async undo() {
      if (kept || !previous) throw Error("WEB_SELECTION_REQUIRED");
      return persist(previous, current, true);
    },
  };
}
