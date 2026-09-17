// Presentation-only acknowledgement. Never read or write account/custody state.
export const WELCOME_KEY = "phil-web:welcome:v1";

export function createWelcomeGuide({ document, storage, nextControl }) {
  const dialog = document.getElementById("welcome-guide");
  const reopen = document.getElementById("open-guide");
  const close = document.getElementById("close-guide");
  const go = document.getElementById("welcome-go");
  let returnFocus;
  const acknowledged = () => {
    try {
      return storage()?.getItem(WELCOME_KEY) === "acknowledged";
    } catch {
      return false;
    }
  };
  function open(fromControl = false) {
    if (dialog.open) return;
    returnFocus = fromControl ? document.activeElement : null;
    dialog.showModal();
    // Start at the top so small screens announce the guide before scrolling.
    close.focus();
  }
  function dismiss() {
    dialog.close();
  }
  reopen.addEventListener("click", () => open(true));
  close.addEventListener("click", dismiss);
  go.addEventListener("click", dismiss);
  dialog.addEventListener("close", () => {
    try {
      storage()?.setItem(WELCOME_KEY, "acknowledged");
    } catch {
      // Blocked storage may show the guide again; setup remains usable.
    }
    const target = returnFocus?.isConnected ? returnFocus : nextControl();
    target?.focus();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    // The guide has exactly two controls; wrap both directions explicitly.
    if (event.shiftKey && document.activeElement === close) {
      event.preventDefault();
      go.focus();
    } else if (!event.shiftKey && document.activeElement === go) {
      event.preventDefault();
      close.focus();
    }
  });
  return {
    start: () => {
      if (!acknowledged()) open();
    },
  };
}
