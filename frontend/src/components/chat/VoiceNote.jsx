import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Trash2, Send, Play, Pause, Loader2 } from "lucide-react";

export const VOICE_NOTE_MAX_SECONDS = 5 * 60;

// Container formats MediaRecorder can produce, best first. Chrome/Firefox do
// webm/ogg opus; Safari only does mp4/aac.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function extensionFor(mime) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const isVoiceRecordingSupported = () =>
  typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

// Records from the microphone. start() asks for mic permission; stop(send)
// ends the recording and, when send is true, hands {file, duration} to onDone.
export function useVoiceRecorder({ onDone, onError }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const sendOnStopRef = useRef(false);
  // Latest callbacks, so a recording started earlier still reports to the
  // current handler (e.g. a reply target picked while recording).
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  const stop = useCallback((send) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    sendOnStopRef.current = !!send;
    if (recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const shouldSend = sendOnStopRef.current;
        cleanup();
        if (shouldSend && blob.size > 0 && duration >= 0.5) {
          const file = new File([blob], `voice-note-${Date.now()}.${extensionFor(type)}`, { type: type.split(";")[0] });
          onDoneRef.current?.({ file, duration: Math.round(duration * 10) / 10 });
        }
      };
      startedAtRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const secs = (Date.now() - startedAtRef.current) / 1000;
        setElapsed(secs);
        if (secs >= VOICE_NOTE_MAX_SECONDS) stop(true);
      }, 200);
    } catch (err) {
      cleanup();
      onErrorRef.current?.(err);
    }
  }, [cleanup, stop]);

  // Never leave the mic on if the chat window closes mid-recording.
  useEffect(
    () => () => {
      sendOnStopRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  return { recording, elapsed, start, stop };
}

// Composer bar shown while recording: live timer, discard, and send.
export function VoiceRecordingBar({ elapsed, onCancel, onSend }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 border-t border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900">
      <button onClick={onCancel} className="p-1.5 text-gray-500 hover:text-red-500" title="Discard voice note">
        <Trash2 className="w-4 h-4" />
      </button>
      <div className="flex-1 flex items-center gap-2 h-8 px-2 rounded bg-gray-200 dark:bg-zinc-700 text-sm text-gray-900 dark:text-white">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="tabular-nums">{formatDuration(elapsed)}</span>
        <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">
          Recording... (max {formatDuration(VOICE_NOTE_MAX_SECONDS)})
        </span>
      </div>
      <button onClick={onSend} className="p-1.5 text-emerald-500 hover:text-emerald-600" title="Send voice note">
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}

export function VoiceNoteButton({ onClick, disabled, title = "Record voice note" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="p-1 h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50"
      title={title}
    >
      <Mic className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
    </button>
  );
}

// Play/pause + seekable progress bar for a voice note message. The file is
// fetched as a blob on first play: MediaRecorder webm files carry no
// duration header and the file endpoint doesn't serve byte ranges, so
// seeking on a blob URL is the reliable way across browsers. The duration
// saved with the message is used for display for the same reason.
export function VoiceNotePlayer({ src, duration: savedDuration, isOwn }) {
  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(savedDuration || 0);
  const [failed, setFailed] = useState(false);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    []
  );

  const ensureAudio = async () => {
    if (audioRef.current) return audioRef.current;
    setLoading(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      blobUrlRef.current = URL.createObjectURL(blob);
      const audio = new Audio(blobUrlRef.current);
      audio.ontimeupdate = () => setCurrent(audio.currentTime);
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      };
      audio.onended = () => {
        setPlaying(false);
        setCurrent(0);
      };
      audio.onpause = () => setPlaying(false);
      audio.onplay = () => setPlaying(true);
      audioRef.current = audio;
      return audio;
    } catch (e) {
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    const audio = await ensureAudio();
    if (!audio) return;
    if (audio.paused) {
      // Only one voice note plays at a time across the app.
      window.dispatchEvent(new CustomEvent("voice-note-play", { detail: audio }));
      audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  };

  useEffect(() => {
    const onOtherPlay = (e) => {
      if (audioRef.current && e.detail !== audioRef.current) audioRef.current.pause();
    };
    window.addEventListener("voice-note-play", onOtherPlay);
    return () => window.removeEventListener("voice-note-play", onOtherPlay);
  }, []);

  const seek = async (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const audio = await ensureAudio();
    if (!audio) return;
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const progress = duration ? Math.min(100, (current / duration) * 100) : 0;
  const track = isOwn ? "bg-white/30" : "bg-gray-400/40 dark:bg-zinc-500/50";
  const fill = isOwn ? "bg-white" : "bg-emerald-500";

  if (failed) return <div className="text-xs italic opacity-75 mb-1">Voice note unavailable</div>;

  return (
    <div className="flex items-center gap-2 mb-1 min-w-[180px]">
      <button
        onClick={toggle}
        className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${isOwn ? "bg-white/20 hover:bg-white/30" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
        title={playing ? "Pause" : "Play voice note"}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`relative h-1.5 rounded-full cursor-pointer ${track}`} onClick={seek}>
          <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-1 text-[10px] opacity-80 tabular-nums">
          <Mic className="w-2.5 h-2.5" />
          {playing || current > 0 ? `${formatDuration(current)} / ${formatDuration(duration)}` : formatDuration(duration)}
        </div>
      </div>
    </div>
  );
}
