(function () {
  'use strict';

  const root = (window.Playtime = window.Playtime || {});
  root.libs = root.libs || {};
  root._pendingEvents = root._pendingEvents || [];

  if (root.libs.axios) {
    return;
  }

  const CDN_URL =
    (root.config && root.config.axiosCdn) ||
    'https://cdn.jsdelivr.net/npm/axios@1.7.7/dist/axios.min.js';

  function emit(event, payload) {
    if (typeof root.emit === 'function') {
      root.emit(event, payload);
    } else {
      root._pendingEvents.push([event, payload]);
    }
  }

  function loadAxios() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CDN_URL;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        root.libs.axios = window.axios;
        emit('lib:axios', window.axios);
        resolve(window.axios);
        script.remove();
      };
      script.onerror = (error) => {
        const message = new Error('Failed to load axios library');
        message.cause = error;
        emit('lib:axios:error', message);
        reject(message);
        script.remove();
      };
      document.head.appendChild(script);
    });
  }

  root.promises = root.promises || {};
  root.promises.axios = loadAxios();
})();
