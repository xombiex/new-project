import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

import type { ClipDetails } from './clip-input';
import { AppWebView, type WebView, type WebViewMessageEvent } from './map/app-web-view';
import { WEB_APP_URL } from './map/map-webview';

const FILE_NAME = 'convoy-drive.mp4';

/**
 * The video is made by the same code as on the web, on the phone itself: /clip-embed in a tiny
 * WebView renders it and hands the file back in pieces. Nothing is uploaded.
 */
export function ClipMaker({ details, watermark }: { details: ClipDetails; watermark: boolean }) {
  const theme = useTheme();
  const web = useRef<WebView>(null);
  const chunks = useRef<string[]>([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);

  function begin() {
    setError(null);
    setFileUri(null);
    setProgress(0);
    chunks.current = [];
    setWorking(true);
  }

  function failed(message: string) {
    setError(message);
    setWorking(false);
  }

  function onMessage(e: WebViewMessageEvent) {
    if (!e.nativeEvent.url.startsWith(WEB_APP_URL)) return;
    let msg: { type?: string; fraction?: number; message?: string; index?: number; total?: number; data?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      const { mapTheme, glow, terrain, radar } = useSettings.getState();
      const payload = JSON.stringify({ details, watermark, look: { mapTheme, glow, terrain, radar } });
      web.current?.injectJavaScript(`window.__convoyClip && window.__convoyClip(${payload});true;`);
    } else if (msg.type === 'progress') setProgress(msg.fraction ?? 0);
    else if (msg.type === 'error') failed(msg.message ?? 'Could not make the clip');
    else if (msg.type === 'chunk' && msg.index != null && msg.total != null) {
      chunks.current[msg.index] = msg.data ?? '';
      if (msg.index === msg.total - 1) {
        try {
          const file = new File(Paths.cache, FILE_NAME);
          if (file.exists) file.delete();
          file.create();
          file.write(chunks.current.join(''), { encoding: 'base64' });
          setFileUri(file.uri);
          setWorking(false);
        } catch (err) {
          failed(err instanceof Error ? err.message : 'Could not save the clip');
        }
      }
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      {working ? (
        <>
          <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.fill, { backgroundColor: theme.accent, width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Filming your drive… {Math.round(progress * 100)}%. Keep Convoy open.
          </ThemedText>
          {/* Has to stay mounted and on screen for the phone to keep it running, but needn't be seen. */}
          <AppWebView
            ref={web}
            source={{ uri: `${WEB_APP_URL}/clip-embed` }}
            style={styles.hidden}
            originWhitelist={[WEB_APP_URL]}
            onMessage={onMessage}
            onError={() => failed('Could not reach Convoy. Check your connection and try again.')}
            onHttpError={() => failed('Could not reach Convoy. Check your connection and try again.')}
            onContentProcessDidTerminate={() => failed('This phone ran out of memory making the clip.')}
            onRenderProcessGone={() => failed('This phone ran out of memory making the clip.')}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
          />
        </>
      ) : null}
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      {!working && fileUri ? (
        <>
          <ThemedText style={{ textAlign: 'center', fontWeight: 700 }}>Your clip is ready.</ThemedText>
          <Button label="Share clip" size="lg" onPress={() => void Sharing.shareAsync(fileUri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' })} />
          <Button label="Make it again" variant="secondary" onPress={begin} />
        </>
      ) : null}
      {!working && !fileUri ? <Button label="Make my clip" size="lg" onPress={begin} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  hidden: { width: 4, height: 4, opacity: 0.01 },
});
