export function createBroadcastAudioBridgeController({ getAudioContext, getDesktopBridge }) {
  let context = null;
  let processor = null;
  let destination = null;
  let unsubscribe = null;
  let queue = [];
  let queuedFrames = 0;

  function enqueueAudioChunk(chunk) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk?.buffer || chunk || []);
    const frameCount = Math.floor(bytes.byteLength / 4);
    if (!frameCount) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = new Float32Array(frameCount * 2);
    for (let frame = 0; frame < frameCount; frame += 1) {
      samples[frame * 2] = view.getInt16(frame * 4, true) / 32768;
      samples[frame * 2 + 1] = view.getInt16(frame * 4 + 2, true) / 32768;
    }
    queue.push({ samples, frameCount, offset: 0 });
    queuedFrames += frameCount;
    while (queuedFrames > 96000 && queue.length > 1) {
      const discarded = queue.shift();
      queuedFrames -= discarded.frameCount - discarded.offset;
    }
  }

  function fillAudio(event) {
    const left = event.outputBuffer.getChannelData(0);
    const right = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : left;
    for (let frame = 0; frame < left.length; frame += 1) {
      const current = queue[0];
      if (!current) {
        left[frame] = 0;
        if (right !== left) right[frame] = 0;
        continue;
      }
      const sampleOffset = current.offset * 2;
      left[frame] = current.samples[sampleOffset] || 0;
      if (right !== left) right[frame] = current.samples[sampleOffset + 1] || 0;
      current.offset += 1;
      queuedFrames -= 1;
      if (current.offset >= current.frameCount) queue.shift();
    }
  }

  async function stop() {
    unsubscribe?.();
    unsubscribe = null;
    queue = [];
    queuedFrames = 0;
    processor?.disconnect();
    processor = null;
    destination = null;
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    try { await getDesktopBridge()?.stopWindowAudio?.(); } catch {}
  }

  async function start(kind, processId = null) {
    const desktop = getDesktopBridge();
    const startMethod = kind === "system" ? desktop?.startSystemAudio : desktop?.startWindowAudio;
    if (!startMethod || (kind === "window" && !processId)) return null;
    await stop();
    const AudioContextConstructor = getAudioContext();
    if (!AudioContextConstructor) {
      throw new Error(kind === "system"
        ? "Este app não possui suporte ao áudio filtrado do computador."
        : "Este app não possui suporte ao áudio isolado da janela.");
    }
    const nextContext = new AudioContextConstructor({ sampleRate: 48000 });
    const nextDestination = nextContext.createMediaStreamDestination();
    const nextProcessor = nextContext.createScriptProcessor(4096, 2, 2);
    context = nextContext;
    destination = nextDestination;
    processor = nextProcessor;
    nextProcessor.onaudioprocess = fillAudio;
    nextProcessor.connect(nextDestination);
    unsubscribe = desktop.onWindowAudioChunk?.(enqueueAudioChunk) || null;
    await nextContext.resume();
    try {
      const result = await startMethod.call(desktop, ...(kind === "window" ? [processId] : []));
      if (!result?.ok) {
        throw new Error(result?.message || (kind === "system"
          ? "Não foi possível capturar o áudio filtrado do computador."
          : "Não foi possível capturar o áudio da janela."));
      }
      return nextDestination.stream.getAudioTracks()[0] || null;
    } catch (error) {
      await stop();
      throw error;
    }
  }

  return {
    startSystemAudio: () => start("system"),
    startWindowAudio: (processId) => start("window", processId),
    stop,
  };
}
