import { Platform } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';

/** Narrow, bold numerals like the real signs' highway lettering. */
const SIGN_FONT = Platform.select({ ios: 'AvenirNextCondensed-Bold', android: 'sans-serif-condensed', default: '"Arial Narrow", "Roboto Condensed", Arial, sans-serif' });

/**
 * US regulatory speed limit sign (MUTCD R2-1): white plate, thin black border, SPEED LIMIT over a
 * big number. A red rim lights up when you're over; an estimate (not posted) is drawn in grey.
 */
export function UsLimitSign({ value, over, estimated, width = 58 }: { value: number; over?: boolean; estimated?: boolean; width?: number }) {
  const ink = estimated ? '#6E6A63' : '#111';
  return (
    <Svg width={width} height={width * (74 / 60)} viewBox="0 0 60 74">
      {/* outer rim: shadow edge, or red when speeding */}
      <Rect x={0.5} y={0.5} width={59} height={73} rx={7} fill={over ? '#E5281F' : 'rgba(0,0,0,0.35)'} />
      <Rect x={2.5} y={2.5} width={55} height={69} rx={5.5} fill="#FFFFFF" />
      <Rect x={5} y={5} width={50} height={64} rx={4} fill="none" stroke={ink} strokeWidth={2.4} strokeDasharray={estimated ? '4 3' : undefined} />
      <SvgText x={30} y={20} fontSize={11.5} fontWeight="bold" fill={ink} textAnchor="middle" fontFamily={SIGN_FONT} letterSpacing={0.5}>
        SPEED
      </SvgText>
      <SvgText x={30} y={32} fontSize={11.5} fontWeight="bold" fill={ink} textAnchor="middle" fontFamily={SIGN_FONT} letterSpacing={0.5}>
        LIMIT
      </SvgText>
      <SvgText x={30} y={62} fontSize={value >= 100 ? 25 : 31} fontWeight="bold" fill={ink} textAnchor="middle" fontFamily={SIGN_FONT}>
        {String(value)}
      </SvgText>
    </Svg>
  );
}

/** European-style limit sign: white disc in a thick red ring, black number (km/h countries). */
export function RoundLimitSign({ value, over, estimated, size = 60 }: { value: number; over?: boolean; estimated?: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={31.5} fill={over ? '#E5281F' : 'rgba(0,0,0,0.3)'} />
      <Circle cx={32} cy={32} r={30} fill="#FFFFFF" />
      <Circle cx={32} cy={32} r={25.5} fill="none" stroke="#E5281F" strokeWidth={7} strokeDasharray={estimated ? '6 4' : undefined} />
      <SvgText x={32} y={value >= 100 ? 40.5 : 42} fontSize={value >= 100 ? 21 : 27} fontWeight="bold" fill={estimated ? '#6E6A63' : '#111'} textAnchor="middle" fontFamily={SIGN_FONT}>
        {String(value)}
      </SvgText>
    </Svg>
  );
}
