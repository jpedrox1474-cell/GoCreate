/**
 * GoCreate UI runtime — styled alert/confirm/prompt/toast for Sandpack + published apps.
 * Replaces native window.alert (and provides async confirm/prompt) with dark zinc overlays.
 *
 * Parent-aware: when inside an iframe, also postMessage to the GoCreate editor:
 *   { type: 'gocreate:ui', action: 'modal'|'toast'|'confirm'|'prompt'|'openSettings', ... }
 *
 * API: window.GoCreateUI.alert / .toast / .confirm / .prompt / .modal
 */
(function (global) {
  if (global.GoCreateUI) return;

  var MSG_TYPE = 'gocreate:ui';
  var STYLE_ID = 'gc-ui-style';
  var ROOT_ID = 'gc-ui-root';
  var lastAlertKey = '';
  var lastAlertAt = 0;
  var pendingConfirm = null;
  var pendingPrompt = null;
  var seq = 0;

  function isInIframe() {
    try {
      return global.self !== global.top;
    } catch (e) {
      return true;
    }
  }

  function postParent(payload) {
    if (!isInIframe() || !global.parent || global.parent === global.self) return false;
    try {
      global.parent.postMessage(
        Object.assign({ type: MSG_TYPE, source: 'gocreate-ui' }, payload || {}),
        '*'
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function ensureStyles() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var style = global.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#' +
      ROOT_ID +
      '{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;' +
      'padding:16px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}' +
      '#' +
      ROOT_ID +
      '[hidden]{display:none!important}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-card{position:relative;width:100%;max-width:28rem;max-height:min(90vh,900px);display:flex;flex-direction:column;' +
      'background:#18181b;border:1px solid rgba(39,39,42,.8);border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,.55);overflow:hidden;color:#d4d4d8}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;' +
      'border-bottom:1px solid rgba(39,39,42,.8);background:#18181b;flex-shrink:0}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-title{margin:0;font-size:14px;font-weight:600;color:#f4f4f5}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-x{border:0;background:transparent;color:#71717a;cursor:pointer;padding:6px;border-radius:6px;line-height:0}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-x:hover{background:#27272a;color:#f4f4f5}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-body{padding:16px;font-size:14px;line-height:1.5;overflow:auto;white-space:pre-wrap;word-break:break-word}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid rgba(39,39,42,.8);background:#18181b;flex-shrink:0}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-btn{border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-btn-primary{background:#2563eb;color:#fff}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-btn-primary:hover{background:#1d4ed8}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-btn-ghost{background:#27272a;color:#e4e4e7}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-btn-ghost:hover{background:#3f3f46}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-input{width:100%;box-sizing:border-box;margin-top:12px;padding:10px 12px;border-radius:8px;' +
      'border:1px solid #3f3f46;background:#09090b;color:#f4f4f5;font:inherit}' +
      '#' +
      ROOT_ID +
      ' .gc-ui-input:focus{outline:2px solid rgba(37,99,235,.45);outline-offset:1px}' +
      '#gc-ui-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
      'max-width:min(440px,92vw);padding:12px 16px;border-radius:10px;background:#18181b;color:#fafafa;' +
      'border:1px solid #3f3f46;font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);' +
      'opacity:0;transition:opacity .2s ease;pointer-events:none}' +
      '#gc-ui-toast.gc-show{opacity:1;pointer-events:auto}' +
      '#gc-ui-toast.gc-error{border-color:#7f1d1d;background:#450a0a}' +
      '#gc-ui-toast.gc-ok,#gc-ui-toast.gc-success{border-color:#14532d;background:#052e16}' +
      '#gc-ui-toast.gc-info{border-color:#1e3a5f;background:#0c1a2e}';
    global.document.head.appendChild(style);
  }

  function ensureRoot() {
    ensureStyles();
    var root = global.document.getElementById(ROOT_ID);
    if (root) return root;
    root = global.document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('hidden', '');
    root.innerHTML =
      '<div class="gc-ui-backdrop" data-gc-close="1"></div>' +
      '<div class="gc-ui-card" role="dialog" aria-modal="true" aria-labelledby="gc-ui-title">' +
      '<div class="gc-ui-head"><h2 class="gc-ui-title" id="gc-ui-title"></h2>' +
      '<button type="button" class="gc-ui-x" data-gc-close="1" aria-label="Fechar">✕</button></div>' +
      '<div class="gc-ui-body" id="gc-ui-body"></div>' +
      '<div class="gc-ui-foot" id="gc-ui-foot"></div></div>';
    global.document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-gc-close') === '1') {
        closeModal(false, null);
      }
    });
    return root;
  }

  function closeModal(ok, value) {
    var root = global.document && global.document.getElementById(ROOT_ID);
    if (root) root.setAttribute('hidden', '');
    if (pendingConfirm) {
      var c = pendingConfirm;
      pendingConfirm = null;
      c(Boolean(ok));
    }
    if (pendingPrompt) {
      var p = pendingPrompt;
      pendingPrompt = null;
      p(ok ? value : null);
    }
  }

  var pendingParentAcks = Object.create(null);

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || data.type !== MSG_TYPE || data.action !== 'ack') return;
      if (!data.requestId || !pendingParentAcks[data.requestId]) return;
      var entry = pendingParentAcks[data.requestId];
      delete pendingParentAcks[data.requestId];
      clearTimeout(entry.timer);
      entry.resolve(true);
    });
  }

  function awaitParentAck(requestId, timeoutMs) {
    return new Promise(function (resolve) {
      if (!requestId || !isInIframe()) {
        resolve(false);
        return;
      }
      var timer = setTimeout(function () {
        delete pendingParentAcks[requestId];
        resolve(false);
      }, timeoutMs || 160);
      pendingParentAcks[requestId] = {
        resolve: resolve,
        timer: timer,
      };
    });
  }

  function renderLocalModal(opts) {
    opts = opts || {};
    var message = String(opts.message || opts.body || '');
    var title = String(opts.title || 'GoCreate');
    var mode = opts.mode || 'alert';
    var defaultValue = opts.defaultValue != null ? String(opts.defaultValue) : '';
    var primaryLabel = opts.okLabel || (mode === 'confirm' ? 'Confirmar' : 'Entendi');
    var cancelLabel = opts.cancelLabel || 'Cancelar';
    var showSettings = Boolean(opts.openSettings);

    if (!global.document || !global.document.body) {
      return Promise.resolve(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined);
    }

    var root = ensureRoot();
    root.querySelector('.gc-ui-title').textContent = title;
    var body = root.querySelector('#gc-ui-body');
    body.textContent = '';
    var text = global.document.createElement('div');
    text.textContent = message;
    body.appendChild(text);

    var input = null;
    if (mode === 'prompt') {
      input = global.document.createElement('input');
      input.className = 'gc-ui-input';
      input.type = 'text';
      input.value = defaultValue;
      body.appendChild(input);
    }

    var foot = root.querySelector('#gc-ui-foot');
    foot.textContent = '';

    function addBtn(label, className, onClick) {
      var btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'gc-ui-btn ' + className;
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      foot.appendChild(btn);
      return btn;
    }

    if (mode === 'confirm' || mode === 'prompt') {
      addBtn(cancelLabel, 'gc-ui-btn-ghost', function () {
        closeModal(false, null);
      });
    }
    if (showSettings) {
      addBtn('Abrir Configurações', 'gc-ui-btn-ghost', function () {
        postParent({ action: 'openSettings', message: message, title: title });
        closeModal(true, input ? input.value : null);
      });
    }
    var primary = addBtn(primaryLabel, 'gc-ui-btn-primary', function () {
      closeModal(true, input ? input.value : null);
    });

    root.removeAttribute('hidden');
    setTimeout(function () {
      try {
        if (input) input.focus();
        else primary.focus();
      } catch (e) {
        /* ignore */
      }
    }, 30);

    if (mode === 'alert') {
      return Promise.resolve(undefined);
    }
    return new Promise(function (resolve) {
      if (mode === 'confirm') pendingConfirm = resolve;
      else pendingPrompt = resolve;
    });
  }

  function showModal(opts) {
    opts = opts || {};
    var message = String(opts.message || opts.body || '');
    var title = String(opts.title || 'GoCreate');
    var variant = opts.variant || 'info';
    var mode = opts.mode || 'alert';
    var showSettings = Boolean(opts.openSettings);
    var requestId = 'gc-ui-' + Date.now() + '-' + ++seq;

    var parentAction = mode === 'alert' ? 'modal' : mode;
    var posted = postParent({
      action: parentAction,
      message: message,
      title: title,
      variant: variant,
      openSettings: showSettings,
      requestId: requestId,
      okLabel: opts.okLabel || null,
      cancelLabel: opts.cancelLabel || null,
      defaultValue: opts.defaultValue != null ? String(opts.defaultValue) : null,
    });

    // Prefer parent ModalShell when editing in GoCreate; fall back to in-preview overlay.
    if (posted && mode === 'alert') {
      return awaitParentAck(requestId, 180).then(function (acked) {
        if (acked) return undefined;
        return renderLocalModal(opts);
      });
    }

    return renderLocalModal(opts);
  }

  function showToast(message, type) {
    var msg = String(message || '');
    var variant = type === 'ok' || type === 'success' ? 'success' : type === 'info' ? 'info' : 'error';
    var requestId = 'gc-toast-' + Date.now() + '-' + ++seq;
    var posted = postParent({
      action: 'toast',
      message: msg,
      variant: variant,
      requestId: requestId,
    });

    function renderLocalToast() {
      try {
        if (!global.document || !global.document.body) return;
        ensureStyles();
        var el = global.document.getElementById('gc-ui-toast');
        if (!el) {
          el = global.document.createElement('div');
          el.id = 'gc-ui-toast';
          el.setAttribute('role', 'status');
          global.document.body.appendChild(el);
        }
        el.className = variant === 'success' ? 'gc-ok' : variant === 'info' ? 'gc-info' : 'gc-error';
        el.textContent = msg;
        void el.offsetWidth;
        el.classList.add('gc-show');
        clearTimeout(el._gcTimer);
        el._gcTimer = setTimeout(function () {
          el.classList.remove('gc-show');
        }, 5200);
      } catch (e) {
        /* never fall back to native alert */
      }
    }

    if (posted) {
      awaitParentAck(requestId, 180).then(function (acked) {
        if (!acked) renderLocalToast();
      });
      return;
    }
    renderLocalToast();
  }

  function alertFn(message, opts) {
    var msg = message == null ? '' : String(message);
    var key = msg;
    var now = Date.now();
    // Dedupe: auth may show modal then app catch calls alert(same message)
    if (key && key === lastAlertKey && now - lastAlertAt < 2500) {
      return undefined;
    }
    lastAlertKey = key;
    lastAlertAt = now;
    var o = opts && typeof opts === 'object' ? opts : {};
    showModal({
      title: o.title || 'Aviso',
      message: msg,
      variant: o.variant || 'info',
      mode: 'alert',
      openSettings: Boolean(o.openSettings),
      okLabel: o.okLabel || 'Entendi',
    });
    return undefined;
  }

  function confirmFn(message, opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    return showModal({
      title: o.title || 'Confirmar',
      message: message == null ? '' : String(message),
      variant: o.variant || 'info',
      mode: 'confirm',
      okLabel: o.okLabel,
      cancelLabel: o.cancelLabel,
    });
  }

  function promptFn(message, defaultValue, opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    return showModal({
      title: o.title || 'Introduzir',
      message: message == null ? '' : String(message),
      variant: o.variant || 'info',
      mode: 'prompt',
      defaultValue: defaultValue,
      okLabel: o.okLabel || 'OK',
      cancelLabel: o.cancelLabel,
    });
  }

  // Patch native alert so generated apps (catch → alert(err.message)) get GoCreate styling.
  // confirm/prompt stay native for sync return values; apps should use GoCreateUI.confirm/prompt (Promise).
  try {
    if (typeof global.alert === 'function') {
      global.alert = function (message) {
        alertFn(message);
      };
    }
  } catch (e) {
    /* ignore */
  }

  global.GoCreateUI = {
    alert: alertFn,
    toast: showToast,
    confirm: confirmFn,
    prompt: promptFn,
    modal: showModal,
    postParent: postParent,
    MSG_TYPE: MSG_TYPE,
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
