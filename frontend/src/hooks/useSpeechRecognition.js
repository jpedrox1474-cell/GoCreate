import { useCallback, useEffect, useRef, useState } from 'react';

const NO_SPEECH_TIP =
  'Sem fala detectada. Fale mais perto do microfone ou digite o prompt abaixo.';
const MAX_NO_SPEECH_RETRIES = 3;

export function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSecureSpeechContext() {
  if (typeof window === 'undefined') return false;
  return (
    window.isSecureContext === true ||
    window.location?.hostname === 'localhost' ||
    window.location?.hostname === '127.0.0.1'
  );
}

export function stopTts() {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
}

/** Map Web Speech API error codes to Portuguese UX messages. */
export function speechErrorMessage(code) {
  switch (code) {
    case 'no-speech':
      return 'Sem fala detectada — fale mais perto do microfone';
    case 'audio-capture':
      return 'Não foi possível capturar o microfone. Verifique o dispositivo.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Permissão do microfone negada. Clique no cadeado da barra de endereço e permita o microfone.';
    case 'network':
      return 'Erro de rede do reconhecimento — verifique a conexão';
    case 'aborted':
      return '';
    case 'language-not-supported':
      return 'Idioma de reconhecimento não suportado neste navegador';
    case 'unsupported':
      return 'Reconhecimento de voz indisponível neste navegador (use Chrome)';
    case 'insecure':
      return 'Microfone só funciona em HTTPS (ou localhost).';
    case 'mic-denied':
      return 'Permissão do microfone negada. Clique no cadeado da barra de endereço e permita o microfone.';
    case 'mic-unavailable':
      return 'Nenhum microfone encontrado. Conecte um fone/headset e tente de novo.';
    default:
      return code ? `Erro no reconhecimento (${code})` : 'Erro no reconhecimento de voz';
  }
}

function mapGetUserMediaError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return speechErrorMessage('mic-denied');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return speechErrorMessage('mic-unavailable');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Microfone em uso por outro app. Feche Discord/Zoom/Synapse e tente de novo.';
  }
  return 'Não foi possível acessar o microfone.';
}

/**
 * Robust Web Speech STT with continuous listen, auto-restart, mic volume meter.
 *
 * Always requests getUserMedia before SpeechRecognition (Chrome unlock).
 * On audio-capture (common with exclusive headset mode), releases the stream
 * and retries recognition alone.
 */
