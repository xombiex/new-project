/** Browser build: download instead of a share sheet. */
export async function shareTextFile(filename: string, content: string, mimeType: string, _uti?: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareImage(uri: string) {
  const a = document.createElement('a');
  a.href = uri;
  a.download = 'convoy-drive.png';
  a.click();
}
