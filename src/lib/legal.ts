import * as WebBrowser from 'expo-web-browser';

export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://convoy-drab.vercel.app';

export const TERMS_URL = `${SITE_URL}/terms`;
export const PRIVACY_URL = `${SITE_URL}/privacy`;

export function openLegal(url: string) {
  void WebBrowser.openBrowserAsync(url);
}
