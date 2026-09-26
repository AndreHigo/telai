export function createBroadcastRelayController({
  getState,
  qualityProfiles,
  reportClientError,
  sendBroadcast,
  setWarning,
}) {
  let recorder = null;
  let sendChain = Promise.resolve();

  function getCurrentState() {
    return getState?.() || {};
  }

  function relayMimeForStream(stream) {
    const candidates = stream?.getAudioTracks?.().length
      ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8"]
      : ["video/webm;codecs=vp8", "video/webm;codecs=vp8,opus"];
    return candidates.find((mimeType) => globalThis.MediaRecorder?.isTypeSupported?.(mimeType)) || "";
  }

  function isRecording() {
    return recorder?.state === "recording";
  }

  async function stop() {
    const current = recorder;
    recorder = null;
    if (!current || current.state === "inactive") return;
    await new Promise((resolve) => {
      current.addEventListener("stop", resolve, { once: true });
      try { current.stop(); } catch { resolve(); }
    });
  }

  async function start() {
    const current = getCurrentState();
    const stream = current.broadcastStream;
    const profile = qualityProfiles?.[current.selectedQuality] || qualityProfiles?.balanced;
    const mimeType = relayMimeForStream(stream);
    if (!stream || !profile) throw new Error("A transmissão relay não está pronta.");
    if (!mimeType) throw new Error("Este navegador não suporta o formato relay WebM VP8.");

    let nextRecorder;
    try {
      nextRecorder = new globalThis.MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: profile.maxBitrate,
        audioBitsPerSecond: 128_000,
      });
    } catch (caught) {
      throw new Error(caught?.message || "Não foi possível iniciar a transmissão relay.");
    }

    recorder = nextRecorder;
    sendChain = Promise.resolve();
    nextRecorder.addEventListener("dataavailable", (event) => {
      const latest = getCurrentState();
      if (!event.data?.size || nextRecorder !== recorder || latest.broadcastSocket?.readyState !== 1) return;
      sendChain = sendChain.then(async () => {
        const state = getCurrentState();
        if (nextRecorder !== recorder || state.broadcastSocket?.bufferedAmount > 768 * 1024) return;
        state.broadcastSocket.send(await event.data.arrayBuffer());
      }).catch((error) => {
        if (nextRecorder !== recorder) return;
        setWarning?.("Não foi possível enviar a transmissão relay.");
        reportClientError?.("broadcast_relay_send_error", error, { mediaMode: "relay" });
      });
    });
    nextRecorder.start(200);
    sendBroadcast?.({ type: "relay-start", mimeType });
  }

  return { isRecording, relayMimeForStream, start, stop };
}
