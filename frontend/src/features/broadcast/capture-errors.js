export function formatBroadcastCaptureError(error, sourceType = "screen") {
  const errorName = String(error?.name || "");
  const errorMessage = String(error?.message || "").toLowerCase();
  if (errorName === "NotAllowedError" || errorName === "AbortError" || errorMessage.includes("permission denied")) {
    return sourceType === "camera"
      ? "O acesso à câmera foi recusado ou cancelado. Permita a câmera no navegador e tente novamente."
      : "A seleção da tela foi recusada ou cancelada. Escolha uma janela ou tela e tente novamente.";
  }
  if (errorName === "NotFoundError") {
    return sourceType === "camera"
      ? "Nenhuma câmera disponível foi encontrada. Conecte uma câmera e tente novamente."
      : "Nenhuma tela ou janela disponível foi encontrada. Tente novamente.";
  }
  if (errorName === "NotReadableError") {
    return "O sistema não conseguiu acessar a fonte escolhida. Feche outro aplicativo que esteja usando-a e tente novamente.";
  }
  return error?.message || "Não foi possível iniciar a transmissão. Tente novamente.";
}

export function formatBroadcastMissingAudio({ isDesktop = false, displaySurface = "", selectionKind = "" } = {}) {
  if (isDesktop) {
    return "O Windows não entregou áudio para esta captura. Verifique se o aplicativo tem volume e tente escolher a tela ou janela novamente.";
  }
  return displaySurface === "screen" || selectionKind === "screen"
    ? "O navegador entregou a imagem, mas não o áudio. Ao escolher a tela inteira, marque “Compartilhar áudio do sistema” no seletor do navegador e tente novamente. O filtro Telai/Discord é exclusivo do app Windows."
    : "O navegador entregou a imagem, mas não o áudio. Ao escolher a janela, marque “Compartilhar áudio” no seletor do navegador e tente novamente.";
}
