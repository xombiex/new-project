import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { haversine } from '@/lib/geo';
import type { Place } from '@/lib/places';

export type PinKind = 'home' | 'work' | 'other';

export type Pin = {
  kind: PinKind;
  /** shown under the circle: "Home", "Work", or the place's own name */
  label: string;
  place: Place;
};

type PlacesState = {
  pins: Pin[];
  /** places you navigated to, newest first */
  recents: Place[];
  setPin: (kind: PinKind, place: Place) => void;
  unpin: (placeId: string) => void;
  isPinned: (placeId: string) => boolean;
  addRecent: (place: Place) => void;
  removeRecent: (placeId: string) => void;
};

const MAX_RECENTS = 12;

/** Saved places (Home, Work, favourites) and recent destinations. Stored on this device. */
export const usePlaces = create<PlacesState>()(
  persist(
    (set, get) => ({
      pins: [],
      recents: [],

      setPin: (kind, place) =>
        set((s) => {
          // One Home and one Work; a place is only pinned once.
          const rest = s.pins.filter((p) => p.place.id !== place.id && (kind === 'other' || p.kind !== kind));
          const pin: Pin = { kind, label: kind === 'home' ? 'Home' : kind === 'work' ? 'Work' : place.name, place };
          const order = (p: Pin) => (p.kind === 'home' ? 0 : p.kind === 'work' ? 1 : 2);
          return { pins: [...rest, pin].sort((a, b) => order(a) - order(b)) };
        }),

      unpin: (placeId) => set((s) => ({ pins: s.pins.filter((p) => p.place.id !== placeId) })),

      isPinned: (placeId) => get().pins.some((p) => p.place.id === placeId),

      addRecent: (place) =>
        set((s) => ({
          // Same place (or a spot within 50 m of it) moves to the top instead of repeating.
          recents: [place, ...s.recents.filter((r) => r.id !== place.id && haversine(r.coord, place.coord) > 50)].slice(0, MAX_RECENTS),
        })),

      removeRecent: (placeId) => set((s) => ({ recents: s.recents.filter((r) => r.id !== placeId) })),
    }),
    { name: 'convoy-places', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ pins: s.pins, recents: s.recents }) }
  )
);
