export function createVoiceTrackSyncService({
  getLocalStream,
  getMuteState,
  getPeers,
  negotiationInFlight,
  sendVoiceSignal,
  reportDiagnostic,
  bindLocalTrack,
}) {
  async function negotiate(participantId, peer, reason = "audio_track_added") {
    if (!peer || peer.connectionState === "closed" || peer.signalingState !== "stable" || negotiationInFlight.has(participantId)) return;
    negotiationInFlight.add(participantId);
    try {
      const offer = await peer.createOffer();
      if (peer.signalingState !== "stable") return;
      await peer.setLocalDescription(offer);
      sendVoiceSignal({ type: "voice-signal", target: participantId, payload: { kind: "offer", sdp: peer.localDescription } });
      reportDiagnostic("voice_peer_renegotiation_started", new Error("Faixa de áudio local publicada após a entrada."), { participantId, reason });
    } catch (error) {
      reportDiagnostic("voice_peer_renegotiation_error", error, { participantId, reason, signalingState: peer.signalingState });
    } finally {
      negotiationInFlight.delete(participantId);
    }
  }

  async function sync({ negotiateMissing = true } = {}) {
    const stream = getLocalStream();
    const track = stream?.getAudioTracks?.().find((candidate) => candidate.readyState === "live");
    if (!track) return false;
    track.enabled = !getMuteState();
    bindLocalTrack(track);
    let syncFailed = false;
    for (const [participantId, peer] of getPeers()) {
      if (!peer || peer.connectionState === "closed") continue;
      try {
        const sender = peer.getSenders?.().find((candidate) => candidate.track?.kind === "audio");
        if (sender) {
          if (sender.track !== track) await sender.replaceTrack(track);
          continue;
        }
        const audioTransceiver = peer.getTransceivers?.().find((transceiver) => transceiver.sender && !transceiver.sender.track && transceiver.receiver?.track?.kind === "audio");
        if (audioTransceiver) await audioTransceiver.sender.replaceTrack(track);
        else peer.addTrack(track, stream);
        if (negotiateMissing) void negotiate(participantId, peer);
      } catch (error) {
        syncFailed = true;
        reportDiagnostic("voice_local_track_sync_error", error, { participantId, trackReadyState: track.readyState, signalingState: peer.signalingState });
      }
    }
    return !syncFailed;
  }

  return { negotiate, sync };
}
