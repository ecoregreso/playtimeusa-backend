(function () {
  'use strict';

  const root = (window.Playtime = window.Playtime || {});
  const utils = root.utils || {};

  function parseAxiosResponse(response) {
    return response && typeof response === 'object' && 'data' in response ? response.data : response;
  }

  async function parseFetchResponse(response) {
    if (!response) {
      return null;
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }
    if (!response.ok) {
      const message =
        (data && (data.error || data.message)) || response.statusText || 'Request failed';
      const error = new Error(message);
      error.status = response.status;
      error.body = data;
      throw error;
    }
    return data;
  }

  async function requestJson(method, url, payload) {
    const http = root.http || {};
    const hasAxios = !!(root.libs && root.libs.axios && typeof http[method] === 'function');

    try {
      if (hasAxios) {
        const response =
          method === 'get' ? await http.get(url) : await http[method](url, payload);
        return parseAxiosResponse(response);
      }

      if (method === 'get') {
        const response = await http.get(url);
        return parseFetchResponse(response);
      }
      const response = await http.post(url, payload);
      return parseFetchResponse(response);
    } catch (error) {
      if (error && error.response && error.response.data) {
        const data = error.response.data;
        const message = data.error || data.message || error.message;
        const wrapped = new Error(message);
        wrapped.body = data;
        wrapped.status = error.response.status;
        throw wrapped;
      }
      throw error;
    }
  }

  function initLoginPage() {
    const form = document.getElementById('login-form');
    if (!form) {
      return;
    }

    const userCodeInput = document.getElementById('userCode');
    const passwordInput = document.getElementById('password');
    const statusEl = document.getElementById('status');
    const balances = document.getElementById('balances');
    const balanceValue = document.getElementById('balance');

    const setStatus = (message, type) => {
      statusEl.textContent = message;
      statusEl.className = `status ${type || ''}`;
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      balances.hidden = true;
      setStatus('Signing in…');

      try {
        const payload = {
          userCode: userCodeInput.value.trim(),
          password: passwordInput.value.trim()
        };
        const data = await requestJson('post', '/api/player/login', payload);

        if (!data || typeof data.balance === 'undefined') {
          throw new Error('Unexpected server response.');
        }

        const formatted = utils.formatCurrency
          ? utils.formatCurrency(data.balance, 'USD')
          : new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2
            }).format(data.balance);

        balanceValue.textContent = formatted;
        balances.hidden = false;
        setStatus('Voucher accepted. Enjoy your games!', 'success');
      } catch (error) {
        console.error('[Playtime] login failed', error);
        setStatus(error.message || 'Login failed.', 'error');
      }
    });

    const params = new URLSearchParams(window.location.search);
    const initialUser = params.get('user') || params.get('userCode');
    const initialPass = params.get('pass') || params.get('password');
    if (initialUser) userCodeInput.value = initialUser;
    if (initialPass) passwordInput.value = initialPass;

    if (initialUser && initialPass) {
      passwordInput.type = 'text';
      setTimeout(() => {
        passwordInput.type = 'password';
      }, 2000);
      setTimeout(() => {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
      }, 150);
    }
  }

  function initCashierPage() {
    const form = document.getElementById('voucher-form');
    if (!form) {
      return;
    }

    const amountInput = document.getElementById('amount');
    const feedback = document.getElementById('feedback');
    const quickButtons = document.querySelectorAll('.quick-amounts button');

    const voucherOutput = document.getElementById('voucher-output');
    const emptyState = document.getElementById('empty-state');
    const voucherUser = document.getElementById('voucher-user');
    const voucherPassword = document.getElementById('voucher-password');
    const voucherAmount = document.getElementById('voucher-amount');
    const voucherBonus = document.getElementById('voucher-bonus');
    const voucherTotal = document.getElementById('voucher-total');
    const voucherQr = document.getElementById('voucher-qr');
    const openLogin = document.getElementById('open-login');
    const copyCredentials = document.getElementById('copy-credentials');
    const downloadQr = document.getElementById('download-qr');
    const historyList = document.getElementById('voucher-history');
    const historyTemplate = document.getElementById('history-item-template');

    const formatter = utils.formatCurrency
      ? (value) => utils.formatCurrency(value, 'USD')
      : (value) =>
          new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
          }).format(value);

    const setFeedback = (message, type) => {
      feedback.textContent = message;
      feedback.className = `feedback ${type || ''}`;
    };

    const clearFeedback = () => {
      feedback.textContent = '';
      feedback.className = 'feedback';
    };

    const renderVoucher = (voucher) => {
      voucherUser.textContent = voucher.userCode;
      voucherPassword.textContent = voucher.password;
      voucherAmount.textContent = formatter(voucher.amount);
      voucherBonus.textContent = formatter(voucher.bonus);
      voucherTotal.textContent = formatter(voucher.balance);
      voucherQr.src = voucher.qrCode;
      openLogin.href = voucher.loginUrl;
      downloadQr.href = voucher.qrCode;

      voucherOutput.hidden = false;
      emptyState.hidden = true;
    };

    const appendHistory = (voucher, { prepend = false } = {}) => {
      if (!historyTemplate) {
        return;
      }
      const entry = historyTemplate.content.firstElementChild.cloneNode(true);
      const created = voucher.createdAt ? new Date(voucher.createdAt) : new Date();
      entry.querySelector('[data-field="title"]').textContent = `Voucher #${voucher.userCode}`;
      entry.querySelector('[data-field="timestamp"]').textContent = created.toLocaleString();
      entry.querySelector('[data-field="details"]').textContent =
        `Deposit ${formatter(voucher.amount)} | Bonus ${formatter(voucher.bonus)} | Total ${formatter(
          voucher.balance
        )}`;

      if (prepend) {
        historyList.prepend(entry);
      } else {
        historyList.append(entry);
      }
      while (historyList.children.length > 25) {
        historyList.removeChild(historyList.lastElementChild);
      }
    };

    quickButtons.forEach((button) => {
      button.addEventListener('click', () => {
        amountInput.value = button.dataset.amount;
        amountInput.focus();
      });
    });

    const fetchRecentVouchers = async () => {
      try {
        const vouchers = await requestJson('get', '/api/cashier/voucher');
        historyList.innerHTML = '';
        if (!Array.isArray(vouchers) || !vouchers.length) {
          historyList.innerHTML = '<p>No vouchers generated yet.</p>';
          return;
        }
        vouchers.forEach((voucher) => appendHistory(voucher));
      } catch (error) {
        historyList.innerHTML = `<p class="feedback error">${error.message}</p>`;
      }
    };

    copyCredentials.addEventListener('click', async () => {
      const payload = `User Code: ${voucherUser.textContent}\nPassword: ${voucherPassword.textContent}`;
      try {
        const success = await (utils.copyToClipboard
          ? utils.copyToClipboard(payload)
          : navigator.clipboard.writeText(payload));
        if (success === false) {
          throw new Error('Clipboard API unavailable');
        }
        setFeedback('Voucher credentials copied to clipboard.', 'success');
        setTimeout(clearFeedback, 3000);
      } catch (error) {
        console.error('[Playtime] copy failed', error);
        setFeedback('Unable to copy to clipboard.', 'error');
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFeedback();

      const amount = Number(amountInput.value);
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        setFeedback('Enter a valid amount greater than 0.', 'error');
        return;
      }

      try {
        setFeedback('Generating voucher…');
        const voucher = await requestJson('post', '/api/cashier/voucher', { amount });
        renderVoucher(voucher);
        appendHistory(voucher, { prepend: true });
        setFeedback('Voucher generated successfully.', 'success');
        form.reset();
      } catch (error) {
        console.error('[Playtime] voucher creation failed', error);
        setFeedback(error.message || 'Failed to create voucher.', 'error');
      }
    });

    fetchRecentVouchers();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLoginPage();
    initCashierPage();
  });
})();
