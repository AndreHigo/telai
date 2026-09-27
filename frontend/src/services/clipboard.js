/**
 * Copies text in both the Electron shell and the browser.
 * The DOM dependencies are injectable so the behavior remains testable
 * without opening a window or changing the application shell.
 */
export async function copyTextValue(value, {
  desktop = globalThis.window?.miranteDesktop,
  clipboard = globalThis.navigator?.clipboard,
  document = globalThis.document,
} = {}) {
  const text = String(value || "");
  if (!text) throw new Error("Clipboard indisponível para conteúdo vazio.");

  if (desktop?.copyText) {
    const result = await desktop.copyText(text);
    if (result?.ok) return true;
  }

  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return true;
  }

  if (!document?.createElement || !document?.body || typeof document.execCommand !== "function") {
    throw new Error("Clipboard indisponível neste contexto.");
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard indisponível neste contexto.");
  } finally {
    input.remove();
  }
  return true;
}
