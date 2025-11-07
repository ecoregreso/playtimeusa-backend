(function () {
  'use strict';

  const root = (window.Playtime = window.Playtime || {});
  root.libs = root.libs || {};
  root._pendingEvents = root._pendingEvents || [];

  if (root.libs.reactRouterDom) {
    return;
  }

  const CDN_URL =
    (root.config && root.config.reactRouterCdn) ||
    'https://cdn.jsdelivr.net/npm/react-router-dom@6.26.2/umd/react-router-dom.production.min.js';

  function emit(event, payload) {
    if (typeof root.emit === 'function') {
      root.emit(event, payload);
    } else {
      root._pendingEvents.push([event, payload]);
    }
  }

  function loadRouter() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CDN_URL;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        root.libs.reactRouterDom = window.ReactRouterDOM;
        emit('lib:router', window.ReactRouterDOM);
        resolve(window.ReactRouterDOM);
        script.remove();
      };
      script.onerror = (error) => {
        const message = new Error('Failed to load React Router DOM');
        message.cause = error;
        emit('lib:router:error', message);
        reject(message);
        script.remove();
      };
      document.head.appendChild(script);
    });
  }

  root.promises = root.promises || {};
  root.promises.router = loadRouter();
})();
