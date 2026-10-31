import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ConvoyMap } from '@/components/map/convoy-map';
import type { ConvoyMapProps } from '@/components/map/types';
import type { GlowPreset } from '@/lib/glow';
import type { MapTheme } from '@/lib/map-style';
import { useSettings } from '@/store/settings';

type EmbedMessage = {
  props: ConvoyMapProps;
  look?: { mapTheme: MapTheme; glow: GlowPreset; terrain: boolean; radar: boolean };
};

type EmbedWindow = Window & {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  __convoyEmbed?: (m: EmbedMessage) => void;
};

/**
 * The web map for the phone app's WebView (see map-webview.tsx): everything it draws arrives from
 * the app, which has already checked the 3D cars are unlocked. There's no account on this page, so
 * opening it directly shows an empty map.
 */
export default function MapEmbed() {
  const [message, setMessage] = useState<EmbedMessage | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = window as EmbedWindow;
    if (!document.createElement('canvas').getContext('webgl2')) {
      w.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'failed' }));
      return;
    }
    w.__convoyEmbed = (m) => {
      if (m.look) useSettings.setState(m.look);
      setMessage(m);
      w.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'live' }));
    };
    w.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
    return () => {
      delete w.__convoyEmbed;
    };
  }, []);

  const send = (data: object) => (window as EmbedWindow).ReactNativeWebView?.postMessage(JSON.stringify(data));
  const props = message?.props;

  return (
    <View style={styles.page}>
      <ConvoyMap
        {...props}
        style={StyleSheet.absoluteFill}
        force3d
        onPressCamera={(c) => send({ type: 'camera', id: c.id })}
        markers={props?.markers?.map((m) => ({ ...m, onPress: () => send({ type: 'marker', id: m.id }) }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
});
