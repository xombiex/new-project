import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSettings } from '@/store/settings';

import { AppWebView, type WebView, type WebViewMessageEvent } from './app-web-view';
import type { ConvoyMapProps } from './types';

export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://convoy-drab.vercel.app';

/** No answer from the page by now: go back to the native map rather than leave a blank screen. */
const READY_TIMEOUT_MS = 20_000;

/**
 * The 3D map on phones. MapLibre's native library can't draw custom models, so this shows the web
 * map (/map-embed on the website) and keeps it in step with the props. Anything going wrong calls
 * onFail, and the caller falls back to the native map with sprites.
 */
export function MapWebView({ style, onFail, ...props }: ConvoyMapProps & { onFail: () => void }) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // The page answered a message: only now do we know the map will really show what we send.
  const [live, setLive] = useState(false);
  const failed = useRef(false);
  const fail = () => {
    if (failed.current) return;
    failed.current = true;
    onFail();
  };

  const { onPressCamera, markers } = props;
  const mapTheme = useSettings((s) => s.mapTheme);
  const glow = useSettings((s) => s.glow);
  const terrain = useSettings((s) => s.terrain);
  const radar = useSettings((s) => s.radar);
  // Functions can't cross into the page: tapped things come back as ids. Only a changed string is sent.
  const payload = JSON.stringify({
    props: { ...props, onPressCamera: undefined, markers: markers?.map(({ onPress: _onPress, ...m }) => m) },
    look: { mapTheme, glow, terrain, radar },
  });

  useEffect(() => {
    if (live) return;
    const timer = setTimeout(fail, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.__convoyEmbed && window.__convoyEmbed(${payload});true;`);
  }, [ready, payload]);

  function onMessage(e: WebViewMessageEvent) {
    if (!e.nativeEvent.url.startsWith(WEB_APP_URL)) return;
    let msg: { type?: string; id?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'live') setLive(true);
    else if (msg.type === 'failed') fail();
    else if (msg.type === 'camera') {
      const cam = props.cameras?.find((c) => c.id === msg.id);
      if (cam) onPressCamera?.(cam);
    } else if (msg.type === 'marker') markers?.find((m) => m.id === msg.id)?.onPress?.();
  }

  return (
    <View style={[styles.container, style]}>
      <AppWebView
        ref={web}
        source={{ uri: `${WEB_APP_URL}/map-embed` }}
        style={styles.web}
        originWhitelist={[WEB_APP_URL]}
        onMessage={onMessage}
        onError={fail}
        onHttpError={fail}
        onContentProcessDidTerminate={fail}
        onRenderProcessGone={fail}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
