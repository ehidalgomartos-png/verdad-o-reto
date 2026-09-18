(() => {
  const statusNode = document.querySelector('[data-city-status]');
  if (!statusNode) return;
  const slug = statusNode.dataset.cityStatus;
  const apiUrl = location.protocol === 'file:' ? 'https://vrmatch.es/api/launch/cities' : '/api/launch/cities';
  fetch(apiUrl, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('status unavailable')))
    .then((payload) => {
      const city = Array.isArray(payload.cities) ? payload.cities.find((item) => item.slug === slug) : null;
      if (!city) return;
      const ready = city.status === 'READY' || city.status === 'ACTIVE';
      statusNode.classList.add(ready ? 'is-ready' : 'is-waiting');
      statusNode.textContent = ready ? 'V/R Match ya está disponible en ' + city.name : 'Lista de espera activa en ' + city.name;
      if (ready) {
        document.querySelectorAll('[data-primary-cta]').forEach((link) => { link.href = 'https://vrmatch.es/'; link.textContent = 'Entrar en V/R Match'; });
      }
    })
    .catch(() => {});
})();
