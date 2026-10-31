import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import type { ClipDetails } from '@/components/clip-input';
import { useMapLook } from '@/components/map/use-map-look';
import type { GlowPreset } from '@/lib/glow';
import type { MapTheme } from '@/lib/map-style';
import { useSettings } from '@/store/settings';

type ClipRequest = {
  details: ClipDetails;
  watermark: boolean;
  look: { mapTheme: MapTheme; glow: GlowPreset; terrain: boolean; radar: boolean };
};

type EmbedWindow = Window & {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  __convoyClip?: (r: ClipRequest) => void;
};

/** Bridge messages stay well under what the phones handle in one go. */
const CHUNK_BYTES = 512 * 1024;

const send = (data: object) => (window as EmbedWindow).ReactNativeWebView?.postMessage(JSON.stringify(data));

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Makes a clip for the phone app (see clip-maker.tsx). The drive arrives from the app and goes nowhere else. */
export default function ClipEmbed() {
  const [request, setRequest] = useState<ClipRequest | null>(null);
  const { style, glow, scheme, variant } = useMapLook();
  const started = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = window as EmbedWindow;
    w.__convoyClip = (r) => {
      useSettings.setState(r.look);
      setRequest(r);
    };
    send({ type: 'ready' });
    return () => {
      delete w.__convoyClip;
    };
  }, []);

  useEffect(() => {
    if (!request || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { generateClip } = await import('@/components/map/drive-clip.web');
        const { blob } = await generateClip({ ...request.details, style, glow, dark: scheme === 'dark', variant, watermark: request.watermark }, (fraction) => send({ type: 'progress', fraction }));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // Whole groups of 3 bytes per piece, so the base64 pieces join back up cleanly.
        const size = CHUNK_BYTES - (CHUNK_BYTES % 3);
        const total = Math.ceil(bytes.length / size);
        for (let i = 0; i < total; i++) send({ type: 'chunk', index: i, total, data: toBase64(bytes.subarray(i * size, (i + 1) * size)) });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Could not make the clip' });
      }
    })();
  }, [request, style, glow, scheme, variant]);

  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
