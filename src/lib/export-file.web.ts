/** Browser build: download instead of a share sheet. */
export async function shareTextFile(filename: string, content: string, mimeType: string, _uti?: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Phones' browsers: the share sheet with the picture (Instagram, Messages…); elsewhere a download. */
export async function shareImage(uri: string) {
  const blob = await (await fetch(uri)).blob();
  const file = new File([blob], 'convoy-drive.png', { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My Convoy drive' });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // closed the sheet
    }
  }
  const a = document.createElement('a');
  a.href = uri;
  a.download = 'convoy-drive.png';
  a.click();
}
