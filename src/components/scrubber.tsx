import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Drag or tap anywhere on the track to seek (0–1). Works with touch and mouse. */
export function Scrubber({ value, onChange, color }: { value: number; onChange: (f: number) => void; color: string }) {
  const theme = useTheme();
  const width = useRef(1);
  const [dragging, setDragging] = useState(false);
  const seek = (e: GestureResponderEvent) => onChange(Math.min(1, Math.max(0, e.nativeEvent.locationX / width.current)));

  return (
    <View
      style={styles.hit}
      onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        setDragging(true);
        seek(e);
      }}
      onResponderMove={seek}
      onResponderRelease={() => setDragging(false)}
      onResponderTerminate={() => setDragging(false)}
      accessibilityRole="adjustable"
      accessibilityLabel="Replay position"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]} pointerEvents="none">
        <View style={{ width: `${value * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: `${value * 100}%`, transform: [{ scale: dragging ? 1.25 : 1 }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
