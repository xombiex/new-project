/** Whole and tenths digits for the drums: 4821.6 → 0,0,4,8,2,1 + 6. Rolls over at a million, like the real thing. */
export function odometerDigits(value: number, wholeDigits = 6): number[] {
  const tenths = Math.max(0, Math.floor(value * 10)) % 10 ** (wholeDigits + 1);
  return String(tenths)
    .padStart(wholeDigits + 1, '0')
    .split('')
    .map(Number);
}
