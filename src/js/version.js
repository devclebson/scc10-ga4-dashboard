(() => {
  const version = '1.0.1';
  document.querySelectorAll('[data-app-version]').forEach((element) => {
    element.textContent = `v${version}`;
    element.title = `Versão ${version}`;
  });
})();
