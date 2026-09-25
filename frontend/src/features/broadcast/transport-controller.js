export function createBroadcastTransportController({
  acceptGatewayMessage,
  getState,
  playVoiceSound,
  qualityProfiles,
  reportClientError,
  sendBroadcast,
  setState,
  tick,
}) {
  const state = () => getState();

  function clearBroadcastPeerRetry(viewerId) {
    const current = state();
    const timer = current.broadcastPeerRetryTimers.get(viewerId);
    if (timer) window.clearTimeout(timer);
    current.broadcastPeerRetryTimers.delete(viewerId);
  }

  async function flushBroadcastPendingCandidates(viewerId, peer) {
    const current = state();
    const candidates = current.pendingBroadcastCandidates.get(viewerId) || [];
    current.pendingBroadcastCandidates.delete(viewerId);
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate).catch((error) => reportClientError("broadcast_pending_candidate_error", error, { roomId: state().broadcastRoomId, mediaMode: state().mediaMode }));
    }
  }

  function scheduleBroadcastPeerRetry(viewerId, delayMs = 8_000) {
    const current = state();
    if (!viewerId || current.broadcastPeerRetryTimers.has(viewerId)) return;
    const timer = window.setTimeout(() => {
      const latest = state();
      latest.broadcastPeerRetryTimers.delete(viewerId);
      if (latest.broadcastState !== "live" || latest.broadcastSocket?.readyState !== WebSocket.OPEN) return;
      const peer = latest.peerConnections.get(viewerId);
      if (!peer || ["connected", "completed"].includes(peer.connectionState)) return;
      peer.close();
      latest.peerConnections.delete(viewerId);
      latest.pendingBroadcastCandidates.delete(viewerId);
      void negotiateBroadcastPeer(viewerId);
    }, delayMs);
    current.broadcastPeerRetryTimers.set(viewerId, timer);
  }

  async function negotiateBroadcastPeer(viewerId) {
    const current = state();
    if (!viewerId || !current.broadcastStream || current.mediaMode !== "p2p") return;
    const existingNegotiation = current.broadcastPeerNegotiations.get(viewerId);
    if (existingNegotiation) return existingNegotiation;
    const negotiation = (async () => {
      const peer = createBroadcastPeer(viewerId);
      sendBroadcast({ type: "quality-lock", target: viewerId, quality: state().selectedQuality });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const latest = state();
      if (latest.peerConnections.get(viewerId) !== peer || latest.broadcastSocket?.readyState !== WebSocket.OPEN) return;
      sendBroadcast({ type: "signal", target: viewerId, payload: { kind: "offer", sdp: peer.localDescription } });
      scheduleBroadcastPeerRetry(viewerId);
    })().catch((error) => {
      const latest = state();
      reportClientError("broadcast_offer_error", error, { roomId: latest.broadcastRoomId, mediaMode: latest.mediaMode });
      scheduleBroadcastPeerRetry(viewerId, 1_500);
    }).finally(() => {
      state().broadcastPeerNegotiations.delete(viewerId);
    });
    current.broadcastPeerNegotiations.set(viewerId, negotiation);
    return negotiation;
  }

  function createBroadcastPeer(viewerId) {
    const current = state();
    if (current.peerConnections.has(viewerId)) return current.peerConnections.get(viewerId);
    const peer = new RTCPeerConnection({ ...current.rtcConfig, iceCandidatePoolSize: 4 });
    current.peerConnections.set(viewerId, peer);
    const streamTracks = current.broadcastStream?.getTracks?.() || [];
    const audioTracks = streamTracks.filter((track) => track.kind === "audio");
    streamTracks.filter((track) => track.kind !== "audio").forEach((track) => peer.addTrack(track, current.broadcastStream));
    if (audioTracks.length) audioTracks.forEach((track) => peer.addTrack(track, current.broadcastStream));
    else {
      try { peer.addTransceiver("audio", { direction: "sendonly" }); } catch (error) {
        reportClientError("broadcast_audio_transceiver_error", error, { viewerId });
      }
    }
    applyBroadcastPeerQuality(peer, "auto");
    peer.onicecandidate = (event) => {
      if (event.candidate) sendBroadcast({ type: "signal", target: viewerId, payload: { kind: "candidate", candidate: event.candidate } });
    };
    peer.onconnectionstatechange = () => {
      const latest = state();
      if (["connected", "completed"].includes(peer.connectionState)) {
        clearBroadcastPeerRetry(viewerId);
      } else if (["failed", "closed"].includes(peer.connectionState)) {
        peer.close();
        if (latest.peerConnections.get(viewerId) === peer) latest.peerConnections.delete(viewerId);
        latest.pendingBroadcastCandidates.delete(viewerId);
        scheduleBroadcastPeerRetry(viewerId, 1_500);
      } else if (peer.connectionState === "disconnected") {
        scheduleBroadcastPeerRetry(viewerId, 2_500);
      }
    };
    return peer;
  }

  function applyBroadcastPeerQuality(peer, quality) {
    const current = state();
    if (!peer || current.mediaMode !== "p2p") return;
    const profile = quality === "auto"
      ? (qualityProfiles[current.selectedQuality] || qualityProfiles.balanced)
      : (qualityProfiles[quality] || qualityProfiles.balanced);
    for (const sender of peer.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) continue;
      const settings = sender.track.getSettings?.() || {};
      const sourceWidth = Number(settings.width) || profile.width;
      const sourceHeight = Number(settings.height) || profile.height;
      const scaleResolutionDownBy = Math.max(1, sourceWidth / profile.width, sourceHeight / profile.height);
      parameters.encodings = parameters.encodings.map((encoding) => ({
        ...encoding,
        maxBitrate: profile.maxBitrate,
        maxFramerate: profile.maxFramerate,
        scaleResolutionDownBy,
      }));
      sender.setParameters(parameters).catch((error) => reportClientError("broadcast_quality_apply_error", error, { quality, peer: Boolean(peer) }));
    }
  }

  async function handleBroadcastSignal(message) {
    const peer = createBroadcastPeer(message.from);
    if (message.payload?.kind === "answer") {
      await peer.setRemoteDescription(message.payload.sdp);
      await flushBroadcastPendingCandidates(message.from, peer);
    } else if (message.payload?.kind === "candidate") {
      const current = state();
      if (peer.remoteDescription) {
        await peer.addIceCandidate(message.payload.candidate).catch((error) => reportClientError("broadcast_candidate_error", error, { roomId: current.broadcastRoomId, mediaMode: current.mediaMode }));
      } else {
        current.pendingBroadcastCandidates.set(message.from, [...(current.pendingBroadcastCandidates.get(message.from) || []), message.payload.candidate].slice(-64));
      }
    }
  }

  function connectBroadcastSocket() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/signal`);
      setState({ broadcastSocket: socket });
      let settled = false;
      const handshakeTimeout = window.setTimeout(() => {
        if (settled) return;
        const caught = new Error("A conexão da transmissão demorou para responder.");
        reportClientError("broadcast_socket_connect_timeout", caught, { roomId: state().broadcastRoomId });
        try { socket.close(); } catch {}
        settled = true;
        reject(caught);
      }, 12_000);
      const resolveConnection = () => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        resolve(socket);
      };
      const rejectConnection = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        reject(error);
      };
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener("error", () => rejectConnection(new Error("Não foi possível conectar ao servidor de transmissão.")), { once: true });
      socket.addEventListener("message", (event) => {
        void (async () => {
          if (typeof event.data !== "string") return;
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (!acceptGatewayMessage(socket, message)) return;
          const current = state();
          if (message.type === "viewer-joined" && current.mediaMode === "p2p") {
            await negotiateBroadcastPeer(message.viewerId);
          } else if (message.type === "viewer-left") {
            clearBroadcastPeerRetry(message.viewerId);
            current.pendingBroadcastCandidates.delete(message.viewerId);
            current.peerConnections.get(message.viewerId)?.close();
            current.peerConnections.delete(message.viewerId);
          } else if (message.type === "viewer-count") {
            setState({ viewerCount: message.count || 0 });
          } else if (message.type === "chat-history") {
            const messages = (message.messages || []).filter(Boolean).slice(-100);
            setState({ broadcastChatMessages: messages, broadcastChatMessageIds: new Set(messages.map((chatMessage) => chatMessage?.id).filter(Boolean)) });
            await tick();
            const list = state().broadcastChatListElement;
            if (list) list.scrollTop = list.scrollHeight;
          } else if (message.type === "chat-message" && message.message) {
            const chatMessage = message.message;
            const latest = state();
            if (chatMessage.id && !latest.broadcastChatMessageIds.has(chatMessage.id)) {
              setState({
                broadcastChatMessageIds: new Set([...latest.broadcastChatMessageIds, chatMessage.id]),
                broadcastChatMessages: [...latest.broadcastChatMessages, chatMessage].slice(-100),
              });
              await tick();
              const list = state().broadcastChatListElement;
              if (list) list.scrollTop = list.scrollHeight;
              const currentUser = state().user;
              const isOwnMessage = chatMessage.userId === currentUser?.id || chatMessage.username === currentUser?.username;
              if (!isOwnMessage) playVoiceSound("message");
            }
          } else if (message.type === "signal" && current.mediaMode === "p2p") {
            await handleBroadcastSignal(message);
          } else if (message.type === "error") {
            setState({ broadcastError: message.message || "O servidor recusou a transmissão.", broadcastState: "error" });
          }
        })().catch((error) => {
          const current = state();
          reportClientError("broadcast_message_error", error, { roomId: current.broadcastRoomId, mediaMode: current.mediaMode });
          if (current.broadcastSocket === socket && current.broadcastState === "live") {
            setState({ broadcastError: error?.message || "A conexão da transmissão encontrou um erro." });
          }
        });
      });
      socket.addEventListener("error", () => reportClientError("broadcast_socket_error", new Error("A conexão da transmissão falhou."), { roomId: state().broadcastRoomId }));
      socket.addEventListener("close", () => {
        const current = state();
        if (!settled) rejectConnection(new Error("A conexão da transmissão foi encerrada antes de conectar."));
        if (current.broadcastState === "live") {
          reportClientError("broadcast_socket_closed", new Error("A conexão da transmissão foi encerrada."), { roomId: current.broadcastRoomId });
          setState({ broadcastError: "A conexão com o servidor foi encerrada." });
        }
      });
    });
  }

  return {
    clearBroadcastPeerRetry,
    connectBroadcastSocket,
    handleBroadcastSignal,
    negotiateBroadcastPeer,
  };
}
