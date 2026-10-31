import { createElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ClipDetails } from './clip-input';
import { useMapLook } from './map/use-map-look';

const FILE_NAME = 'convoy-drive.mp4';

/** Makes the video in this browser, then offers it to share or download. */
export function ClipMaker({ details, watermark }: { details: ClipDetails; watermark: boolean }) {
  const theme = useTheme();
  const { style, glow, scheme, variant } = useMapLook();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<{ url: string; blob: Blob } | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  async function make() {
    setError(null);
    setClip(null);
    setProgress(0);
    try {
      const { generateClip } = await import('./map/drive-clip.web');
      const { blob } = await generateClip({ ...details, style, glow, dark: scheme === 'dark', variant, watermark }, setProgress);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setClip({ url: urlRef.current, blob });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make the clip');
    } finally {
      setProgress(null);
    }
  }

  function download() {
    if (!clip) return;
    const a = document.createElement('a');
    a.href = clip.url;
    a.download = FILE_NAME;
    a.click();
  }

  async function share() {
    if (!clip) return;
    const file = new File([clip.blob], FILE_NAME, { type: clip.blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else download();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') download();
    }
  }

  if (progress !== null) {
    return (
      <View style={{ gap: Spacing.two }}>
        <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.fill, { backgroundColor: theme.accent, width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Filming your drive… {Math.round(progress * 100)}%. Keep this page open.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      {clip
        ? createElement('video', {
            src: clip.url,
            controls: true,
            loop: true,
            muted: true,
            autoPlay: true,
            playsInline: true,
            style: { width: '100%', maxHeight: '60vh', borderRadius: 16, background: '#000' },
          })
        : null}
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      {clip ? <Button label="Share clip" size="lg" onPress={() => void share()} /> : <Button label="Make my clip" size="lg" onPress={() => void make()} />}
      {clip ? <Button label="Download" variant="secondary" onPress={download} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
