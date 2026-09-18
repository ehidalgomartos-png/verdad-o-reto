(() => {
  const statusNode = document.querySelector('[data-city-status]');
  if (!statusNode) return;

  const slug = statusNode.dataset.cityStatus;
  const apiUrl = location.protocol === 'file:' ? 'https://vrmatch.es/api/community/cities' : '/api/community/cities';

  fetch(apiUrl, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('status unavailable')))
    .then((payload) => {
      const city = Array.isArray(payload.cities)
        ? payload.cities.find((item) => item.slug === slug)
        : null;
      if (!city) {
        statusNode.classList.add('is-ready');
        statusNode.textContent = 'Registro abierto · puedes ser de las primeras personas de esta ciudad';
        return;
      }
      statusNode.classList.add('is-ready');
      statusNode.textContent = `${Number(city.current || 0).toLocaleString('es-ES')} personas ya se han unido en ${city.name}`;
      document.querySelectorAll('[data-primary-cta]').forEach((link) => {
        link.href = `https://vrmatch.es/?register=1&city=${encodeURIComponent(city.name)}`;
        link.textContent = `Crear cuenta en ${city.name}`;
      });
    })
    .catch(() => {});
})();
