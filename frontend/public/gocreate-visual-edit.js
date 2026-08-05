/**
 * GoCreate visual edit bridge — runs inside Sandpack preview iframe.
 * Parent toggles via postMessage { type: 'gocreate-visual-edit-set', enabled }.
 * Selection posts { type: 'gocreate-visual-edit-select', payload } to parent.
 */
(function (global) {
  if (global.__GOCREATE_VISUAL_EDIT_INSTALLED__) return;
  global.__GOCREATE_VISUAL_EDIT_INSTALLED__ = true;

  var MSG_SET = 'gocreate-visual-edit-set';
  var MSG_SELECT = 'gocreate-visual-edit-select';
  var MSG_READY = 'gocreate-visual-edit-ready';
  var STYLE_ID = 'gocreate-visual-edit-style';
  var enabled = false;
  var hoverEl = null;
  var selectedEl = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.gocreate-ve-hover{outline:2px dashed #3b82f6!important;outline-offset:2px!important;cursor:crosshair!important;}' +
      '.gocreate-ve-selected{outline:2px solid #2563eb!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(37,99,235,.25)!important;}' +
      'body.gocreate-ve-on,body.gocreate-ve-on *{cursor:crosshair!important;}';
    (document.head || document.documentElement).appendChild(style);
  }

  function clearHover() {
    if (hoverEl && hoverEl !== selectedEl) {
      hoverEl.classList.remove('gocreate-ve-hover');
    }
    hoverEl = null;
  }

  function clearSelected() {
    if (selectedEl) selectedEl.classList.remove('gocreate-ve-selected');
    selectedEl = null;
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    ensureStyle();
    if (!enabled) {
      clearHover();
      clearSelected();
      if (document.body) document.body.classList.remove('gocreate-ve-on');
      return;
    }
    if (document.body) document.body.classList.add('gocreate-ve-on');
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur.nodeType === 1 && depth < 6 && cur !== document.body) {
      var part = cur.tagName.toLowerCase();
      if (cur.id) {
        part += '#' + cur.id;
        parts.unshift(part);
        break;
      }
      var cls = (cur.className && typeof cur.className === 'string'
        ? cur.className
        : ''
      )
        .trim()
        .split(/\s+/)
        .filter(function (c) {
          return c && c.indexOf('gocreate-ve-') !== 0;
        })
        .slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      var parent = cur.parentElement;
      if (parent) {
        var siblings = parent.children;
        var same = 0;
        var index = 0;
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i].tagName === cur.tagName) {
            same++;
            if (siblings[i] === cur) index = same;
          }
        }
        if (same > 1) part += ':nth-of-type(' + index + ')';
      }
      parts.unshift(part);
      cur = parent;
      depth++;
    }
    return parts.join(' > ');
  }

  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    var text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    var classes = (el.className && typeof el.className === 'string' ? el.className : '')
      .trim()
      .split(/\s+/)
      .filter(function (c) {
        return c && c.indexOf('gocreate-ve-') !== 0;
      })
      .slice(0, 6);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: classes,
      text: text,
      path: cssPath(el),
    };
  }

  function postSelect(el) {
    var payload = describe(el);
    if (!payload) return;
    try {
      global.parent.postMessage({ type: MSG_SELECT, payload: payload }, '*');
    } catch (_) {
      /* ignore */
    }
  }

  function onPointerOver(e) {
    if (!enabled) return;
    var el = e.target;
    if (!el || el === document.documentElement || el === document.body) return;
    if (el === hoverEl) return;
    clearHover();
    hoverEl = el;
    if (el !== selectedEl) el.classList.add('gocreate-ve-hover');
  }

  function onPointerOut(e) {
    if (!enabled) return;
    if (e.target === hoverEl) clearHover();
  }

  function onClick(e) {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    clearHover();
    clearSelected();
    selectedEl = el;
    el.classList.add('gocreate-ve-selected');
    postSelect(el);
  }

  function onKeyDown(e) {
    if (!enabled) return;
    if (e.key === 'Escape') {
      clearSelected();
      try {
        global.parent.postMessage({ type: MSG_SELECT, payload: null }, '*');
      } catch (_) {
        /* ignore */
      }
    }
  }

  global.addEventListener('message', function (e) {
    var data = e && e.data;
    if (!data || data.type !== MSG_SET) return;
    setEnabled(data.enabled);
  });

  function bind() {
    ensureStyle();
    document.addEventListener('mouseover', onPointerOver, true);
    document.addEventListener('mouseout', onPointerOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    try {
      global.parent.postMessage({ type: MSG_READY }, '*');
    } catch (_) {
      /* ignore */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})(typeof window !== 'undefined' ? window : this);
