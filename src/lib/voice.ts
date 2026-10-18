import type { ExpoSpeechRecognitionModule as ModuleType } from 'expo-speech-recognition';

/**
 * Speech-to-text for search. Native uses the OS recognizer (Siri / Google); the web uses the
 * browser's Web Speech API. Phone builds made before this was added don't have the native
 * module, so it's loaded defensively and the mic button just hides there.
 */
let mod: typeof ModuleType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  mod = null;
}

export function voiceAvailable(): boolean {
  try {
    return Boolean(mod?.isRecognitionAvailable());
  } catch {
    return false;
  }
}

type Handlers = {
  /** live transcript while you talk, then the final one */
  onText: (text: string, final: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
};

/** Start listening; returns a function that stops early. */
export async function listen({ onText, onEnd, onError }: Handlers): Promise<() => void> {
  if (!mod) {
    onError('Voice search isn’t available on this device');
    onEnd();
    return () => {};
  }
  const perm = await mod.requestPermissionsAsync().catch(() => null);
  if (!perm?.granted) {
    onError('Allow microphone access to search by voice');
    onEnd();
    return () => {};
  }
  const subs = [
    mod.addListener('result', (e) => {
      const text = e.results[0]?.transcript ?? '';
      if (text) onText(text, e.isFinal);
    }),
    mod.addListener('error', (e) => {
      // "no-speech" / "aborted" just mean nothing was said; not worth a message.
      if (e.error !== 'no-speech' && e.error !== 'aborted') onError(e.message || 'Voice search failed');
    }),
    mod.addListener('end', () => {
      subs.forEach((s) => s.remove());
      onEnd();
    }),
  ];
  try {
    mod.start({ lang: 'en-US', interimResults: true, continuous: false, addsPunctuation: false });
  } catch (e) {
    subs.forEach((s) => s.remove());
    onError(e instanceof Error ? e.message : 'Voice search failed');
    onEnd();
  }
  return () => {
    try {
      mod?.stop();
    } catch {
      // already stopped
    }
  };
}
