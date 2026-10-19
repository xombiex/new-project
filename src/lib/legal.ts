import * as WebBrowser from 'expo-web-browser';

import { SITE_URL } from '@/lib/site';

export { SITE_URL };

export const TERMS_URL = `${SITE_URL}/terms`;
export const PRIVACY_URL = `${SITE_URL}/privacy`;

export function openLegal(url: string) {
  void WebBrowser.openBrowserAsync(url);
}
