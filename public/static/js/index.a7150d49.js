(function () {
  'use strict';

  const root = (window.Playtime = window.Playtime || {});
  root.libs = root.libs || {};
  root.promises = root.promises || {};

  const listeners = new Map();

  function getSet(event) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    return listeners.get(event);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (set) {
      for (const handler of Array.from(set)) {
        try {
          handler(payload);
        } catch (error) {
          console.error('[Playtime] listener error for', event, error);
        }
      }
    }
  }

  function on(event, handler) {
    getSet(event).add(handler);
    return () => off(event, handler);
  }

  function once(event, handler) {
    const offFn = on(event, (payload) => {
      offFn();
      handler(payload);
    });
    return offFn;
  }

  function off(event, handler) {
    const set = listeners.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  async function when(events) {
    if (!Array.isArray(events)) {
      events = [events];
    }
    return Promise.all(
      events.map(
        (event) =>
          new Promise((resolve) => {
            once(event, resolve);
          })
      )
    ).then((values) => (values.length === 1 ? values[0] : values));
  }

  root.emit = (event, payload) => {
    emit(event, payload);
  };
  root.on = on;
  root.once = once;
  root.off = off;
  root.when = when;

  if (Array.isArray(root._pendingEvents)) {
    for (const [event, payload] of root._pendingEvents.splice(0)) {
      emit(event, payload);
    }
  }

  const htmlDataset = document.documentElement?.dataset || {};
  root.config = Object.assign(
    {
      apiBase: htmlDataset.apiBase || '',
      axiosCdn: htmlDataset.axiosCdn,
      reactCdn: htmlDataset.reactCdn,
      reactDomCdn: htmlDataset.reactDomCdn,
      reactRouterCdn: htmlDataset.reactRouterCdn
    },
    root.config || {}
  );

  const currencyFormatterCache = new Map();
  function formatCurrency(value, currency = 'USD', locale) {
    const key = `${currency}-${locale || 'default'}`;
    if (!currencyFormatterCache.has(key)) {
      currencyFormatterCache.set(
        key,
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2
        })
      );
    }
    return currencyFormatterCache.get(key).format(value);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (error) {
      console.warn('[Playtime] clipboard copy failed', error);
    }
    textarea.remove();
    return success;
  }

  function safeJson(value) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function createHttpClient() {
    if (root.libs.axios) {
      return root.libs.axios.create
        ? root.libs.axios.create({ baseURL: root.config.apiBase || '' })
        : root.libs.axios;
    }
    const apiBase = root.config.apiBase || '';
    return {
      async get(url, options = {}) {
        const response = await fetch(apiBase + url, options);
        return response;
      },
      async post(url, payload, options = {}) {
        const response = await fetch(apiBase + url, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
          body: JSON.stringify(payload),
          ...options
        });
        return response;
      }
    };
  }

  root.utils = Object.assign(root.utils || {}, {
    formatCurrency,
    copyToClipboard,
    safeJson,
    createHttpClient
  });

  root.http = createHttpClient();

  root.when(['lib:axios']).then(() => {
    root.http = createHttpClient();
  });
})();
