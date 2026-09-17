import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWelcomeGuide, WELCOME_KEY } from "../src/welcome.mjs";

function fixture(saved = new Map(), blocked = false) {
  const document = { activeElement: null };
  class Element extends EventTarget {
    isConnected = true;
    open = false;
    focus() {
      document.activeElement = this;
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    }
    click() {
      this.dispatchEvent(new Event("click"));
    }
  }
  const ids = [
    "welcome-guide",
    "open-guide",
    "close-guide",
    "welcome-go",
    "next",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  document.getElementById = (id) => elements[id];
  const guide = createWelcomeGuide({
    document,
    storage: () => {
      if (blocked) throw Error("Storage denied");
      return {
        getItem: (key) => saved.get(key),
        setItem: (key, value) => saved.set(key, value),
      };
    },
    nextControl: () => elements.next,
  });
  return {
    guide,
    document,
    elements,
    saved,
    dialog: elements["welcome-guide"],
  };
}

test("first visit opens modal, dismissal acknowledges and focuses the existing next action", () => {
  const f = fixture();
  f.guide.start();
  assert.equal(f.dialog.open, true);
  assert.equal(f.document.activeElement, f.elements["close-guide"]);
  f.elements["welcome-go"].click();
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement, f.elements.next);
  assert.deepEqual([...f.saved], [[WELCOME_KEY, "acknowledged"]]);
});

test("reload preserves acknowledgement; removing only the guide key shows it again", () => {
  const saved = new Map([["unrelated", "preserved"]]);
  const first = fixture(saved);
  first.guide.start();
  first.elements["close-guide"].click();
  const reloaded = fixture(saved);
  reloaded.guide.start();
  assert.equal(reloaded.dialog.open, false);
  saved.delete(WELCOME_KEY);
  const cleared = fixture(saved);
  cleared.guide.start();
  assert.equal(cleared.dialog.open, true);
  assert.equal(saved.get("unrelated"), "preserved");
});

test("reopening works after acknowledgement and returns focus to its trigger", () => {
  const f = fixture(new Map([[WELCOME_KEY, "acknowledged"]]));
  f.guide.start();
  f.elements["open-guide"].focus();
  f.elements["open-guide"].click();
  assert.equal(f.dialog.open, true);
  f.elements["close-guide"].click();
  assert.equal(f.document.activeElement, f.elements["open-guide"]);
});

test("Tab wraps forward and backward inside the two-control guide", () => {
  const f = fixture();
  f.guide.start();
  function tab(shiftKey) {
    const e = new Event("keydown", { cancelable: true });
    Object.defineProperties(e, {
      key: { value: "Tab" },
      shiftKey: { value: shiftKey },
    });
    f.dialog.dispatchEvent(e);
    return e;
  }
  f.elements["welcome-go"].focus();
  assert.equal(tab(false).defaultPrevented, true);
  assert.equal(f.document.activeElement, f.elements["close-guide"]);
  assert.equal(tab(true).defaultPrevented, true);
  assert.equal(f.document.activeElement, f.elements["welcome-go"]);
  f.elements["close-guide"].focus();
  assert.equal(tab(false).defaultPrevented, false);
});

test("native dialog close (including Escape) acknowledges without cancelling its native event", () => {
  const f = fixture();
  f.guide.start();
  const cancel = new Event("cancel", { cancelable: true });
  f.dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, false);
  f.dialog.close();
  assert.equal(f.saved.get(WELCOME_KEY), "acknowledged");
  assert.equal(f.document.activeElement, f.elements.next);
});

test("unavailable storage does not prevent dismissal or future use", () => {
  const f = fixture(new Map(), true);
  f.guide.start();
  f.elements["welcome-go"].click();
  assert.equal(f.dialog.open, false);
  assert.equal(f.saved.size, 0);
  f.guide.start();
  assert.equal(f.dialog.open, true);
});

test("tampered acknowledgement is not rendered and cannot supply modal content", () => {
  const saved = new Map([[WELCOME_KEY, "<img src=x onerror=alert(1)>"]]);
  const f = fixture(saved);
  f.guide.start();
  assert.equal(f.dialog.open, true);
  f.elements["welcome-go"].click();
  assert.equal(saved.get(WELCOME_KEY), "acknowledged");
});

test("guide uses fixed accessible four-step markup, no inline scripts or sensitive storage", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../src/welcome.mjs", import.meta.url),
    "utf8",
  );
  const dialog = html.match(
    /<dialog\s+id="welcome-guide"[\s\S]*?<\/dialog>/,
  )[0];
  assert.match(dialog, /aria-labelledby="welcome-title"/);
  assert.match(dialog, /aria-describedby="welcome-intro"/);
  assert.match(dialog, />Helloooooooo<\/h2>/);
  assert.equal((dialog.match(/<li>/g) || []).length, 4);
  assert.match(dialog, /Do not send funds/);
  assert.doesNotMatch(dialog, /<script|\son\w+=|<iframe|<form|<input/i);
  assert.doesNotMatch(
    source,
    /innerHTML|eval\(|fetch\(|indexedDB|custody\.|account\.|\.clear\(/,
  );
  assert.equal((source.match(/setItem\(/g) || []).length, 1);
});
