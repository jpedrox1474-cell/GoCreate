import { useCallback, useEffect, useRef, useState } from 'react';

export function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
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
      return 'Permissão do microfone negada';
    case 'network':
      return 'Erro de rede do reconhecimento — verifique a conexão';
    case 'aborted':
      return '';
    case 'language-not-supported':
      return 'Idioma de reconhecimento não suportado neste navegador';
    case 'unsupported':
      return 'Reconhecimento de voz indisponível neste navegador (use Chrome)';
    default:
      return code ? `Erro no reconhecimento (${code})` : 'Erro no reconhecimento de voz';
  }
}

/**
 * Robust Web Speech STT with continuous listen, auto-restart, mic volume meter.
 *
 * @param {object} options
 * @param {(text: string) => void} [options.onCommit] Called when listening stops with transcript
 * @param {(text: string) => void} [options.onInterim] Live interim/final transcript while listening
 * @param {(message: string, code: string) => void} [options.onError]
 * @param {string} [options.lang='pt-BR']
 * @param {boolean} [options.autoCommitOnSilence=true] Finish after silence once we have speech
 * @param {number} [options.silenceMs=1800]
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
  const finalTranscriptRef = useRef('');
  const silenceTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const volumeRafRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);

  const onCommitRef = useRef(onCommit);
  const onInterimRef = useRef(onInterim);
  const onErrorRef = useRef(onError);
  onCommitRef.current = onCommit;
  onInterimRef.current = onInterim;
  onErrorRef.current = onError;

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
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return true;
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
      return true;
    } catch {
      return false;
    }
  }, []);

  const detachRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const commitAndStop = useCallback(
    (text) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      wantListenRef.current = false;
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

  const bindRecognitionHandlers = useCallback(
    (recognition) => {
      recognition.onresult = (event) => {
        if (!wantListenRef.current || finishedRef.current) return;
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
        const live = (finalText || interim).trim();
        setTranscript(live);
        onInterimRef.current?.(live);
        setError('');
        if (finalText) scheduleSilenceCommit();
        else clearSilenceTimer();
      };

      recognition.onerror = (event) => {
        const code = event?.error || 'unknown';
        if (code === 'aborted') return;

        const msg = speechErrorMessage(code);
        if (msg) {
          setError(msg);
          onErrorRef.current?.(msg, code);
        }

        if (code === 'not-allowed' || code === 'service-not-allowed') {
          commitAndStop(finalTranscriptRef.current);
          return;
        }

        // no-speech / network: keep listening — onend will restart
        if (code === 'no-speech' && !finalTranscriptRef.current.trim()) {
          // stay in listening; restart via onend
          return;
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (!wantListenRef.current || finishedRef.current) return;

        // Chrome often stops after silence; restart while user still wants to listen
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (!wantListenRef.current || finishedRef.current) return;
          try {
            const Ctor = getSpeechRecognitionCtor();
            if (!Ctor) return;
            const next = new Ctor();
            next.lang = lang;
            next.interimResults = true;
            next.continuous = true;
            next.maxAlternatives = 1;
            recognitionRef.current = next;
            bindRecognitionHandlers(next);
            next.start();
          } catch {
            /* ignore restart race */
          }
        }, 120);
      };
    },
    [lang, scheduleSilenceCommit, clearSilenceTimer, clearRestartTimer, commitAndStop]
  );

  const start = useCallback(async () => {
    if (wantListenRef.current) return;

    stopTts();
    clearSilenceTimer();
    clearRestartTimer();
    detachRecognition();
    stopVolumeMeter();

    finishedRef.current = false;
    wantListenRef.current = true;
    finalTranscriptRef.current = '';
    setTranscript('');
    setError('');
    setListening(true);

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      const msg = speechErrorMessage('unsupported');
      setError(msg);
      onErrorRef.current?.(msg, 'unsupported');
      wantListenRef.current = false;
      setListening(false);
      return;
    }

    const micOk = await startVolumeMeter();
    if (!wantListenRef.current) {
      stopVolumeMeter();
      return;
    }
    if (!micOk && !navigator.mediaDevices?.getUserMedia) {
      // Still try STT — some browsers grant mic only via SpeechRecognition
    }

    try {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;
      bindRecognitionHandlers(recognition);
      recognition.start();
    } catch {
      const msg = 'Não foi possível iniciar o microfone';
      setError(msg);
      onErrorRef.current?.(msg, 'start-failed');
      wantListenRef.current = false;
      setListening(false);
      stopVolumeMeter();
    }
  }, [
    lang,
    clearSilenceTimer,
    clearRestartTimer,
    detachRecognition,
    stopVolumeMeter,
    startVolumeMeter,
    bindRecognitionHandlers,
  ]);

  const stop = useCallback(() => {
    const text = finalTranscriptRef.current;
    commitAndStop(text);
  }, [commitAndStop]);

  const cancel = useCallback(() => {
    finishedRef.current = true;
    wantListenRef.current = false;
    clearSilenceTimer();
    clearRestartTimer();
    detachRecognition();
    stopVolumeMeter();
    finalTranscriptRef.current = '';
    setTranscript('');
    setListening(false);
    setVolume(0);
    setError('');
  }, [clearSilenceTimer, clearRestartTimer, detachRecognition, stopVolumeMeter]);

  useEffect(
    () => () => {
      wantListenRef.current = false;
      finishedRef.current = true;
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
    supported: !!getSpeechRecognitionCtor(),
  };
}
