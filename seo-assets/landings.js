(() => {
  const statusNode = document.querySelector('[data-city-status]');
  if (!statusNode) return;

  const slug = statusNode.dataset.cityStatus;
  const apiUrl = location.protocol === 'file:' ? 'https://vrmatch.es/api/launch/cities' : '/api/launch/cities';

  fetch(apiUrl, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('status unavailable')))
    .then((payload) => {
      const city = Array.isArray(payload.cities)
        ? payload.cities.find((item) => item.slug === slug)
        : null;

      if (!city) return;

      if (city.status === 'ACTIVE') {
        statusNode.classList.add('is-ready');
        statusNode.textContent = 'V/R Match ya está disponible en ' + city.name;
        document.querySelectorAll('[data-primary-cta]').forEach((link) => {
          link.href = 'https://vrmatch.es/';
          link.textContent = 'Entrar en V/R Match';
        });
        return;
      }

      if (city.status === 'READY') {
        statusNode.classList.add('is-pending');
        statusNode.textContent = 'Objetivo alcanzado en ' + city.name + ' · apertura pendiente';
        return;
      }

      statusNode.classList.add('is-waiting');
      statusNode.textContent = 'Lista de espera activa en ' + city.name;
    })
    .catch(() => {});
})();
