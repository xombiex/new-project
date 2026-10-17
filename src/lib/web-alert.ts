import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * react-native-web ships Alert.alert as a no-op, so every confirmation in the app ("Discard trip?",
 * "Leave drive?", "Remove friend?") silently did nothing on the web. Map it onto the browser's own
 * dialogs: one choice → alert, one action + cancel → confirm, several actions → numbered prompt.
 */
function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  const cancel = list.find((b) => b.style === 'cancel');
  const actions = list.filter((b) => b !== cancel);

  if (actions.length <= 1 && !cancel) {
    window.alert(text);
    actions[0]?.onPress?.();
    return;
  }
  if (actions.length === 1) {
    if (window.confirm(`${text}\n\n${actions[0].text ?? 'OK'}?`)) actions[0].onPress?.();
    else cancel?.onPress?.();
    return;
  }
  const menu = actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n');
  const answer = window.prompt(`${text}\n\n${menu}\n\nType a number:`);
  const picked = answer ? actions[Number(answer.trim()) - 1] : undefined;
  if (picked) picked.onPress?.();
  else cancel?.onPress?.();
}

if (Platform.OS === 'web') Alert.alert = webAlert;
