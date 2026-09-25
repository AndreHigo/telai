export function createIceConfiguration({ randomUUID, createHmac }) {
  return async function iceConfiguration() {
    if (process.env.ICE_SERVERS_JSON) {
      try {
        const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
        if (Array.isArray(parsed?.iceServers) && parsed.iceServers.length) return parsed;
      } catch { /* usa a configuração padrão */ }
    }

    const stunUrls = [...new Set([
      ...String(process.env.STUN_URL || "stun:stun.cloudflare.com:3478").split(/[\s,]+/),
      "stun:stun.l.google.com:19302",
    ].map((url) => url.trim()).filter((url) => /^stun:/i.test(url)))];
    const servers = stunUrls.map((urls) => ({ urls }));

    // Coturn com --use-auth-secret usa credenciais temporárias: o segredo
    // permanece apenas no servidor e nunca é entregue ao navegador.
    // Aceite vírgula e espaços para não transformar uma configuração antiga
    // "turn:a turn:b" em uma única URL inválida entregue ao WebRTC.
    const turnUrls = String(process.env.TURN_URL || "").split(/[\s,]+/)
      .map((url) => url.trim())
      .filter((url) => /^turns?:/i.test(url) && !/example\.com/i.test(url));
    const turnSecret = String(process.env.TURN_SECRET || "").trim();
    if (turnUrls.length && turnSecret) {
      const username = `${Math.floor(Date.now() / 1000) + 3600}:mirante-${randomUUID()}`;
      const credential = createHmac("sha1", turnSecret).update(username).digest("base64");
      servers.push({ urls: turnUrls, username, credential });
    }

    return { iceServers: servers };
  };
}
