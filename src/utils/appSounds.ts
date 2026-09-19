export const APP_SOUND_PATHS = {
  'message-in': '/sounds/message-in.wav',
  'message-out': '/sounds/message-out.wav',
  'incoming-call': '/sounds/incoming-call.wav',
  'outgoing-call': '/sounds/outgoing-call.wav',
  'call-connected': '/sounds/call-connected.wav',
  'call-ended': '/sounds/call-ended.wav',
  encounter: '/sounds/encounter.wav',
  'friend-request': '/sounds/friend-request.wav',
  match: '/sounds/match.wav',
  'study-room': '/sounds/study-room.wav',
  success: '/sounds/success.wav',
  error: '/sounds/error.wav',
} as const;

export type AppSoundName = keyof typeof APP_SOUND_PATHS;

interface PlaySoundOptions {
  loop?: boolean;
  volume?: number;
  cooldownMs?: number;
  /** Background tabs use the operating system's Web Push sound instead. */
  allowWhenHidden?: boolean;
}

const SOUND_PREFERENCE_KEY = 'tvu-app-sounds-enabled';
const buffers = new Map<AppSoundName, AudioBuffer>();
const sources = new Map<AppSoundName, Set<AudioBufferSourceNode>>();
const fallbackAudio = new Map<AppSoundName, HTMLAudioElement>();
const generations = new Map<AppSoundName, number>();
const lastPlayedAt = new Map<AppSoundName, number>();

let audioContext: AudioContext | null = null;
let loadPromise: Promise<void> | null = null;
let removeUnlockListeners: (() => void) | null = null;

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

export const areAppSoundsEnabled = (): boolean => {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== 'false';
};

export const setAppSoundsEnabled = (enabled: boolean) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(enabled));
  if (!enabled) stopAllAppSounds();
};

const getAudioContext = (): AudioContext | null => {
  if (!isBrowser()) return null;
  if (audioContext) return audioContext;

  const AudioContextConstructor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  audioContext = new AudioContextConstructor();
  return audioContext;
};

const loadSoundBuffers = async () => {
  const context = getAudioContext();
  if (!context) return;

  await Promise.all(Object.entries(APP_SOUND_PATHS).map(async ([name, path]) => {
    try {
      const response = await fetch(path, { cache: 'force-cache' });
      if (!response.ok) return;
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      buffers.set(name as AppSoundName, buffer);
    } catch {
      // A missing optional sound must never interrupt messaging or calls.
    }
  }));
};

const ensureSoundsLoaded = () => {
  if (!loadPromise) loadPromise = loadSoundBuffers();
  return loadPromise;
};

const unlockAudio = () => {
  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume().catch(() => undefined);
  void ensureSoundsLoaded();
};

/**
 * Preloads the sound pack and unlocks Web Audio on the student's first gesture.
 * Browsers intentionally block unprompted audio before a click/tap.
 */
export const initializeAppSounds = () => {
  if (!isBrowser()) return () => undefined;
  void ensureSoundsLoaded();

  if (!removeUnlockListeners) {
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];
    events.forEach((eventName) => window.addEventListener(eventName, unlockAudio, {
      capture: true,
      passive: true,
    }));
    removeUnlockListeners = () => {
      events.forEach((eventName) => window.removeEventListener(eventName, unlockAudio, true));
      removeUnlockListeners = null;
    };
  }

  return () => removeUnlockListeners?.();
};

const playFallback = async (name: AppSoundName, options: PlaySoundOptions) => {
  let audio = fallbackAudio.get(name);
  if (!audio) {
    audio = new Audio(APP_SOUND_PATHS[name]);
    audio.preload = 'auto';
    fallbackAudio.set(name, audio);
  }
  audio.pause();
  audio.currentTime = 0;
  audio.loop = options.loop ?? false;
  audio.volume = Math.min(1, Math.max(0, options.volume ?? 0.72));
  await audio.play();
};

export const playAppSound = async (name: AppSoundName, options: PlaySoundOptions = {}) => {
  if (!isBrowser() || !areAppSoundsEnabled()) return;
  if (!options.allowWhenHidden && document.visibilityState !== 'visible') return;

  const now = Date.now();
  const cooldownMs = options.cooldownMs ?? (options.loop ? 0 : 350);
  if (now - (lastPlayedAt.get(name) || 0) < cooldownMs) return;
  lastPlayedAt.set(name, now);

  const generation = generations.get(name) || 0;
  await ensureSoundsLoaded();
  if (generation !== (generations.get(name) || 0)) return;

  const context = getAudioContext();
  const buffer = buffers.get(name);
  if (!context || !buffer) {
    await playFallback(name, options).catch(() => undefined);
    return;
  }

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }
  if (context.state !== 'running') return;

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = options.loop ?? false;
  gain.gain.value = Math.min(1, Math.max(0, options.volume ?? 0.72));
  source.connect(gain);
  gain.connect(context.destination);

  const activeSources = sources.get(name) || new Set<AudioBufferSourceNode>();
  activeSources.add(source);
  sources.set(name, activeSources);
  source.addEventListener('ended', () => activeSources.delete(source), { once: true });
  source.start();
};

export const stopAppSound = (name: AppSoundName) => {
  generations.set(name, (generations.get(name) || 0) + 1);
  sources.get(name)?.forEach((source) => {
    try {
      source.stop();
    } catch {
      // The source may already have naturally ended.
    }
  });
  sources.delete(name);

  const audio = fallbackAudio.get(name);
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
};

export const stopAllAppSounds = () => {
  (Object.keys(APP_SOUND_PATHS) as AppSoundName[]).forEach(stopAppSound);
};
