// Synthesized notification beeps (Web Audio API) - no audio asset to
// ship/host. One AudioContext is created lazily and reused for every call.
let audioCtx = null;

const getContext = () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
};

const playTone = (ctx, frequency, startTime, duration, volume = 0.15) => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
};

// variant:
//  - "default" - a single neutral beep (chat messages)
//  - "success" - a bright two-note ascending chime (e.g. request completed)
//  - "error"   - a single lower, flatter tone (e.g. request rejected)
export function playNotificationSound(variant = "default") {
  try {
    const ctx = getContext();
    if (!ctx) return;
    // Browsers create a new AudioContext in "suspended" state until a user
    // gesture resumes it - without this, the very first notification sound
    // (and sometimes every one, depending on the browser) silently plays
    // nothing.
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    if (variant === "success") {
      playTone(ctx, 660, now, 0.18);
      playTone(ctx, 880, now + 0.12, 0.25);
    } else if (variant === "error") {
      playTone(ctx, 392, now, 0.3, 0.13);
    } else {
      playTone(ctx, 880, now, 0.35);
    }
  } catch (error) {
    // Audio not available/blocked by the browser - not worth surfacing
  }
}
