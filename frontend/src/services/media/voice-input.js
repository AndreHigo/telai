export function createVoiceAudioConstraints(profile, advancedOptions = {}) {
  const selectedProfile = profile === "studio"
    ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    : profile === "custom"
      ? advancedOptions
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

  return {
    echoCancellation: selectedProfile.echoCancellation,
    noiseSuppression: selectedProfile.noiseSuppression,
    autoGainControl: selectedProfile.autoGainControl,
    channelCount: 1,
  };
}

export function createSelectedVoiceAudioConstraints(profile, advancedOptions, selectedInputDeviceId = "") {
  const constraints = createVoiceAudioConstraints(profile, advancedOptions);
  if (selectedInputDeviceId) constraints.deviceId = { exact: selectedInputDeviceId };
  return constraints;
}

export function readNativeVoiceProcessingDetails(track) {
  const settings = track?.getSettings?.() || {};
  return {
    echoCancellation: typeof settings.echoCancellation === "boolean" ? settings.echoCancellation : null,
    noiseSuppression: typeof settings.noiseSuppression === "boolean" ? settings.noiseSuppression : null,
    autoGainControl: typeof settings.autoGainControl === "boolean" ? settings.autoGainControl : null,
    sampleRate: Number.isFinite(settings.sampleRate) ? settings.sampleRate : null,
    channelCount: Number.isFinite(settings.channelCount) ? settings.channelCount : null,
  };
}

export function createVoiceInputPipeline({
  getAudioContext,
  shouldProcess,
  getMicrophoneVolume,
  onNativeProcessingDetails,
  onNoiseSuppressionStatus,
  onProcessingError,
}) {
  const resources = new Map();

  function getResource(stream) {
    return resources.get(stream);
  }

  async function process(rawStream) {
    const shouldApplyMicrophoneVolume = getMicrophoneVolume() < 0.999;
    const shouldUseNativeSuppression = shouldProcess();
    if (shouldUseNativeSuppression) {
      onNativeProcessingDetails(readNativeVoiceProcessingDetails(rawStream?.getAudioTracks?.()[0]));
      onNoiseSuppressionStatus("native");
    } else {
      onNoiseSuppressionStatus("off");
    }

    if (!shouldApplyMicrophoneVolume) return rawStream;
    const AudioContextConstructor = getAudioContext();
    if (!AudioContextConstructor) return rawStream;

    let context;
    try {
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      await context.resume();
      const source = context.createMediaStreamSource(rawStream);
      const microphoneGain = context.createGain();
      microphoneGain.gain.setValueAtTime(getMicrophoneVolume(), context.currentTime);
      const destination = context.createMediaStreamDestination();
      source.connect(microphoneGain);
      microphoneGain.connect(destination);
      const processedStream = destination.stream;
      resources.set(processedStream, { rawStream, context, source, microphoneGain, destination });
      return processedStream;
    } catch (error) {
      try { await context?.close(); } catch {}
      onProcessingError(error);
      return rawStream;
    }
  }

  function stop(stream) {
    if (!stream) return;
    const resource = resources.get(stream);
    try { stream.getTracks().forEach((track) => track.stop()); } catch {}
    if (!resource) return;
    try { resource.rawStream?.getTracks().forEach((track) => track.stop()); } catch {}
    try { resource.source?.disconnect(); } catch {}
    try { resource.destination?.disconnect?.(); } catch {}
    void resource.context?.close().catch(() => {});
    resources.delete(stream);
  }

  function updateGain(stream, value = getMicrophoneVolume()) {
    const gain = resources.get(stream)?.microphoneGain;
    if (!gain) return false;
    const now = gain.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(value, now, 0.015);
    return true;
  }

  return { getResource, process, stop, updateGain };
}