export function useSpeechRecognition({
  onCommit,
  onInterim,
  onError,
  lang = 'pt-BR',
  autoCommitOnSilence = true,
  silenceMs = 1800,
} = {}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState('');

  const recognitionRef = useRef(null);
  const wantListenRef = useRef(false);
  const finishedRef = useRef(false);
  const startingRef = useRef(false);
  const startedRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const silenceTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const volumeRafRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const noSpeechCountRef = useRef(0);
  const releasedMicForSttRef = useRef(false);
  const bindHandlersRef = useRef(null);

  const onCommitRef = useRef(onCommit);
  const onInterimRef = useRef(onInterim);
  const onErrorRef = useRef(onError);
  onCommitRef.current = onCommit;
  onInterimRef.current = onInterim;
  onErrorRef.current = onError;

  const reportError = useCallback((msg, code) => {
    if (!msg) return;
    setError(msg);
    onErrorRef.current?.(msg, code);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopVolumeMeter = useCallback(() => {
    if (volumeRafRef.current) {
      cancelAnimationFrame(volumeRafRef.current);
      volumeRafRef.current = null;
    }
    try {
      mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    mediaStreamRef.current = null;
    try {
      audioCtxRef.current?.close?.();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setVolume(0);
  }, []);

  const startVolumeMeter = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, reason: 'no-api' };
    }
    try {
      // Prefer simple audio:true — fewer exclusive-mode conflicts on Windows headsets
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch {
            /* ignore */
          }
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current || !wantListenRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) sum += data[i];
          const avg = sum / data.length / 255;
          setVolume(Math.min(1, avg * 2.2));
          volumeRafRef.current = requestAnimationFrame(tick);
        };
        volumeRafRef.current = requestAnimationFrame(tick);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'denied', message: mapGetUserMediaError(err) };
    }
  }, []);

  const safeRecognitionStart = useCallback((recognition) => {
    if (!recognition || startedRef.current) return false;
    try {
      recognition.start();
      startedRef.current = true;
      return true;
    } catch (err) {
      const name = err?.name || '';
      if (name === 'InvalidStateError') {
        // Already started — treat as ok
        startedRef.current = true;
        return true;
      }
      return false;
    }
  }, []);

  const safeRecognitionStop = useCallback((recognition) => {
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      /* already stopped */
    }
    startedRef.current = false;
  }, []);

  const detachRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    startedRef.current = false;
    if (!rec) return;
    safeRecognitionStop(rec);
  }, [safeRecognitionStop]);

  const commitAndStop = useCallback(
    (text) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      wantListenRef.current = false;
      startingRef.current = false;
      clearSilenceTimer();
      clearRestartTimer();
      detachRecognition();
      stopVolumeMeter();
      setListening(false);
      setVolume(0);
      const trimmed = (text || finalTranscriptRef.current || '').trim();
      setTranscript(trimmed);
      onCommitRef.current?.(trimmed);
    },
    [clearSilenceTimer, clearRestartTimer, detachRecognition, stopVolumeMeter]
  );

  const scheduleSilenceCommit = useCallback(() => {
    if (!autoCommitOnSilence) return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      if (!wantListenRef.current || finishedRef.current) return;
      const text = finalTranscriptRef.current.trim();
      if (text) commitAndStop(text);
    }, silenceMs);
  }, [autoCommitOnSilence, silenceMs, clearSilenceTimer, commitAndStop]);

  const createAndStartRecognition = useCallback(
    (options = {}) => {
      const { releaseMicFirst = false } = options;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return false;

      if (releaseMicFirst) {
        stopVolumeMeter();
        releasedMicForSttRef.current = true;
      }

      try {
        const recognition = new Ctor();
        recognition.lang = lang;
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;
        startedRef.current = false;
        bindHandlersRef.current?.(recognition);
        return safeRecognitionStart(recognition);
      } catch {
        return false;
      }
    },
    [lang, stopVolumeMeter, safeRecognitionStart]
  );

  const bindRecognitionHandlers = useCallback(
    (recognition) => {
      recognition.onresult = (event) => {
        if (!wantListenRef.current || finishedRef.current) return;
        noSpeechCountRef.current = 0;
        let interim = '';
        let finalText = finalTranscriptRef.current;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalText = `${finalText} ${piece}`.trim();
          } else {
            interim += piece;
          }
        }
        finalTranscriptRef.current = finalText;
        const live = `${finalText}${interim ? ` ${interim}` : ''}`.trim();
        setTranscript(live);
        onInterimRef.current?.(live);
        setError('');
        if (finalText) scheduleSilenceCommit();
        else clearSilenceTimer();
      };

      recognition.onerror = (event) => {
        const code = event?.error || 'unknown';
        if (code === 'aborted') return;

        if (code === 'not-allowed' || code === 'service-not-allowed') {
          reportError(speechErrorMessage(code), code);
          commitAndStop(finalTranscriptRef.current);
          return;
        }

        if (code === 'audio-capture') {
          // Mic exclusive lock (Razer/WASAPI): release getUserMedia and retry STT alone
          if (!releasedMicForSttRef.current && wantListenRef.current) {
            releasedMicForSttRef.current = true;
            stopVolumeMeter();
            reportError(
              'Microfone ocupado — liberando e tentando de novo…',
              code
            );
            // onend will restart; force restart now if already ended
            return;
          }
          reportError(speechErrorMessage(code), code);
          return;
        }

        if (code === 'no-speech') {
          noSpeechCountRef.current += 1;
          if (noSpeechCountRef.current >= MAX_NO_SPEECH_RETRIES) {
            reportError(NO_SPEECH_TIP, 'no-speech');
          }
          // Do not commit empty — keep listening; onend restarts
          return;
        }

        const msg = speechErrorMessage(code);
        if (msg) reportError(msg, code);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        startedRef.current = false;
        if (!wantListenRef.current || finishedRef.current) return;

        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (!wantListenRef.current || finishedRef.current) return;

          // After audio-capture, restart without holding the MediaStream
          const releaseMic = releasedMicForSttRef.current;
          const ok = createAndStartRecognition({ releaseMicFirst: releaseMic });
          if (!ok) {
            reportError('Não foi possível reiniciar o microfone', 'restart-failed');
            wantListenRef.current = false;
            startingRef.current = false;
            setListening(false);
            stopVolumeMeter();
          }
        }, 150);
      };
    },
    [
      scheduleSilenceCommit,
      clearSilenceTimer,
      clearRestartTimer,
      commitAndStop,
      reportError,
      stopVolumeMeter,
      createAndStartRecognition,
    ]
  );

  bindHandlersRef.current = bindRecognitionHandlers;

  const start = useCallback(async () => {
    if (wantListenRef.current || startingRef.current) return;

    if (!isSecureSpeechContext()) {
      const msg = speechErrorMessage('insecure');
      reportError(msg, 'insecure');
      return;
    }

    stopTts();
    clearSilenceTimer();
    clearRestartTimer();
    detachRecognition();
    stopVolumeMeter();

    finishedRef.current = false;
    wantListenRef.current = true;
    startingRef.current = true;
    startedRef.current = false;
    releasedMicForSttRef.current = false;
    noSpeechCountRef.current = 0;
    finalTranscriptRef.current = '';
    setTranscript('');
    setError('');
    setListening(true);

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      const msg = speechErrorMessage('unsupported');
      reportError(msg, 'unsupported');
      wantListenRef.current = false;
      startingRef.current = false;
      setListening(false);
      return;
    }

    // 1) Explicit mic permission + volume meter BEFORE SpeechRecognition
    const mic = await startVolumeMeter();
    if (!wantListenRef.current) {
      startingRef.current = false;
      stopVolumeMeter();
      return;
    }

    if (!mic.ok) {
      if (mic.reason === 'denied') {
        // Still try SpeechRecognition — some Chrome builds prompt only via STT
        reportError(mic.message || speechErrorMessage('mic-denied'), 'mic-denied');
      }
      // If getUserMedia unavailable, continue to STT-only path
      releasedMicForSttRef.current = true;
    }

    // 2) Start recognition (safe — never double-start)
    const ok = createAndStartRecognition({
      releaseMicFirst: !mic.ok,
    });
    startingRef.current = false;

    if (!ok) {
      const msg = 'Não foi possível iniciar o microfone';
      reportError(msg, 'start-failed');
      wantListenRef.current = false;
      setListening(false);
      stopVolumeMeter();
    }
  }, [
    clearSilenceTimer,
    clearRestartTimer,
    detachRecognition,
    stopVolumeMeter,
    startVolumeMeter,
    createAndStartRecognition,
    reportError,
  ]);

  const stop = useCallback(() => {
    const text = finalTranscriptRef.current;
    commitAndStop(text);
  }, [commitAndStop]);

  const cancel = useCallback(() => {
    finishedRef.current = true;
    wantListenRef.current = false;
    startingRef.current = false;
    clearSilenceTimer();
    clearRestartTimer();
    detachRecognition();
    stopVolumeMeter();
    finalTranscriptRef.current = '';
    noSpeechCountRef.current = 0;
    setTranscript('');
    setListening(false);
    setVolume(0);
    setError('');
  }, [clearSilenceTimer, clearRestartTimer, detachRecognition, stopVolumeMeter]);

  useEffect(
    () => () => {
      wantListenRef.current = false;
      finishedRef.current = true;
      startingRef.current = false;
      clearSilenceTimer();
      clearRestartTimer();
      detachRecognition();
      stopVolumeMeter();
    },
    [clearSilenceTimer, clearRestartTimer, detachRecognition, stopVolumeMeter]
  );

  return {
    listening,
    transcript,
    volume,
    error,
    start,
    stop,
    cancel,
    supported: !!getSpeechRecognitionCtor() && isSecureSpeechContext(),
  };
}
