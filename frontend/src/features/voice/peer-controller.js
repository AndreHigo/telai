export function createVoicePeerController({
  getState,
  getRtcConfig,
  setState,
  ensureVoiceActivityTimer,
  bindVoiceLocalTrack,
  sendVoice,
  reportClientError,
  hasTurnServer,
  recoverPeer,
  closePeer,
  schedulePeerRecovery,
  clearPeerRecovery,
  ensureRemoteStream,
  ensureRemoteAudio,
  scheduleVoiceRemotePlayback,
  ensurePeerHealthTimer,
  attachVoiceActivityDetector,
  playRemoteAudio,
  clearRecoveredVoiceError,
  voicePreferenceTargetId,
  effectiveVoiceOutputVolume,
  connectionTimeoutMs,
  audioTrackTimeoutMs,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  const state = () => getState?.() || {};

  function setVoiceError(message) {
    setState?.({ voiceError: message });
  }

  function createPeer(participantId, initiator = false, peerConfig = getRtcConfig?.()) {
    const current = state();
    if (!current.voicePeerConnections || current.voicePeerConnections.has(participantId)) return current.voicePeerConnections?.get(participantId) || null;
    const peer = new RTCPeerConnection({ ...(peerConfig || {}), iceCandidatePoolSize: 2 });
    current.voicePeerConnections.set(participantId, peer);
    const connectionTimer = setTimeoutFn(() => {
      const latest = state();
      latest.voicePeerConnectionTimers?.delete(participantId);
      if (latest.voicePeerConnections?.get(participantId) !== peer || ["connected", "completed", "closed"].includes(peer.connectionState)) return;
      reportClientError?.("voice_peer_connection_timeout", new Error("O par de voz não concluiu a conexão a tempo."), { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, forceRelay: Boolean(hasTurnServer?.()) });
      setVoiceError("A conexão de áudio ainda não foi concluída. Tentando recuperar o áudio…");
      void recoverPeer?.(participantId, peer, { forceRelay: true });
    }, connectionTimeoutMs);
    current.voicePeerConnectionTimers?.set(participantId, connectionTimer);
    ensureVoiceActivityTimer?.();

    const localTrack = current.voiceLocalStream?.getAudioTracks?.().find((track) => track.readyState === "live");
    if (localTrack) {
      peer.addTrack(localTrack, current.voiceLocalStream);
      bindVoiceLocalTrack?.(localTrack);
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) sendVoice?.({ type: "voice-signal", target: participantId, payload: { kind: "candidate", candidate: event.candidate } });
    };
    peer.ontrack = (event) => {
      const latest = state();
      const audioTrackTimer = latest.voicePeerAudioTrackTimers?.get(participantId);
      if (audioTrackTimer) clearTimeoutFn(audioTrackTimer);
      latest.voicePeerAudioTrackTimers?.delete(participantId);
      try {
        if (event.receiver && "playoutDelayHint" in event.receiver) event.receiver.playoutDelayHint = 0;
      } catch (error) {
        reportClientError?.("voice_playout_delay_hint_error", error, { participantId });
      }
      const remoteStream = ensureRemoteStream?.(participantId);
      if (!remoteStream) return;
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track);
      const audio = ensureRemoteAudio?.(participantId);
      if (!audio) return;
      audio.muted = Boolean(latest.voiceDeafened || latest.voiceLocallyMutedParticipants?.has(voicePreferenceTargetId?.(participantId)));
      audio.volume = effectiveVoiceOutputVolume?.(participantId) ?? 1;
      if (audio.srcObject !== remoteStream) audio.srcObject = remoteStream;
      event.track.addEventListener("ended", () => {
        const after = state();
        if (after.voiceRemoteStreams?.get(participantId) !== remoteStream) return;
        try { remoteStream.removeTrack(event.track); } catch {}
        if (!remoteStream.getAudioTracks().some((track) => track.readyState === "live")) {
          after.voicePeerAudioHealth?.delete(participantId);
          scheduleVoiceRemotePlayback?.(participantId, 400);
        }
      }, { once: true });
      clearRecoveredVoiceError?.();
      const currentHealth = latest.voicePeerAudioHealth?.get(participantId);
      latest.voicePeerAudioHealth?.set(participantId, {
        firstTrackAt: currentHealth?.firstTrackAt || Date.now(),
        lastProgressAt: currentHealth?.lastProgressAt || Date.now(),
        lastBytes: currentHealth?.lastBytes || 0,
        recoveryAttempted: currentHealth?.recoveryAttempted || false,
      });
      ensurePeerHealthTimer?.();
      attachVoiceActivityDetector?.(participantId, audio);
      void playRemoteAudio?.(participantId, audio).catch((error) => {
        reportClientError?.("voice_remote_audio_play_error", error, { participantId, deviceSelected: Boolean(latest.selectedOutputDeviceId) });
        setVoiceError("O áudio remoto foi conectado, mas não conseguiu tocar. Verifique a saída de áudio selecionada.");
      });
    };
    peer.onconnectionstatechange = () => {
      const latest = state();
      if (peer.connectionState === "failed") {
        reportClientError?.("voice_peer_failed", new Error("A conexão de áudio falhou."), { participantId, iceConnectionState: peer.iceConnectionState });
        void recoverPeer?.(participantId, peer, { forceRelay: true });
      } else if (peer.connectionState === "closed") closePeer?.(participantId);
      else if (peer.connectionState === "disconnected") schedulePeerRecovery?.(participantId, 1500, true);
      else {
        if (["connected", "completed"].includes(peer.connectionState)) {
          const timer = latest.voicePeerConnectionTimers?.get(participantId);
          if (timer) clearTimeoutFn(timer);
          latest.voicePeerConnectionTimers?.delete(participantId);
          clearRecoveredVoiceError?.();
          if (!latest.voiceRemoteAudio?.has(participantId) && !latest.voicePeerAudioTrackTimers?.has(participantId)) {
            const audioTrackTimer = setTimeoutFn(() => {
              const after = state();
              after.voicePeerAudioTrackTimers?.delete(participantId);
              if (after.voicePeerConnections?.get(participantId) !== peer || after.voiceRemoteAudio?.has(participantId) || peer.connectionState === "closed") return;
              reportClientError?.("voice_peer_audio_track_timeout", new Error("O par de voz conectou, mas não entregou a faixa de áudio remota."), { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, forceRelay: Boolean(hasTurnServer?.()) });
              setVoiceError("A conexão de áudio foi estabelecida, mas a voz não chegou. Tentando recuperar…");
              void recoverPeer?.(participantId, peer, { forceRelay: true });
            }, audioTrackTimeoutMs);
            latest.voicePeerAudioTrackTimers?.set(participantId, audioTrackTimer);
          }
        }
        if (peer.connectionState === "connected" && !latest.voicePeerAudioHealth?.has(participantId)) {
          const now = Date.now();
          latest.voicePeerAudioHealth?.set(participantId, { firstTrackAt: now, lastProgressAt: now, lastBytes: 0, recoveryAttempted: false });
          ensurePeerHealthTimer?.();
        }
        clearPeerRecovery?.(participantId);
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed") {
        reportClientError?.("voice_ice_failed", new Error("A negociação ICE de áudio falhou."), { participantId });
        setVoiceError("Não foi possível atravessar a rede para conectar o áudio. Verifique o TURN da VPS.");
        void recoverPeer?.(participantId, peer, { forceRelay: true });
      } else if (peer.iceConnectionState === "disconnected") schedulePeerRecovery?.(participantId, 1500, true);
    };
    if (initiator) {
      peer.createOffer()
        .then(async (offer) => { await peer.setLocalDescription(offer); sendVoice?.({ type: "voice-signal", target: participantId, payload: { kind: "offer", sdp: peer.localDescription } }); })
        .catch((error) => reportClientError?.("voice_offer_error", error, { participantId }));
    }
    return peer;
  }

  return { createPeer };
}
