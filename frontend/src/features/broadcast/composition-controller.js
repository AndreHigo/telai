export function createBroadcastCompositionController({
  getState,
  mixBroadcastAudio,
  reportClientError,
  setState,
}) {
  const state = () => getState();

  async function waitForBroadcastVideoFrame(video, label) {
    const hasFrame = () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
    if (hasFrame()) return;
    await new Promise((resolve, reject) => {
      let settled = false;
      let frameRequestId = null;
      const timeoutId = window.setTimeout(() => finish(new Error(`A fonte ${label} não entregou um frame de vídeo.`)), 8000);
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        if (frameRequestId !== null && typeof video.cancelVideoFrameCallback === "function") {
          try { video.cancelVideoFrameCallback(frameRequestId); } catch {}
        }
        video.removeEventListener("loadedmetadata", check);
        video.removeEventListener("loadeddata", check);
        video.removeEventListener("canplay", check);
        video.removeEventListener("playing", check);
      };
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        if (hasFrame()) finish();
        else scheduleFrameCheck();
      };
      const scheduleFrameCheck = () => {
        if (settled || frameRequestId !== null || typeof video.requestVideoFrameCallback !== "function") return;
        frameRequestId = video.requestVideoFrameCallback(() => {
          frameRequestId = null;
          check();
        });
      };
      video.addEventListener("loadedmetadata", check);
      video.addEventListener("loadeddata", check);
      video.addEventListener("canplay", check);
      video.addEventListener("playing", check);
      void video.play?.().catch?.(() => {});
      scheduleFrameCheck();
      check();
    });
  }

  async function createBroadcastVideoComposition(displayStream, cameraStream, profile, cameraPosition = state().broadcastCameraPosition || "bottom-right") {
    const displayTrack = displayStream?.getVideoTracks?.()[0] || null;
    const cameraTrack = cameraStream?.getVideoTracks?.()[0] || null;
    if (!displayTrack && !cameraTrack) throw new Error("A transmissão não recebeu uma fonte de vídeo.");
    const displaySettings = displayTrack?.getSettings?.() || {};
    const displayWidth = Number(displaySettings.width);
    const displayHeight = Number(displaySettings.height);
    const hasDisplayDimensions = Number.isFinite(displayWidth) && Number.isFinite(displayHeight);
    const needsDisplayDownscale = Boolean(displayTrack && (
      !hasDisplayDimensions || displayWidth > profile.width + 1 || displayHeight > profile.height + 1
    ));
    if (!displayTrack && cameraTrack) return cameraTrack;
    if (!cameraTrack && !needsDisplayDownscale) return displayTrack || cameraTrack;
    if (typeof HTMLCanvasElement === "undefined" || typeof document.createElement("canvas").captureStream !== "function") {
      throw new Error("Este navegador não permite combinar a tela com a câmera.");
    }
    const displayVideo = document.createElement("video");
    const cameraVideo = document.createElement("video");
    const canvas = document.createElement("canvas");
    let outputStream = null;
    let composition = null;
    const inputTracks = [];
    const cloneInputTrack = (track) => {
      const cloned = track?.clone?.();
      if (cloned && cloned !== track) inputTracks.push(cloned);
      return cloned || track;
    };
    const displayInputTrack = cloneInputTrack(displayTrack);
    const cameraInputTrack = cloneInputTrack(cameraTrack);
    const displayInputStream = displayInputTrack ? new MediaStream([displayInputTrack]) : null;
    const cameraInputStream = cameraInputTrack ? new MediaStream([cameraInputTrack]) : null;
    const width = Math.max(320, Math.round(profile.width));
    const height = Math.max(180, Math.round(profile.height));
    canvas.width = width;
    canvas.height = height;
    const compositionVideos = [displayTrack ? displayVideo : null, cameraTrack ? cameraVideo : null].filter(Boolean);
    for (const video of compositionVideos) {
      video.className = "telai-broadcast-composition-video";
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.position = "fixed";
      video.style.left = "-10000px";
      video.style.top = "-10000px";
      video.style.width = "320px";
      video.style.height = "180px";
      video.style.opacity = "0";
      video.style.pointerEvents = "none";
      document.body.appendChild(video);
    }
    try {
      if (displayInputStream) displayVideo.srcObject = displayInputStream;
      if (cameraInputStream) cameraVideo.srcObject = cameraInputStream;
      await Promise.all(compositionVideos.map((video) => video.play()));
      await Promise.all([
        ...(displayTrack ? [waitForBroadcastVideoFrame(displayVideo, "a tela compartilhada")] : []),
        ...(cameraTrack ? [waitForBroadcastVideoFrame(cameraVideo, "a câmera")] : []),
      ]);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a composição da câmera.");
      const cameraSettings = cameraTrack?.getSettings?.() || {};
      const cameraWidth = cameraTrack ? Math.max(160, Math.round(width * 0.27)) : 0;
      const cameraHeight = cameraTrack
        ? Math.max(90, Math.round(cameraWidth * (Number(cameraSettings.height) / Math.max(Number(cameraSettings.width), 1) || 9 / 16)))
        : 0;
      const margin = Math.max(18, Math.round(width * 0.018));
      const frameInterval = 1000 / Math.max(1, Number(profile.maxFramerate) || 30);
      let lastDrawAt = -Infinity;
      const draw = (timestamp = performance.now()) => {
        if (state().broadcastVideoComposition !== composition) return;
        if (timestamp - lastDrawAt >= frameInterval - 0.5) {
          lastDrawAt = timestamp;
          context.fillStyle = "#050a14";
          context.fillRect(0, 0, width, height);
          if (displayVideo.readyState >= 2 && displayVideo.videoWidth > 0) {
            context.drawImage(displayVideo, 0, 0, width, height);
          }
          if (cameraTrack) {
            const position = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(cameraPosition) ? cameraPosition : "bottom-right";
            const x = position.endsWith("right") ? width - cameraWidth - margin : margin;
            const y = position.startsWith("bottom") ? height - cameraHeight - margin : margin;
            context.save();
            context.fillStyle = "rgba(5, 10, 20, .9)";
            context.beginPath();
            context.roundRect?.(x - 6, y - 6, cameraWidth + 12, cameraHeight + 12, 14);
            if (!context.roundRect) context.rect(x - 6, y - 6, cameraWidth + 12, cameraHeight + 12);
            context.fill();
            context.restore();
            if (cameraVideo.readyState >= 2 && cameraVideo.videoWidth > 0) context.drawImage(cameraVideo, x, y, cameraWidth, cameraHeight);
          }
        }
        composition.rafId = window.requestAnimationFrame(draw);
      };
      outputStream = canvas.captureStream(profile.maxFramerate);
      const outputTrack = outputStream.getVideoTracks()[0];
      composition = { canvas, context, displayVideo, cameraVideo, videos: compositionVideos, inputTracks, outputStream, outputTrack, rafId: 0 };
      stopBroadcastVideoComposition(composition);
      setState({ broadcastVideoComposition: composition });
      draw();
      return outputTrack;
    } catch (error) {
      if (state().broadcastVideoComposition === composition && composition) {
        setState({ broadcastVideoComposition: null });
        if (composition.rafId) window.cancelAnimationFrame(composition.rafId);
        try { composition.outputStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      }
      try { outputStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      inputTracks.forEach((track) => { try { track.stop(); } catch {} });
      for (const video of compositionVideos) {
        try { video.pause(); video.srcObject = null; video.remove(); } catch {}
      }
      throw error;
    }
  }

  function stopBroadcastVideoComposition(preserve = null) {
    const composition = state().broadcastVideoComposition;
    setState({ broadcastVideoComposition: null });
    if (composition && composition !== preserve) {
      if (composition.rafId) window.cancelAnimationFrame(composition.rafId);
      try { composition.outputStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      composition.inputTracks?.forEach((track) => { try { track.stop(); } catch {} });
    }
    const videos = new Set([
      ...(composition && composition !== preserve ? composition.videos || [composition.displayVideo, composition.cameraVideo] : []),
      ...document.querySelectorAll("video.telai-broadcast-composition-video"),
    ]);
    for (const video of videos) {
      if (preserve?.videos?.includes(video)) continue;
      try { video.pause(); video.srcObject = null; video.remove(); } catch {}
    }
  }

  async function buildBroadcastOutputStream({ displayStream = null, cameraStream = null, sourceAudioTrack = null, microphoneStream = null, profile, cameraPosition = state().broadcastCameraPosition || "bottom-right" }) {
    const videoTrack = await createBroadcastVideoComposition(displayStream, cameraStream, profile, cameraPosition);
    const microphoneTrack = microphoneStream?.getAudioTracks?.()[0] || null;
    const audioTrack = await mixBroadcastAudio(sourceAudioTrack, microphoneTrack);
    return new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);
  }

  return { buildBroadcastOutputStream, createBroadcastVideoComposition, stopBroadcastVideoComposition };
}
