export function createVoiceCaptureService({
  getUserMedia,
  getAudioConstraints,
  getSelectedInputDeviceId,
  getSelectionRevision,
  rememberCapturedInputDevice,
  processVoiceInputStream,
  stopVoiceInputStream,
  isUnavailableVoiceInputError,
  clearUnavailableInputDevice,
  onFallbackStream,
}) {
  async function capture({
    expectedDeviceId = getSelectedInputDeviceId(),
    selectionRevision = getSelectionRevision(),
    fallbackToDefault = true,
  } = {}) {
    const requestedDeviceId = expectedDeviceId || "";
    let stream;
    let capturedStream;
    try {
      const constraints = getAudioConstraints();
      if (requestedDeviceId) constraints.deviceId = { exact: requestedDeviceId };
      stream = await getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("Nenhum microfone foi encontrado.");
      const capturedDevice = rememberCapturedInputDevice(track, requestedDeviceId);
      if (selectionRevision !== getSelectionRevision() || requestedDeviceId !== getSelectedInputDeviceId()) {
        const error = new Error("A seleção do microfone mudou durante a captura.");
        error.name = "SelectedDeviceCaptureSupersededError";
        throw error;
      }
      capturedStream = await processVoiceInputStream(stream);
      if (selectionRevision !== getSelectionRevision() || requestedDeviceId !== getSelectedInputDeviceId()) {
        const error = new Error("A seleção do microfone mudou durante o processamento.");
        error.name = "SelectedDeviceCaptureSupersededError";
        throw error;
      }
      return { stream: capturedStream, device: capturedDevice };
    } catch (error) {
      if (capturedStream) stopVoiceInputStream(capturedStream);
      else if (stream) stream.getTracks().forEach((track) => track.stop());

      if (fallbackToDefault && requestedDeviceId && isUnavailableVoiceInputError(error) && getSelectedInputDeviceId() === requestedDeviceId) {
        clearUnavailableInputDevice(requestedDeviceId);
        try {
          const fallback = await capture({
            expectedDeviceId: "",
            selectionRevision,
            fallbackToDefault: false,
          });
          onFallbackStream?.(fallback.stream);
          return fallback;
        } catch (fallbackError) {
          fallbackError.voiceInputFallbackAttempted = true;
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  return { capture };
}
