<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import {
    AlertCircleIcon,
    ArrowDown01Icon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    ArrowUp01Icon,
    ArrowUpRight01Icon,
    GridViewIcon,
    Home01Icon,
    InformationCircleIcon,
    Link01Icon,
    MaximizeScreenIcon,
    Moon01Icon,
    PauseIcon,
    PlayIcon,
    Settings01Icon,
    Share01Icon,
    SparklesIcon,
    Sun01Icon,
    VolumeHighIcon,
    VolumeXIcon,
  } from "@hugeicons/core-free-icons";

  export let roomId = "";
  export let streamPath = "";
  export let isDark = true;
  export let currentUser = null;
  export let onToggleTheme = () => {};
  export let onBack = () => window.location.assign("/");
  export let onNavigate = () => {};
  export let streamData = null;
  export let initialMediaMode = "";
  export let initialRtcConfig = null;
  export let appVersion = "viewer";

  let stream = null;
  let loading = true;
  let status = "conectando…";
  let error = "";
  let socket = null;
  let remoteVideo;
  let viewerFrame;
  let chatList;
  let remoteStream = null;
  let hostId = null;
  let viewerClientId = null;
  let viewerCount = 0;
  let mediaMode = "p2p";
  let quality = "auto";
  let qualityLocked = false;
  let videoReady = false;
  let videoFrameReady = false;
  let videoMuted = true;
  let volume = 1;
  let playing = false;
  // O estado exibido precisa ser o mesmo estado efetivo do elemento <video>.
  // Volume zero também representa áudio mutado para os controles do player.
  $: effectiveVideoMuted = videoMuted || volume <= 0;
  let theaterMode = false;
  let nativeFullscreen = false;
  let chatCollapsed = false;
  let parentFullscreen = false;
  let desktopWindowFullscreen = false;
  let desktopFullscreenUnsubscribe = null;
  // O viewer incorporado precisa nascer compacto. O parâmetro da URL continua
  // sendo aceito, mas a detecção do frame evita que uma rota amigável, cache ou
  // proxy remova `embed=1` e mostre o cabeçalho dentro da transmissão.
  const viewerLocation = typeof window !== "undefined" ? new URL(window.location.href) : null;
  let compact = Boolean(viewerLocation && (
    viewerLocation.searchParams.get("embed") === "1"
    || window.parent !== window
  ));
  let chatOnly = Boolean(viewerLocation?.searchParams.get("chat") === "1");
  let playerSettingsOpen = false;
  let rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  let messages = [];
  let messageDraft = "";
  let chatError = "";
  let peerConnections = new Map();
  let pendingCandidates = new Map();
  let destroyed = false;
  let relayMediaSource = null;
  let relaySourceBuffer = null;
  let relayObjectUrl = "";
  let relayQueue = [];
  let relayPendingChunks = [];
  let relayMimeType = "";
  let relayReceiveChain = Promise.resolve();
  let ownStream = false;
  let notificationSoundContext = null;
  let videoHealthTimer = null;
  let videoFrameCallbackId = null;
  let lastVideoFrameAt = 0;
  let mediaRecoveryTimer = null;

  $: endedTransmission = /encerrad|offline|não existe|nao existe|not found|ended|finished/i.test(`${error} ${status}`);
  $: terminalTitle = endedTransmission ? "Essa transmissão terminou" : "Não foi possível abrir a transmissão";
  $: terminalMessage = endedTransmission
    ? "O vídeo não está mais disponível. Volte ao Telai para escolher outra live."
    : error || "Tente novamente em alguns instantes ou volte ao Telai.";
  let mediaConnectionTimer = null;
  let mediaRecoveryInFlight = false;
  let lastMediaRecoveryAt = 0;
  let userPaused = false;
  let viewerSessionId = "";
  let viewerStartedAt = Date.now();
  let firstVideoFrameReported = false;

  $: fullscreenActive = nativeFullscreen || parentFullscreen || desktopWindowFullscreen;

  const VIDEO_FRAME_TIMEOUT_MS = 10_000;
  const MEDIA_RECOVERY_COOLDOWN_MS = 12_000;
  const MEDIA_CONNECTION_TIMEOUT_MS = 8_000;
  const diagnosticLastSentAt = new Map();
  const DIAGNOSTIC_COOLDOWN_MS = 5_000;

  function shouldSendDiagnostic(payload) {
    const key = `${String(payload?.kind || "viewer_error")}:${window.location.pathname}`;
    const now = Date.now();
    const lastSentAt = diagnosticLastSentAt.get(key) || 0;
    if (now - lastSentAt < DIAGNOSTIC_COOLDOWN_MS) return false;
    diagnosticLastSentAt.set(key, now);
    if (diagnosticLastSentAt.size > 96) {
      const oldestKey = diagnosticLastSentAt.keys().next().value;
      if (oldestKey) diagnosticLastSentAt.delete(oldestKey);
    }
    return true;
  }

  function stopMediaConnectionMonitor() {
    if (mediaConnectionTimer) window.clearTimeout(mediaConnectionTimer);
    mediaConnectionTimer = null;
  }

  function scheduleMediaConnectionRecovery(delayMs = MEDIA_CONNECTION_TIMEOUT_MS) {
    if (mediaConnectionTimer || destroyed || ownStream || !roomId || !hostId || videoReady) return;
    mediaConnectionTimer = window.setTimeout(() => {
      mediaConnectionTimer = null;
      if (!videoReady) void recoverMediaSession("initial_media_timeout");
    }, delayMs);
  }

  function scrollChatToBottom() {
    void tick().then(() => {
      if (chatList) chatList.scrollTop = chatList.scrollHeight;
    });
  }

  function viewerElapsedMs() {
    return Math.max(0, Date.now() - viewerStartedAt);
  }

  function sendViewerDiagnostic(payload) {
    if (!shouldSendDiagnostic(payload)) return;
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
  }

  function reportViewerError(kind, error, context = {}) {
    const source = error instanceof Error ? error : new Error(String(error || "Erro sem mensagem"));
    sendViewerDiagnostic({
      kind: String(kind || "viewer_error").slice(0, 64),
      message: String(source.message || "Erro sem mensagem").slice(0, 240),
      stack: String(source.stack || "").slice(0, 1200),
      route: window.location.pathname,
      appVersion,
      context: { ...context, sessionId: viewerSessionId, elapsedMs: viewerElapsedMs(), roomId, mediaMode },
    });
  }

  function reportViewerTelemetry(kind, context = {}) {
    sendViewerDiagnostic({
      kind: String(kind || "viewer_telemetry").slice(0, 64),
      message: `viewer telemetry: ${String(kind || "stage")}`.slice(0, 240),
      route: window.location.pathname,
      appVersion,
      context: { ...context, sessionId: viewerSessionId, elapsedMs: viewerElapsedMs(), roomId, mediaMode },
    });
  }

  function handleViewerWindowError(event) {
    reportViewerError("viewer_window_error", event.error || event.message, { filename: event.filename, line: event.lineno, column: event.colno });
  }

  function handleViewerUnhandledRejection(event) {
    reportViewerError("viewer_unhandled_rejection", event.reason);
  }

  function playMessageSound() {
    let effectVolume = 0.55;
    try {
      const preferences = JSON.parse(localStorage.getItem("mirante-sound-preferences") || "{}");
      if (preferences.enabled === false || preferences.message === false) return;
      effectVolume = Math.min(1, Math.max(0, Number(preferences.volume ?? effectVolume)));
    } catch {}
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    notificationSoundContext ||= new AudioContextConstructor();
    if (notificationSoundContext.state === "suspended") void notificationSoundContext.resume().catch(() => {});
    const now = notificationSoundContext.currentTime;
    for (const [frequency, offset] of [[880, 0], [1040, 0.08]]) {
      const oscillator = notificationSoundContext.createOscillator();
      const gain = notificationSoundContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.04 * effectVolume, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.1);
      oscillator.connect(gain).connect(notificationSoundContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.12);
    }
  }

  const qualityLabels = { auto: "Automática", high: "Alta", balanced: "Equilibrada", economy: "Econômica" };

  async function resolveStream() {
    if (streamData) {
      stream = streamData;
      ownStream = Boolean(currentUser?.id && stream.createdBy === currentUser.id);
      roomId = stream.roomName || "";
      return Boolean(roomId) && !stream.offline;
    }
    if (roomId) {
      stream = { roomName: roomId, channelName: "Transmissão", visibility: "public" };
      return true;
    }
    if (!streamPath) throw new Error("Canal não encontrado.");
    const response = await fetch(`/api/streams/resolve?path=${encodeURIComponent(streamPath)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.stream) throw new Error(body.error || "Canal não encontrado.");
    stream = body.stream;
    ownStream = Boolean(currentUser?.id && stream.createdBy === currentUser.id);
    roomId = body.stream.roomName || "";
    return Boolean(roomId) && !body.stream.offline;
  }

  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function setStatus(next) {
    if (!destroyed) status = next;
  }

  function stopVideoHealthMonitor() {
    if (videoHealthTimer) clearInterval(videoHealthTimer);
    videoHealthTimer = null;
    if (videoFrameCallbackId != null && remoteVideo?.cancelVideoFrameCallback) {
      try { remoteVideo.cancelVideoFrameCallback(videoFrameCallbackId); } catch {}
    }
    videoFrameCallbackId = null;
    lastVideoFrameAt = 0;
  }

  function noteVideoFrame() {
    lastVideoFrameAt = Date.now();
    if (!videoFrameReady) {
      videoFrameReady = true;
      setStatus(mediaMode === "relay" ? "transmissão ao vivo · relay" : "transmissão ao vivo");
    }
    if (!destroyed && remoteVideo && !remoteVideo.paused) playing = true;
    if (!firstVideoFrameReported) {
      firstVideoFrameReported = true;
      reportViewerTelemetry("viewer_first_frame", { readyState: remoteVideo?.readyState, videoWidth: remoteVideo?.videoWidth, videoHeight: remoteVideo?.videoHeight });
    }
  }

  function startVideoHealthMonitor() {
    stopVideoHealthMonitor();
    lastVideoFrameAt = Date.now();
    if (remoteVideo && typeof remoteVideo.requestVideoFrameCallback === "function") {
      const observeFrame = () => {
        if (destroyed || !remoteVideo || !videoReady) {
          videoFrameCallbackId = null;
          return;
        }
        noteVideoFrame();
        videoFrameCallbackId = remoteVideo.requestVideoFrameCallback(observeFrame);
      };
      videoFrameCallbackId = remoteVideo.requestVideoFrameCallback(observeFrame);
    }
    videoHealthTimer = window.setInterval(() => { void checkVideoHealth(); }, 4_000);
  }

  async function refreshViewerIceConfiguration() {
    try {
      const response = await fetch("/ice-config", { cache: "no-store" });
      const config = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(config?.iceServers) && config.iceServers.length) rtcConfig = config;
    } catch (caught) {
      reportViewerError("viewer_ice_refresh_error", caught, { mediaMode });
    }
  }

  function scheduleMediaRecovery(reason, delayMs = 1_500) {
    if (mediaRecoveryTimer || destroyed || ownStream || !roomId) return;
    mediaRecoveryTimer = window.setTimeout(() => {
      mediaRecoveryTimer = null;
      void recoverMediaSession(reason);
    }, delayMs);
  }

  async function recoverMediaSession(reason) {
    if (mediaRecoveryInFlight || destroyed || ownStream || !roomId || !socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastMediaRecoveryAt < MEDIA_RECOVERY_COOLDOWN_MS) return;
    mediaRecoveryInFlight = true;
    lastMediaRecoveryAt = now;
    reportViewerError("viewer_media_recovery_started", new Error("A transmissão parou de entregar vídeo."), { reason, mediaMode, roomId });
    setStatus("reconectando transmissão…");
    try {
      if (mediaMode === "relay") {
        send({ type: "relay-resync" });
        return;
      }
      await refreshViewerIceConfiguration();
      closePeer(hostId);
      resetRemoteStream();
      send({ type: "join", role: "viewer", roomId });
    } catch (caught) {
      reportViewerError("viewer_media_recovery_error", caught, { reason, mediaMode, roomId });
      setStatus("não foi possível reconectar a transmissão");
      scheduleMediaRecovery("recovery_retry", 5_000);
    } finally {
      mediaRecoveryInFlight = false;
    }
  }

  async function checkVideoHealth() {
    if (destroyed || ownStream || !remoteVideo || !videoReady || userPaused) return;
    if (Date.now() - lastVideoFrameAt < VIDEO_FRAME_TIMEOUT_MS) return;
    if (remoteVideo.paused) {
      try {
        await remoteVideo.play();
        playing = true;
        noteVideoFrame();
        return;
      } catch (caught) {
        reportViewerError("viewer_playback_stalled", caught, { mediaMode, readyState: remoteVideo.readyState });
      }
    }
    scheduleMediaRecovery("video_frame_timeout", 0);
  }

  function resetRemoteStream() {
    stopVideoHealthMonitor();
    videoReady = false;
    videoFrameReady = false;
    playing = false;
    firstVideoFrameReported = false;
    remoteStream?.getTracks().forEach((track) => track.stop());
    remoteStream = null;
    relayQueue = [];
    relayPendingChunks = [];
    relayReceiveChain = Promise.resolve();
    relaySourceBuffer = null;
    if (relayMediaSource?.readyState === "open") {
      try { relayMediaSource.endOfStream(); } catch {}
    }
    relayMediaSource = null;
    if (relayObjectUrl) URL.revokeObjectURL(relayObjectUrl);
    relayObjectUrl = "";
    if (remoteVideo) {
      remoteVideo.srcObject = null;
      remoteVideo.removeAttribute("src");
      remoteVideo.load();
    }
  }

  function closePeer(targetId) {
    if (!targetId) return;
    peerConnections.get(targetId)?.close();
    peerConnections.delete(targetId);
    pendingCandidates.delete(targetId);
  }

  function createPeer(targetId) {
    if (peerConnections.has(targetId)) return peerConnections.get(targetId);
    const peer = new RTCPeerConnection({ ...rtcConfig, iceCandidatePoolSize: 4 });
    peerConnections.set(targetId, peer);
    peer.onicecandidate = (event) => {
      if (event.candidate) send({ type: "signal", target: targetId, payload: { kind: "candidate", candidate: event.candidate } });
    };
    peer.ontrack = async (event) => {
      reportViewerTelemetry("viewer_track_received", { from: targetId, trackKind: event.track?.kind || "unknown", trackReadyState: event.track?.readyState || "unknown" });
      remoteStream ||= new MediaStream();
      const tracks = event.streams[0]?.getTracks() || [event.track];
      tracks.filter(Boolean).forEach((track) => {
        if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) remoteStream.addTrack(track);
        if (track.kind === "video") track.addEventListener("ended", () => scheduleMediaRecovery("video_track_ended"), { once: true });
      });
      // O áudio pode chegar antes do vídeo em uma negociação pública. Não
      // marque a transmissão como pronta até existir uma faixa de vídeo viva;
      // assim o monitor de saúde não começa com um falso positivo.
      if (!remoteStream.getVideoTracks().some((track) => track.readyState === "live")) return;
      if (!remoteVideo) await tick();
      if (remoteVideo) {
        const sourceChanged = remoteVideo.srcObject !== remoteStream;
        if (sourceChanged) remoteVideo.srcObject = remoteStream;
        remoteVideo.muted = effectiveVideoMuted;
        remoteVideo.volume = volume;
        const becameVideoReady = !videoReady;
        videoReady = true;
        stopMediaConnectionMonitor();
        if (becameVideoReady) reportViewerTelemetry("viewer_video_ready", { from: targetId, readyState: remoteVideo.readyState, videoWidth: remoteVideo.videoWidth, videoHeight: remoteVideo.videoHeight });
        setStatus("conexão pronta · carregando vídeo…");
        if (sourceChanged) {
          userPaused = false;
          startVideoHealthMonitor();
          remoteVideo.play().then(() => { playing = true; }).catch((caught) => {
            reportViewerError("viewer_autoplay_error", caught, { mediaMode });
            setStatus("clique em reproduzir para iniciar o vídeo");
          });
        }
      }
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) {
        closePeer(targetId);
        scheduleMediaRecovery(`peer_${peer.connectionState}`);
      } else if (peer.connectionState === "disconnected") {
        scheduleMediaRecovery("peer_disconnected", 3_000);
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed") scheduleMediaRecovery("ice_failed", 0);
      else if (peer.iceConnectionState === "disconnected") scheduleMediaRecovery("ice_disconnected", 3_000);
    };
    return peer;
  }

  async function applyRemoteDescription(from, description) {
    const peer = createPeer(from);
    await peer.setRemoteDescription(description);
    for (const candidate of pendingCandidates.get(from) || []) await peer.addIceCandidate(candidate).catch((error) => reportViewerError("viewer_pending_candidate_error", error, { from }));
    pendingCandidates.delete(from);
    return peer;
  }

  async function handleSignal(from, payload) {
    if (!payload) return;
    if (payload.kind === "offer") {
      hostId = from;
      const peer = await applyRemoteDescription(from, payload.sdp);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      send({ type: "signal", target: from, payload: { kind: "answer", sdp: peer.localDescription } });
    } else if (payload.kind === "candidate") {
      const peer = peerConnections.get(from);
      if (!peer) {
        pendingCandidates.set(from, [...(pendingCandidates.get(from) || []), payload.candidate]);
      } else if (peer.remoteDescription) {
        await peer.addIceCandidate(payload.candidate).catch((error) => reportViewerError("viewer_candidate_error", error, { from }));
      } else {
        pendingCandidates.set(from, [...(pendingCandidates.get(from) || []), payload.candidate]);
      }
    }
  }

  function receiveMessage(message) {
    if (message.type === "joined") {
      viewerClientId = message.clientId;
      hostId = message.hostId || null;
      viewerCount = Math.max(0, Number(message.viewerCount) || 0);
      setStatus(hostId ? "conectando ao transmissor…" : "aguardando transmissor");
      reportViewerTelemetry("viewer_joined", { hostPresent: Boolean(hostId), viewerCount, clientIdPresent: Boolean(viewerClientId) });
      if (hostId) scheduleMediaConnectionRecovery();
    } else if (message.type === "viewer-count") {
      viewerCount = Math.max(0, Number(message.count) || 0);
    } else if (message.type === "host-ready") {
      hostId = message.hostId;
      setStatus("conectando ao transmissor…");
      reportViewerTelemetry("viewer_host_ready", { hostPresent: Boolean(hostId) });
      scheduleMediaConnectionRecovery();
    } else if (message.type === "waiting") {
      setStatus("aguardando transmissor");
    } else if (message.type === "quality-lock") {
      const lockedQuality = ["high", "balanced", "economy"].includes(message.quality) ? message.quality : "balanced";
      quality = lockedQuality;
      qualityLocked = true;
    } else if (message.type === "chat-history") {
      messages = Array.isArray(message.messages) ? message.messages.slice(-120) : [];
      scrollChatToBottom();
    } else if (message.type === "chat-message" && message.message) {
      messages = [...messages, message.message].slice(-120);
      scrollChatToBottom();
      if (message.message.username !== currentUser?.username) playMessageSound();
    } else if (message.type === "chat-cleared") {
      messages = [];
      scrollChatToBottom();
    } else if (message.type === "chat-error") {
      chatError = message.message || "Não foi possível enviar a mensagem.";
    } else if (message.type === "signal") {
      if (message.payload?.kind === "offer") reportViewerTelemetry("viewer_offer_received", { from: message.from });
      if (mediaMode === "p2p") handleSignal(message.from, message.payload).catch((caught) => { reportViewerError("viewer_signal_error", caught, { mediaMode }); setStatus("não foi possível negociar a transmissão"); });
    } else if (message.type === "relay-start") {
      if (mediaMode === "relay") startRelayViewer(message.mimeType).catch((caught) => { reportViewerError("viewer_relay_start_error", caught, { mediaMode }); setStatus("não foi possível preparar a transmissão relay"); });
    } else if (message.type === "relay-resync") {
      if (mediaMode === "relay") startRelayViewer(message.mimeType).catch((caught) => { reportViewerError("viewer_relay_resync_error", caught, { mediaMode }); setStatus("não foi possível reconstruir a transmissão relay"); });
    } else if (message.type === "host-paused") {
      resetRemoteStream();
      setStatus("transmissor reconectando…");
    } else if (message.type === "host-left" || message.type === "host-stopped") {
      resetRemoteStream();
      setStatus("transmissão encerrada");
    } else if (message.type === "error") {
      error = message.message || "Não foi possível abrir esta transmissão.";
      setStatus("erro");
    }
  }

  function trimRelayBuffer() {
    if (!relaySourceBuffer || relaySourceBuffer.updating || !remoteVideo || !relaySourceBuffer.buffered.length) return;
    const bufferedStart = relaySourceBuffer.buffered.start(0);
    const keepFrom = Math.max(bufferedStart, remoteVideo.currentTime - 12);
    if (keepFrom <= bufferedStart + 1) return;
    try { relaySourceBuffer.remove(bufferedStart, keepFrom); } catch {}
  }

  function pumpRelayQueue() {
    if (!relaySourceBuffer || relaySourceBuffer.updating || !relayQueue.length) return;
    trimRelayBuffer();
    if (relaySourceBuffer.updating) return;
    try { relaySourceBuffer.appendBuffer(relayQueue.shift()); } catch { relayQueue = []; setStatus("erro ao decodificar a transmissão"); }
  }

  async function startRelayViewer(mimeType) {
    if (!window.MediaSource || !MediaSource.isTypeSupported(mimeType)) {
      setStatus("seu navegador não suporta o formato desta transmissão");
      return;
    }
    if (!remoteVideo) await tick();
    if (!remoteVideo) {
      setStatus("não foi possível preparar o player");
      return;
    }
    resetRemoteStream();
    relayMimeType = mimeType;
    relayMediaSource = new MediaSource();
    relayObjectUrl = URL.createObjectURL(relayMediaSource);
    relayMediaSource.addEventListener("sourceopen", () => {
      try {
        relaySourceBuffer = relayMediaSource.addSourceBuffer(relayMimeType);
        relaySourceBuffer.addEventListener("updateend", pumpRelayQueue);
        relayQueue.push(...relayPendingChunks);
        relayPendingChunks = [];
        pumpRelayQueue();
      } catch (caught) { setStatus(caught.message || "não foi possível preparar a transmissão"); }
    }, { once: true });
    remoteVideo.srcObject = null;
    remoteVideo.src = relayObjectUrl;
    remoteVideo.muted = effectiveVideoMuted;
    remoteVideo.volume = volume;
    userPaused = false;
    startVideoHealthMonitor();
    remoteVideo.play().then(() => { playing = true; }).catch((error) => {
      reportViewerError("viewer_relay_autoplay_error", error, { mediaMode });
      setStatus("clique em reproduzir para iniciar a transmissão");
    });
    setStatus("conectado ao relay · aguardando vídeo…");
  }

  function receiveRelayChunk(chunk) {
    relayReceiveChain = relayReceiveChain.then(async () => {
      let bytes;
      if (chunk instanceof ArrayBuffer) bytes = chunk;
      else if (ArrayBuffer.isView(chunk)) bytes = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
      else if (chunk instanceof Blob) bytes = await chunk.arrayBuffer();
      if (!bytes?.byteLength) return;
      if (!relayMediaSource) {
        relayPendingChunks = [...relayPendingChunks, bytes].slice(-4);
        return;
      }
      relayQueue.push(bytes);
      if (relayQueue.length > 8) relayQueue = relayQueue.slice(-8);
      pumpRelayQueue();
      videoReady = true;
      setStatus("conexão pronta · carregando vídeo…");
    }).catch((caught) => { reportViewerError("viewer_relay_receive_error", caught, { mediaMode }); setStatus("erro ao receber a transmissão"); });
  }

  function connect() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/signal`);
      socket.binaryType = "arraybuffer";
      let settled = false;
      const handshakeTimeout = window.setTimeout(() => {
        if (settled) return;
        const caught = new Error("A conexão da transmissão demorou para responder.");
        reportViewerError("viewer_socket_connect_timeout", caught, { roomId });
        try { socket.close(); } catch {}
        settled = true;
        reject(caught);
      }, 12_000);
      const resolveConnection = () => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        send({ type: "join", role: "viewer", roomId });
        resolve();
      };
      const rejectConnection = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        reject(error);
      };
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener("open", () => reportViewerTelemetry("viewer_socket_open"), { once: true });
      socket.addEventListener("error", () => { const caught = new Error("Não foi possível conectar ao servidor de transmissão."); reportViewerError("viewer_socket_error", caught, { roomId }); rejectConnection(caught); }, { once: true });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") { receiveRelayChunk(event.data); return; }
        try { receiveMessage(JSON.parse(event.data)); } catch { setStatus("mensagem inválida do servidor"); }
      });
      socket.addEventListener("close", () => {
        if (!settled) rejectConnection(new Error("A conexão da transmissão foi encerrada antes de conectar."));
        stopMediaConnectionMonitor();
        if (!destroyed && status !== "transmissão encerrada") setStatus("conexão encerrada");
      });
    });
  }

  async function initialize() {
    loading = true;
    error = "";
    reportViewerTelemetry("viewer_initialize_started", { streamPath, compact, chatOnly });
    try {
      const [runtimeResponse, iceResponse, active] = await Promise.all([
        initialMediaMode ? null : fetch("/runtime-config", { cache: "no-store" }),
        initialRtcConfig ? null : fetch("/ice-config", { cache: "no-store" }),
        resolveStream(),
      ]);
      if (initialMediaMode) mediaMode = initialMediaMode === "relay" ? "relay" : "p2p";
      else {
        const runtime = await runtimeResponse.json().catch(() => ({}));
        mediaMode = runtime.mediaMode === "relay" ? "relay" : "p2p";
      }
      if (initialRtcConfig?.iceServers?.length) rtcConfig = initialRtcConfig;
      else {
        const ice = await iceResponse.json().catch(() => ({}));
        if (Array.isArray(ice?.iceServers) && ice.iceServers.length) rtcConfig = ice;
      }
      reportViewerTelemetry("viewer_config_loaded", { iceServerCount: Array.isArray(rtcConfig?.iceServers) ? rtcConfig.iceServers.length : 0 });
      reportViewerTelemetry("viewer_stream_resolved", { streamId: stream?.id || null, active, offline: Boolean(stream?.offline), ownStream });
      if (!active) {
        setStatus(ownStream ? "sua transmissão está ativa" : "canal offline");
        return;
      }
      if (ownStream) {
        setStatus("sua transmissão está ativa");
        return;
      }
      loading = false;
      await tick();
      await connect();
    } catch (caught) {
      reportViewerError("viewer_initialize_error", caught, { roomId, streamPath, mediaMode });
      error = caught.message || "Não foi possível abrir esta transmissão.";
      setStatus("erro");
    } finally {
      loading = false;
    }
  }

  async function togglePlay() {
    if (!remoteVideo || !videoReady) return;
    if (remoteVideo.paused) {
      userPaused = false;
      await remoteVideo.play().then(() => { playing = true; noteVideoFrame(); }).catch((caught) => {
        reportViewerError("viewer_manual_playback_error", caught, { mediaMode });
        setStatus("o navegador bloqueou a reprodução");
      });
    } else {
      userPaused = true;
      remoteVideo.pause();
      playing = false;
    }
  }

  async function toggleMute() {
    if (!remoteVideo || !videoReady) return;

    const nextMuted = !effectiveVideoMuted;
    // Ao reativar pelo botão depois de o volume estar em zero, devolve um
    // nível audível para que o clique realmente produza som.
    if (!nextMuted && volume <= 0) volume = 1;
    videoMuted = nextMuted;
    const nextEffectiveMuted = nextMuted || volume <= 0;
    remoteVideo.volume = volume;
    remoteVideo.muted = nextEffectiveMuted;

    if (!nextEffectiveMuted) {
      await remoteVideo.play().catch((error) => reportViewerError("viewer_unmute_playback_error", error, { mediaMode }));
    }
  }

  async function changeVolume(event) {
    const nextVolume = Math.min(1, Math.max(0, Number(event.currentTarget.value)));
    volume = nextVolume;
    videoMuted = nextVolume <= 0;
    const nextEffectiveMuted = nextVolume <= 0;
    if (remoteVideo) {
      remoteVideo.volume = nextVolume;
      remoteVideo.muted = nextEffectiveMuted;
      if (!nextEffectiveMuted) {
        await remoteVideo.play().catch((error) => reportViewerError("viewer_volume_playback_error", error, { mediaMode }));
      }
    }
  }

  function syncViewerPlaybackState() {
    if (!remoteVideo) return;
    playing = !remoteVideo.paused && !remoteVideo.ended;
  }

  function isEmbeddedElectron() {
    return compact && window.parent !== window && (Boolean(window.miranteDesktop?.isDesktop) || /\bElectron\//i.test(navigator.userAgent));
  }

  function exitParentFullscreen() {
    if (!parentFullscreen) return false;
    window.parent.postMessage({ type: "telai-viewer-fullscreen", active: false }, window.location.origin);
    parentFullscreen = false;
    return true;
  }

  async function toggleFullscreen() {
    if (!viewerFrame) return;
    try {
      if (!compact && window.miranteDesktop?.isDesktop && typeof window.miranteDesktop.toggleWindowFullscreen === "function") {
        const result = await window.miranteDesktop.toggleWindowFullscreen(!desktopWindowFullscreen);
        if (!result?.ok) throw new Error(result?.message || "Não foi possível alternar a tela cheia do aplicativo.");
        desktopWindowFullscreen = Boolean(result.active);
        return;
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (parentFullscreen) return void exitParentFullscreen();
      if (isEmbeddedElectron()) {
        parentFullscreen = true;
        window.parent.postMessage({ type: "telai-viewer-fullscreen", active: true }, window.location.origin);
        return;
      }
      if (typeof viewerFrame.requestFullscreen !== "function") throw new Error("Fullscreen indisponível neste frame.");
      await viewerFrame.requestFullscreen({ navigationUI: "hide" });
    } catch (caught) {
      reportViewerError("viewer_fullscreen_error", caught);
      if (window.parent !== window) {
        parentFullscreen = true;
        window.parent.postMessage({ type: "telai-viewer-fullscreen", active: true }, window.location.origin);
        return;
      }
      setStatus("não foi possível entrar em tela cheia; tente novamente");
    }
  }

  function handleFullscreenChange() {
    nativeFullscreen = document.fullscreenElement === viewerFrame;
  }

  function handleParentFullscreenMessage(event) {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type !== "telai-viewer-fullscreen") return;
    parentFullscreen = Boolean(event.data.active);
  }

  function handleViewerKeydown(event) {
    if (event.key !== "Escape") return;
    if (parentFullscreen) {
      event.preventDefault();
      exitParentFullscreen();
    }
  }

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponível neste contexto.");
      await navigator.clipboard.writeText(viewerShareUrl());
      status = "link copiado";
    } catch (caught) {
      reportViewerError("viewer_clipboard_error", caught);
      status = "não foi possível copiar o link";
      return;
    }
    window.setTimeout(() => { if (!destroyed && status === "link copiado") status = videoReady ? "transmissão ao vivo" : "aguardando transmissor"; }, 1600);
  }

  function chatPopupUrl() {
    const url = new URL(viewerShareUrl());
    url.searchParams.set("chat", "1");
    url.searchParams.delete("embed");
    return url.href;
  }

  function playerPopupUrl() {
    const url = new URL(viewerShareUrl());
    url.searchParams.set("embed", "1");
    url.searchParams.delete("chat");
    return url.href;
  }

  function openPlayerPopup() {
    chatError = "";
    const popup = window.open(playerPopupUrl(), "telai-player", "popup,width=1100,height=720,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no");
    if (!popup) {
      chatError = "Não foi possível abrir o player em uma nova janela. Permita pop-ups para o Telai e tente novamente.";
      return;
    }
    try { popup.focus(); } catch {}
  }

  function openChatPopup() {
    chatError = "";
    const popup = window.open(chatPopupUrl(), "telai-chat", "popup,width=430,height=720,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no");
    if (!popup) {
      chatError = "Não foi possível abrir o chat em uma nova janela. Permita pop-ups para o Telai e tente novamente.";
      return;
    }
    try { popup.focus(); } catch {}
  }

  function viewerShareUrl() {
    if (streamPath) return new URL(streamPath, window.location.origin).href;
    if (roomId) return `${window.location.origin}/?room=${encodeURIComponent(roomId)}&mode=viewer`;
    return window.location.href;
  }

  function updateQuality(event) {
    if (qualityLocked) return;
    quality = event.currentTarget.value;
  }

  function sendChat() {
    const body = messageDraft.trim();
    if (!body) return;
    chatError = "";
    send({ type: "chat-message", body });
    messageDraft = "";
  }

  onMount(() => {
    viewerSessionId = typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    viewerStartedAt = Date.now();
    window.addEventListener("error", handleViewerWindowError);
    window.addEventListener("unhandledrejection", handleViewerUnhandledRejection);
    window.addEventListener("message", handleParentFullscreenMessage);
    window.addEventListener("keydown", handleViewerKeydown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    if (window.miranteDesktop?.onWindowFullscreen) {
      desktopFullscreenUnsubscribe = window.miranteDesktop.onWindowFullscreen((payload) => {
        desktopWindowFullscreen = Boolean(payload?.active);
      });
    }
    if (compact) {
      document.documentElement.classList.add("viewer-embed-document");
      document.body.classList.add("viewer-embed-document");
    }
    initialize();
    return () => {
      document.documentElement.classList.remove("viewer-embed-document");
      document.body.classList.remove("viewer-embed-document");
    };
  });
  onDestroy(() => {
    destroyed = true;
    if (mediaRecoveryTimer) clearTimeout(mediaRecoveryTimer);
    mediaRecoveryTimer = null;
    stopMediaConnectionMonitor();
    stopVideoHealthMonitor();
    window.removeEventListener("error", handleViewerWindowError);
    window.removeEventListener("unhandledrejection", handleViewerUnhandledRejection);
    window.removeEventListener("message", handleParentFullscreenMessage);
    window.removeEventListener("keydown", handleViewerKeydown);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    desktopFullscreenUnsubscribe?.();
    desktopFullscreenUnsubscribe = null;
    send({ type: "leave" });
    socket?.close();
    for (const peer of peerConnections.values()) peer.close();
    peerConnections.clear();
    resetRemoteStream();
  });
</script>

<svelte:head>
  <title>{stream?.channelName ? `${stream.channelName} · Telai` : "Assistir transmissão · Telai"}</title>
</svelte:head>

<div class:theater={theaterMode} class:desktop-fullscreen={desktopWindowFullscreen} class:chat-collapsed={chatCollapsed} class:compact class:chat-only={chatOnly} class:terminal-state={Boolean(error)} class="viewer-page">
  <header class="viewer-topbar app-header-shell">
    <div class="viewer-topbar-inner shell-width">
      {#if currentUser}<button class="viewer-brand" type="button" on:click={onBack} aria-label="Ir para o início do Telai"><span class="telai-logo-switcher"><img class:active={isDark} src="/telai-logo-dark.png?v=1" alt={isDark ? "Telai" : ""} aria-hidden={!isDark} /><img class:active={!isDark} src="/telai-logo.png?v=1" alt={!isDark ? "Telai" : ""} aria-hidden={isDark} /></span></button>{:else}<a class="viewer-brand" href="/" aria-label="Ir para o início do Telai"><span class="telai-logo-switcher"><img class:active={isDark} src="/telai-logo-dark.png?v=1" alt={isDark ? "Telai" : ""} aria-hidden={!isDark} /><img class:active={!isDark} src="/telai-logo.png?v=1" alt={!isDark ? "Telai" : ""} aria-hidden={isDark} /></span></a>{/if}
      <div class="viewer-topbar-actions">
        <a class="viewer-download-link" href="https://github.com/AndreHigo/telai-downloads/releases/latest/download/Telai-Setup-latest.exe" target="_blank" rel="noreferrer" aria-label="Baixar o aplicativo Telai"><HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.8} /><span>Baixar app</span></a>
        <button class="viewer-theme-button" type="button" on:click={onToggleTheme} aria-label="Alternar tema"><HugeiconsIcon icon={isDark ? Sun01Icon : Moon01Icon} size={17} strokeWidth={1.8} /></button>
        {#if currentUser}<button class="viewer-nav-link" type="button" on:click={() => onNavigate("home")}>Início</button><button class="viewer-nav-link" type="button" on:click={() => onNavigate("live")}>Ao vivo</button><button class="viewer-nav-link" type="button" on:click={() => onNavigate("groups")}>Grupos</button><button class="viewer-login-link" type="button" on:click={onBack} aria-label="Voltar ao Telai"><HugeiconsIcon icon={ArrowLeft01Icon} size={15} strokeWidth={1.8} /><span>Voltar ao Telai</span></button>{:else}<a class="viewer-login-link" href="/login">Entrar</a>{/if}
      </div>
    </div>
  </header>

  <main class="viewer-page-content shell-width">
    {#if !error}<header class="viewer-heading">
      <div><p class="eyebrow">sala compartilhada · {mediaMode.toUpperCase()}</p><h1>Assistir transmissão</h1><p class="muted">{stream?.channelName ? `${stream.channelName}${stream.title ? ` · ${stream.title}` : ""}` : "Acompanhe a transmissão ao vivo."}</p></div>
      <div class="viewer-heading-status"><span class="viewer-audience-count viewer-audience-count-heading" aria-live="polite" aria-label={`${viewerCount} ${viewerCount === 1 ? "pessoa assistindo" : "pessoas assistindo"}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20m6-8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm5.5-6.7a3 3 0 0 1 0 5.8m2.8 8.9v-1.5a3.5 3.5 0 0 0-2.5-3.4" /></svg><strong>{viewerCount.toLocaleString("pt-BR")}</strong><span>assistindo</span></span><span class:viewer-status-live={videoReady} class="viewer-status">{status}</span></div>
    </header>{/if}

    {#if error}
      <section class="viewer-terminal-state" role="alert" aria-labelledby="viewer-terminal-title">
        <div class="viewer-terminal-icon" aria-hidden="true"><HugeiconsIcon icon={endedTransmission ? InformationCircleIcon : AlertCircleIcon} size={30} strokeWidth={1.8} /></div>
        <div class="viewer-terminal-copy">
          <p class="eyebrow">{endedTransmission ? "transmissão encerrada" : "não foi possível carregar"}</p>
          <h1 id="viewer-terminal-title">{terminalTitle}</h1>
          <p>{terminalMessage}</p>
          <div class="viewer-terminal-actions">
            {#if currentUser}<button class="primary" type="button" on:click={onBack}><HugeiconsIcon icon={Home01Icon} size={16} strokeWidth={1.8} /> Voltar ao Telai</button>{:else}<a class="primary" href="/"><HugeiconsIcon icon={Home01Icon} size={16} strokeWidth={1.8} /> Voltar ao Telai</a>{/if}
            <button class="outline" type="button" on:click={() => window.location.reload()}><HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} /> Tentar novamente</button>
          </div>
        </div>
        <div class="viewer-terminal-footer"><span><i></i> Player do Telai</span><span>{stream?.channelName || "Canal indisponível"}</span></div>
      </section>
    {:else if loading}
      <div class="viewer-loading">Abrindo transmissão…</div>
    {:else}
      <div class="viewer-layout">
        <section bind:this={viewerFrame} class:theater={theaterMode} class="viewer-player-shell">
          <div class="viewer-video-frame">
            <video bind:this={remoteVideo} autoplay muted={effectiveVideoMuted} playsinline preload="metadata" on:click={togglePlay} on:loadeddata={noteVideoFrame} on:playing={noteVideoFrame} on:play={syncViewerPlaybackState} on:pause={syncViewerPlaybackState}></video>
            {#if ownStream}<div class="viewer-empty viewer-own-stream"><span class="viewer-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={ArrowUpRight01Icon} size={30} strokeWidth={1.8} /></span><strong>Esta é a sua transmissão</strong><p>Você já está ao vivo pelo painel do Telai.</p><button class="outline" type="button" on:click={onBack}>Voltar ao painel</button></div>{:else if !videoFrameReady}<div class="viewer-empty"><span class="viewer-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={InformationCircleIcon} size={30} strokeWidth={1.8} /></span><strong>{stream?.offline ? "Canal offline" : status === "erro" ? "Transmissão indisponível" : videoReady ? "Carregando vídeo…" : "Aguardando a transmissão"}</strong><p>{stream?.offline ? "O transmissor ainda não iniciou uma live neste endereço." : videoReady ? "Conexão estabelecida; recebendo os primeiros quadros." : "O transmissor ainda não abriu a sala."}</p></div>{/if}
          </div>
          <div class="viewer-controls">
            <div class="viewer-timeline"><span>{videoReady ? "AO VIVO" : "—"}</span><div></div><span>LIVE</span></div>
            <div class="viewer-control-row"><button type="button" class="viewer-control-button" data-tooltip={playing ? "Pausar" : "Reproduzir"} on:click={togglePlay} disabled={!videoReady} aria-label={playing ? "Pausar" : "Reproduzir"}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={15} strokeWidth={1.8} /></button><button class="viewer-control-button viewer-audio-muted" type="button" data-tooltip={effectiveVideoMuted ? "Ativar áudio" : "Silenciar áudio"} on:click={toggleMute} disabled={!videoReady} aria-pressed={effectiveVideoMuted} aria-label={effectiveVideoMuted ? "Ativar áudio" : "Silenciar áudio"}><HugeiconsIcon icon={effectiveVideoMuted ? VolumeXIcon : VolumeHighIcon} size={15} strokeWidth={1.8} /></button><label class="viewer-volume"><span>VOL</span><input type="range" min="0" max="1" step="0.05" value={volume} on:input={changeVolume} aria-label="Volume" /></label><span class="viewer-live-pill"><i></i> AO VIVO</span><span class="viewer-controls-spacer"></span><button type="button" class="viewer-control-button" data-tooltip="Modo teatro" on:click={() => theaterMode = !theaterMode} aria-label="Modo teatro"><HugeiconsIcon icon={GridViewIcon} size={15} strokeWidth={1.8} /></button><button type="button" class="viewer-control-button" data-tooltip="Copiar link" on:click={copyLink} aria-label="Copiar link"><HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.8} /></button><button type="button" class="viewer-control-button" data-tooltip="Abrir player em popup" on:click={openPlayerPopup} aria-label="Abrir player em popup"><HugeiconsIcon icon={Share01Icon} size={15} strokeWidth={1.8} /></button><button type="button" class="viewer-control-button" data-tooltip="Configurações" on:click={() => playerSettingsOpen = !playerSettingsOpen} aria-label="Configurações"><HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.8} /></button><button type="button" class="viewer-control-button" data-tooltip={fullscreenActive ? "Sair da tela cheia" : "Tela cheia"} on:click={toggleFullscreen} aria-label={fullscreenActive ? "Sair da tela cheia" : "Tela cheia"}><HugeiconsIcon icon={MaximizeScreenIcon} size={15} strokeWidth={1.8} /></button></div>
            {#if playerSettingsOpen}<div class="viewer-settings"><label>Qualidade<select value={quality} on:change={updateQuality} disabled={qualityLocked}><option value="auto">{qualityLabels.auto}</option><option value="high">{qualityLabels.high}</option><option value="balanced">{qualityLabels.balanced}</option><option value="economy">{qualityLabels.economy}</option></select></label><span>{qualityLocked ? `Definida pelo transmissor: ${qualityLabels[quality]}. A rede pode reduzir temporariamente, mas não aumentar.` : "Aguardando a qualidade definida pelo transmissor…"}</span></div>{/if}
          </div>
        </section>

        <aside id="viewer-chat-panel" class="viewer-chat-panel">
          <div class="viewer-chat-heading"><div><p class="eyebrow">conversa ao vivo</p><h2>Chat da transmissão</h2></div><div class="viewer-chat-heading-actions"><button class="outline viewer-chat-popup-button" type="button" on:click={openChatPopup}>Abrir chat em popup <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} strokeWidth={1.8} /></button><button class="outline viewer-chat-collapse-button" type="button" on:click={() => chatCollapsed = !chatCollapsed} aria-expanded={!chatCollapsed} aria-controls="viewer-chat-panel" aria-label={chatCollapsed ? "Expandir chat" : "Recolher chat"} title={chatCollapsed ? "Expandir chat" : "Recolher chat"}><HugeiconsIcon icon={chatCollapsed ? ArrowRight01Icon : ArrowLeft01Icon} size={15} strokeWidth={1.8} /><span>{chatCollapsed ? "Abrir chat" : "Recolher"}</span></button></div></div>
          <div bind:this={chatList} class="viewer-chat-list">{#if messages.length}{#each messages as message}<article class="viewer-chat-message"><span class="viewer-chat-avatar">{message.displayName?.slice(0, 1) || "V"}</span><div><div><strong>{message.displayName || "Visitante"}</strong><small>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "agora"}</small></div><p>{message.body}</p></div></article>{/each}{:else}<div class="viewer-chat-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={SparklesIcon} size={24} strokeWidth={1.8} /></span><strong>O chat está pronto.</strong><small>As mensagens aparecem aqui em tempo real.</small></div>{/if}</div>
          <form class="viewer-chat-form" on:submit|preventDefault={sendChat}><input bind:value={messageDraft} maxlength="500" placeholder="Escreva uma mensagem…" autocomplete="off" /><button type="submit" aria-label="Enviar mensagem"><HugeiconsIcon icon={ArrowUp01Icon} size={17} strokeWidth={1.8} /></button></form>
          {#if chatError}<p class="viewer-chat-error" role="alert">{chatError}</p>{/if}<p class="viewer-chat-hint">Visitantes podem conversar; mensagens têm limite para evitar flood.</p>
        </aside>
      </div>
    {/if}
  </main>
</div>
