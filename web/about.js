// Remember that this visitor has seen the landing page, so "/" opens the app next time.
for (const a of document.querySelectorAll('a.open-app')) {
  a.addEventListener('click', () => {
    try {
      localStorage.setItem('convoy-landing-seen', '1');
    } catch {}
  });
}
