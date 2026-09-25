export function createBroadcastTrackController({ getState, negotiateBroadcastPeer }) {
  async function replaceBroadcastTracks(nextStream) {
    const { mediaMode, peerConnections } = getState();
    const nextTracks = {
      video: nextStream?.getVideoTracks?.()[0] || null,
      audio: nextStream?.getAudioTracks?.()[0] || null,
    };
    const operations = [];
    let audioTrackAdded = false;
    for (const peer of peerConnections.values()) {
      for (const [kind, track] of Object.entries(nextTracks)) {
        const senders = peer.getSenders().filter((candidate) => candidate.track?.kind === kind);
        const reservedSender = kind === "audio"
          ? peer.getTransceivers?.().find((transceiver) => transceiver.sender?.track?.kind === kind || transceiver.receiver?.track?.kind === kind)?.sender
          : null;
        const [sender, ...duplicates] = senders.length ? senders : (reservedSender ? [reservedSender] : []);
        if (sender) operations.push(sender.replaceTrack(track));
        else if (track) {
          peer.addTrack(track, nextStream);
          if (kind === "audio") audioTrackAdded = true;
        }
        for (const duplicate of duplicates) operations.push(duplicate.replaceTrack(null));
      }
    }
    await Promise.all(operations);
    if (nextTracks.audio && mediaMode === "p2p") {
      audioTrackAdded = true;
    }
    if (audioTrackAdded) {
      await Promise.all([...peerConnections.keys()].map(async (viewerId) => {
        const peer = peerConnections.get(viewerId);
        if (!peer || ["closed", "failed"].includes(peer.connectionState) || peer.signalingState !== "stable") return;
        await negotiateBroadcastPeer(viewerId);
      }));
    }
  }

  return { replaceBroadcastTracks };
}
