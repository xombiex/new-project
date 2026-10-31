import type { ComponentType, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/** The props Convoy uses. The library's own type collapses to `never` with this TypeScript and React. */
type AppWebViewProps = {
  ref?: Ref<WebView>;
  source: { uri: string };
  style?: StyleProp<ViewStyle>;
  originWhitelist?: string[];
  onMessage?: (e: WebViewMessageEvent) => void;
  onError?: () => void;
  onHttpError?: () => void;
  onContentProcessDidTerminate?: () => void;
  onRenderProcessGone?: () => void;
  scrollEnabled?: boolean;
  bounces?: boolean;
  overScrollMode?: 'never' | 'always' | 'content';
  setSupportMultipleWindows?: boolean;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
};

export const AppWebView = WebView as unknown as ComponentType<AppWebViewProps>;
export type { WebView, WebViewMessageEvent };
