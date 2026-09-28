import { updateVoiceActivitySpeakingState, createVoiceSpeakingPublisher } from "../../voice-activity.js";

const VOICE_ACTIVITY_POLL_MS = 16;
const VOICE_ACTIVITY_RELEASE_MS = 120;
const VOICE_ACTIVITY_MIN_STATE_MS = 160;
const VOICE_ACTIVITY_CALIBRATION_MS = 32;
const VOICE_ACTIVITY_ONSET_GUARD_MS = 48;

export function createVoiceActivityController({
  getState,
  getAudioContext,
  reportClientError,
  onSpeakingStateChange,
  onRtcSpeakingStateChange,
  onTrackEnded,
} = {}) {
  const analyzers = new Map();
  const pendingIds = new Set();
  const tokens = new Map();
  const rtcStatSnapshots = new Map();
  let activityTimer = null;
  let rtcActivityPending = false;
  const speakingPublisher = createVoiceSpeakingPublisher({
    send: (message) => getState().sendVoice?.(message),
    isReady: (participantId) => participantId === getState().voiceClientId && getState().voiceSocketReady,
  });

  function notifySpeaking(participantId, speaking) {
    onSpeakingStateChange?.(participantId, speaking);
  }

  function detachAnalyzer(participantId) {
    const analyzer = analyzers.get(participantId);
    if (analyzer) {
      analyzer.track?.removeEventListener("ended", analyzer.onEnded);
      try { analyzer.source.disconnect(); } catch {}
      try { analyzer.analyser.disconnect(); } catch {}
      try { analyzer.silentGain.disconnect(); } catch {}
    }
    analyzers.delete(participantId);
    pendingIds.delete(participantId);
    tokens.delete(participantId);
    rtcStatSnapshots.delete(`activity:${participantId}`);
    for (const key of rtcStatSnapshots.keys()) if (key.startsWith(`${participantId}:`)) rtcStatSnapshots.delete(key);
    if (!analyzers.size && activityTimer) {
      window.clearInterval(activityTimer);
      activityTimer = null;
    }
  }

  function clearAnalyzer(participantId) {
    detachAnalyzer(participantId);
    notifySpeaking(participantId, false);
  }

  function ensureTimer() {
    if (!activityTimer) activityTimer = window.setInterval(poll, VOICE_ACTIVITY_POLL_MS);
  }

  function resetCalibration() {
    const calibrationUntil = Date.now() + VOICE_ACTIVITY_CALIBRATION_MS;
    for (const state of analyzers.values()) {
      state.calibrationUntil = calibrationUntil;
      state.silentSince = 0;
      state.speaking = false;
      notifySpeaking(state.participantId, false);
    }
  }

  async function attachStream(participantId, stream) {
    const current = getState();
    if (!participantId || !stream?.getAudioTracks?.().length || analyzers.has(participantId) || pendingIds.has(participantId)) return;
    if (participantId !== current.voiceClientId && current.voiceSpeakingSignalKnownParticipantIds?.has(participantId)) return;
    const context = getAudioContext();
    if (!context) {
      reportClientError("voice_activity_analyzer_unavailable", new Error("O analisador de voz não está disponível neste navegador."), { participantId, isDesktop: current.isDesktop });
      return;
    }
    pendingIds.add(participantId);
    const attachmentToken = Symbol(participantId);
    tokens.set(participantId, attachmentToken);
    try {
      if (context.state === "suspended") await context.resume();
      if (tokens.get(participantId) !== attachmentToken) return;
      const track = stream.getAudioTracks().find((candidate) => candidate.readyState === "live");
      if (!track) throw new Error("A faixa de áudio não está ativa para detectar fala.");
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const silentGain = context.createGain();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0;
      silentGain.gain.value = 0;
      source.connect(analyser).connect(silentGain).connect(context.destination);
      const onEnded = () => {
        if (analyzers.get(participantId)?.track !== track) return;
        clearAnalyzer(participantId);
        onTrackEnded?.(participantId, track);
      };
      track.addEventListener("ended", onEnded, { once: true });
      analyzers.set(participantId, {
        participantId,
        track,
        onEnded,
        source,
        analyser,
        silentGain,
        samples: new Float32Array(analyser.fftSize),
        speaking: false,
        silentSince: 0,
        noiseFloor: 0.004,
        previousSample: 0,
        previousAnalysisSample: 0,
        highpassState: 0,
        voiceBand: 0,
        highpassCoefficient: Math.exp((-2 * Math.PI * 140) / Math.max(context.sampleRate || 48000, 1)),
        voiceBandCoefficient: 1 - Math.exp((-2 * Math.PI * 4200) / Math.max(context.sampleRate || 48000, 1)),
        calibrationUntil: Date.now() + VOICE_ACTIVITY_CALIBRATION_MS,
        lastStateChangeAt: 0,
        lastDiagnosticAt: 0,
      });
      if (current.isDesktop) {
        const settings = track.getSettings?.() || {};
        reportClientError("voice_activity_analyzer_ready", new Error("Detector de fala inicializado."), { participantId, trackReadyState: track.readyState, trackEnabled: track.enabled, audioContextState: context.state, sampleRate: context.sampleRate, trackSampleRate: settings.sampleRate, channelCount: settings.channelCount, echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl });
      }
      ensureTimer();
    } catch (error) {
      reportClientError("voice_activity_analyzer_error", error, { participantId, isDesktop: current.isDesktop, audioContextState: context.state });
    } finally {
      pendingIds.delete(participantId);
      if (tokens.get(participantId) === attachmentToken) tokens.delete(participantId);
    }
  }

  function attachDetector(participantId, audio) {
    if (participantId !== getState().voiceClientId && getState().voiceSpeakingSignalKnownParticipantIds?.has(participantId)) return;
    void attachStream(participantId, audio?.srcObject);
  }

  function poll() {
    const now = Date.now();
    const current = getState();
    for (const state of analyzers.values()) {
      state.analyser.getFloatTimeDomainData(state.samples);
      let energy = 0;
      for (const sample of state.samples) energy += sample * sample;
      const rms = Math.sqrt(energy / state.samples.length);
      if (now < state.calibrationUntil) {
        state.noiseFloor = state.noiseFloor * 0.85 + Math.min(rms, 0.03) * 0.15;
        state.silentSince = 0;
        if (state.speaking) { state.speaking = false; notifySpeaking(state.participantId, false); }
        continue;
      }
      const automatic = current.voiceInputProfile !== "custom" || current.voiceSensitivityAuto;
      const sensitivity = automatic ? 0.5 : current.voiceSensitivity;
      const attackMultiplier = automatic ? 2.25 : 2.8 - sensitivity * 1.8;
      const releaseMultiplier = automatic ? 1.25 : 1.7 - sensitivity * 0.9;
      const attackBase = automatic ? 0.0015 : 0.004 - sensitivity * 0.0032;
      const releaseBase = automatic ? 0.0007 : 0.0015 - sensitivity * 0.0008;
      const attackThreshold = Math.max(0.003, state.noiseFloor * attackMultiplier + attackBase);
      const releaseThreshold = Math.max(0.0015, state.noiseFloor * releaseMultiplier + releaseBase);
      if (!state.speaking && rms < attackThreshold) state.noiseFloor = state.noiseFloor * 0.96 + Math.min(rms, 0.03) * 0.04;
      const wasSpeaking = state.speaking;
      let voiceBandEnergy = 0;
      let zeroCrossings = 0;
      let peak = 0;
      let previousSample = state.previousSample || 0;
      let previousAnalysisSample = state.previousAnalysisSample || 0;
      let highpassState = state.highpassState || 0;
      let voiceBand = state.voiceBand || 0;
      for (const sample of state.samples) {
        const absoluteSample = Math.abs(sample);
        peak = Math.max(peak, absoluteSample);
        const highpassed = state.highpassCoefficient * (highpassState + sample - previousSample);
        previousSample = sample;
        highpassState = highpassed;
        voiceBand += (highpassed - voiceBand) * state.voiceBandCoefficient;
        voiceBandEnergy += voiceBand * voiceBand;
        if ((sample >= 0) !== (previousAnalysisSample >= 0)) zeroCrossings += 1;
        previousAnalysisSample = sample;
      }
      state.previousSample = previousSample;
      state.previousAnalysisSample = previousAnalysisSample;
      state.highpassState = highpassState;
      state.voiceBand = voiceBand;
      const voiceBandRms = Math.sqrt(voiceBandEnergy / Math.max(state.samples.length, 1));
      const voiceBandRatio = voiceBandRms / Math.max(rms, 0.0001);
      const zeroCrossingRate = zeroCrossings / Math.max(state.samples.length, 1);
      const speechLike = voiceBandRatio >= 0.26 && zeroCrossingRate <= 0.48;
      const loudEnoughToOverrideBand = rms > attackThreshold * 1.8;
      const active = state.speaking
        ? rms > releaseThreshold && (voiceBandRatio >= 0.16 || rms > attackThreshold * 1.35)
        : rms > attackThreshold && (speechLike || loudEnoughToOverrideBand);
      const changed = updateVoiceActivitySpeakingState(state, active, now, { releaseMs: VOICE_ACTIVITY_RELEASE_MS, minimumSpeakingMs: VOICE_ACTIVITY_MIN_STATE_MS, onsetGuardMs: VOICE_ACTIVITY_ONSET_GUARD_MS });
      if (changed) notifySpeaking(state.participantId, state.speaking);
      if (wasSpeaking !== state.speaking && state.participantId === current.voiceClientId) speakingPublisher.publish(state.participantId, state.speaking);
      if (current.isDesktop && now - (state.lastDiagnosticAt || 0) >= 2000) {
        state.lastDiagnosticAt = now;
        reportClientError("voice_activity_sample", new Error("Amostra numérica do detector de fala."), { participantId: state.participantId, rms: Number(rms.toFixed(5)), peak: Number(peak.toFixed(5)), voiceBandRatio: Number(voiceBandRatio.toFixed(5)), zeroCrossingRate: Number(zeroCrossingRate.toFixed(5)), speechLike, attackThreshold: Number(attackThreshold.toFixed(5)), releaseThreshold: Number(releaseThreshold.toFixed(5)), noiseFloor: Number(state.noiseFloor.toFixed(5)), trackReadyState: state.track?.readyState, trackEnabled: state.track?.enabled });
      }
      if (current.isDesktop && wasSpeaking !== state.speaking) reportClientError("voice_activity_state", new Error(state.speaking ? "Detector de fala: falando." : "Detector de fala: silencioso."), { participantId: state.participantId, speaking: state.speaking, rms: Number(rms.toFixed(5)), peak: Number(peak.toFixed(5)), voiceBandRatio: Number(voiceBandRatio.toFixed(5)), zeroCrossingRate: Number(zeroCrossingRate.toFixed(5)), speechLike, attackThreshold: Number(attackThreshold.toFixed(5)), releaseThreshold: Number(releaseThreshold.toFixed(5)), noiseFloor: Number(state.noiseFloor.toFixed(5)), trackReadyState: state.track?.readyState, trackEnabled: state.track?.enabled });
    }
  }

  async function pollRtcActivity() {
    if (rtcActivityPending || !getState().voicePeerConnections?.size) return;
    rtcActivityPending = true;
    try {
      const detectedByParticipant = new Map();
      for (const [participantId, peer] of getState().voicePeerConnections) {
        if (peer.connectionState === "closed" || typeof peer.getStats !== "function") continue;
        const stats = await peer.getStats();
        for (const report of stats.values()) {
          const isAudio = report.kind === "audio" || report.mediaType === "audio";
          const isInbound = report.type === "inbound-rtp" && isAudio;
          const isOutboundLocal = report.type === "outbound-rtp" && isAudio;
          if (!isInbound && !isOutboundLocal) continue;
          const targetParticipantId = isOutboundLocal ? getState().voiceClientId : participantId;
          if (!targetParticipantId) continue;
          let active = detectedByParticipant.get(targetParticipantId) === true;
          if (typeof report.audioLevel === "number") {
            active ||= report.audioLevel > 0.045;
            detectedByParticipant.set(targetParticipantId, active);
            continue;
          }
          if (typeof report.totalAudioEnergy !== "number" || typeof report.totalSamplesDuration !== "number") continue;
          const snapshotKey = `${targetParticipantId}:${report.id}`;
          const previous = rtcStatSnapshots.get(snapshotKey);
          rtcStatSnapshots.set(snapshotKey, { energy: report.totalAudioEnergy, duration: report.totalSamplesDuration });
          if (!previous) continue;
          const energyDelta = Math.max(0, report.totalAudioEnergy - previous.energy);
          const durationDelta = Math.max(0, report.totalSamplesDuration - previous.duration);
          if (durationDelta > 0) {
            active ||= Math.sqrt(energyDelta / durationDelta) > 0.055;
            detectedByParticipant.set(targetParticipantId, active);
          }
        }
      }
      for (const participantId of new Set([...getState().voicePeerConnections.keys(), getState().voiceClientId].filter(Boolean))) {
        const active = detectedByParticipant.get(participantId) === true;
        const stateKey = `activity:${participantId}`;
        const state = rtcStatSnapshots.get(stateKey) || { silentSince: 0, speaking: false };
        const now = Date.now();
        if (active) {
          state.silentSince = 0;
          state.speaking = true;
          (onRtcSpeakingStateChange || notifySpeaking)(participantId, true);
        } else if (state.speaking) {
          state.silentSince ||= now;
          if (now - state.silentSince > VOICE_ACTIVITY_RELEASE_MS) {
            state.speaking = false;
            (onRtcSpeakingStateChange || notifySpeaking)(participantId, false);
          }
        }
        rtcStatSnapshots.set(stateKey, state);
      }
    } catch (error) {
      reportClientError("voice_rtc_activity_error", error, { isDesktop: getState().isDesktop });
    } finally {
      rtcActivityPending = false;
    }
  }

  function reset() {
    for (const participantId of analyzers.keys()) detachAnalyzer(participantId);
    rtcStatSnapshots.clear();
    speakingPublisher.reset();
    if (activityTimer) window.clearInterval(activityTimer);
    activityTimer = null;
  }

  return {
    attachStream,
    attachDetector,
    clearAnalyzer,
    ensureTimer,
    resetCalibration,
    pollRtcActivity,
    getAnalyzer: (participantId) => analyzers.get(participantId),
    publishSpeaking: (participantId, speaking) => speakingPublisher.publish(participantId, speaking),
    resetPublisher: () => speakingPublisher.reset(),
    reset,
  };
}
