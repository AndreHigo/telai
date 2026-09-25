export function createBroadcastAudioMixerController({ getAudioContext, reportClientError }) {
  let context = null;
  let destination = null;

  async function stop() {
    const previousDestination = destination;
    destination = null;
    try { previousDestination?.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    const previousContext = context;
    context = null;
    try { await previousContext?.close?.(); } catch {}
  }

  async function mix(...tracks) {
    const audioTracks = tracks.filter(Boolean);
    await stop();
    if (!audioTracks.length) return null;
    if (audioTracks.length === 1) return audioTracks[0];
    const AudioContextConstructor = getAudioContext();
    if (!AudioContextConstructor) return audioTracks[0];
    const nextContext = new AudioContextConstructor({ latencyHint: "interactive" });
    try {
      await nextContext.resume();
      const nextDestination = nextContext.createMediaStreamDestination();
      audioTracks.forEach((track) => {
        const source = nextContext.createMediaStreamSource(new MediaStream([track]));
        const gain = nextContext.createGain();
        gain.gain.value = 1;
        source.connect(gain).connect(nextDestination);
      });
      context = nextContext;
      destination = nextDestination;
      return nextDestination.stream.getAudioTracks()[0] || audioTracks[0];
    } catch (error) {
      try { await nextContext.close(); } catch {}
      reportClientError("broadcast_audio_mix_fallback", error, { trackCount: audioTracks.length });
      return audioTracks[0];
    }
  }

  return { mix, stop };
}
