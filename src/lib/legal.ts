import * as WebBrowser from 'expo-web-browser';

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://convoy-drab.vercel.app';

export const TERMS_URL = `${SITE}/terms`;
export const PRIVACY_URL = `${SITE}/privacy`;

export function openLegal(url: string) {
  void WebBrowser.openBrowserAsync(url);
}
