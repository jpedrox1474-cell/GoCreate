/**
 * GoCreate Auth runtime — Sandpack preview + published /p/* pages.
 * Generated apps call window.GoCreateAuth.signInWithGoogle() for real Firebase Google Auth.
 *
 * When running inside an iframe (Sandpack on *.codesandbox.io), OAuth must run on the
 * parent origin (gocreate.web.app) via postMessage — Firebase rejects unauthorized domains.
 *
 * After Google sign-in, access is gated by project.authAccess (owner_only | invited).
 *
 * Expects (optional):
 *   window.__GOCREATE_FIREBASE_CONFIG__ — public Firebase web config
 *   window.__GOCREATE_PROJECT_ID__      — project id (scoped auth)
 *   window.__GOCREATE_API_BASE__        — API origin for auth-check
 *   window.__GOCREATE_AUTH_ACCESS__     — optional cached { mode, invitedEmails, ownerEmail, ownerId }
 */
(function (global) {
  if (global.GoCreateAuth) return;

  var FIREBASE_VERSION = '10.14.1';
  var MSG_TYPE = 'gocreate-auth';
  var AUTH_DENIED = 'Sem permissão para aceder a este projeto';
  var readyPromise = null;
  var bridgeReqSeq = 0;
  var pendingBridge = Object.create(null);
  var bridgeUser = null;
  var bridgeAuthListeners = [];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', function () {
          resolve();
        });
        existing.addEventListener('error', function () {
          reject(new Error('Falha ao carregar ' + src));
        });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Falha ao carregar ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function serializeUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      emailVerified: Boolean(user.emailVerified),
      providerId: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || 'google.com',
    };
  }

  function isInIframe() {
    try {
      return global.self !== global.top;
    } catch (e) {
      return true;
    }
  }

  function normalizeEmail(email) {
    return String(email || '')
      .trim()
      .toLowerCase();
  }

  function denyAccessError() {
    var err = new Error(AUTH_DENIED);
    err.code = 'AUTH_ACCESS_DENIED';
    return err;
  }

  function friendlyAuthError(err) {
    var code = (err && (err.code || err.errorCode)) || '';
    if (code === 'AUTH_ACCESS_DENIED') {
      var denied = denyAccessError();
      return denied;
    }
    var map = {
      'auth/unauthorized-domain':
        'Este domínio de preview não está autorizado para login Google. Recarrega a página — o GoCreate autentica pela janela principal.',
      'auth/popup-closed-by-user': 'Login cancelado.',
      'auth/popup-blocked': 'O browser bloqueou o popup de login. Permite popups para este site e tenta de novo.',
      'auth/cancelled-popup-request': 'Login cancelado (outro popup já estava aberto).',
      'auth/network-request-failed': 'Falha de rede ao autenticar. Verifica a ligação e tenta de novo.',
      'auth/internal-error': 'Erro interno no login Google. Tenta novamente em alguns segundos.',
      NO_FIREBASE_CONFIG:
        'Firebase config em falta. Publica o app no GoCreate ou define window.__GOCREATE_FIREBASE_CONFIG__.',
      BRIDGE_TIMEOUT: 'O login Google demorou demasiado. Tenta novamente.',
      BRIDGE_UNAVAILABLE:
        'Login Google indisponível neste preview. Abre o app no GoCreate (preview ou URL publicado).',
      BRIDGE_ERROR: 'Não foi possível autenticar com Google. Tenta novamente.',
      AUTH_ACCESS_DENIED: AUTH_DENIED,
    };
    var message = map[code] || (err && err.message) || 'Erro ao autenticar com Google.';
    if (message === AUTH_DENIED || /Sem permissão para aceder/i.test(String(message))) {
      return denyAccessError();
    }
    // Never surface raw English Firebase domain errors alone
    if (/unauthorized.?domain|not authorized for OAuth/i.test(String(message)) && code !== 'auth/unauthorized-domain') {
      message = map['auth/unauthorized-domain'];
      code = 'auth/unauthorized-domain';
    }
    var out = new Error(message);
    out.code = code || 'BRIDGE_ERROR';
    return out;
  }

  function localAccessAllowed(user) {
    var access = global.__GOCREATE_AUTH_ACCESS__;
    if (!access || typeof access !== 'object') return null; // unknown — defer to API
    var email = normalizeEmail(user && user.email);
    var uid = String((user && user.uid) || '').trim();
    var ownerId = String(access.ownerId || '').trim();
    var ownerEmail = normalizeEmail(access.ownerEmail);
    if (uid && ownerId && uid === ownerId) return true;
    if (email && ownerEmail && email === ownerEmail) return true;
    var mode = access.mode === 'invited' ? 'invited' : 'owner_only';
    if (mode === 'invited') {
      var list = Array.isArray(access.invitedEmails) ? access.invitedEmails : [];
      for (var i = 0; i < list.length; i++) {
        if (email && normalizeEmail(list[i]) === email) return true;
      }
    }
    return false;
  }

  async function assertProjectAuthAccess(user) {
    if (!user) throw denyAccessError();
    var projectId = global.__GOCREATE_PROJECT_ID__;
    if (!projectId) return user;

    var apiBase = String(global.__GOCREATE_API_BASE__ || '').replace(/\/$/, '');
    if (apiBase) {
      try {
        var res = await fetch(apiBase + '/api/projects/' + encodeURIComponent(projectId) + '/auth-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email || null, uid: user.uid || null }),
        });
        var data = {};
        try {
          data = await res.json();
        } catch (e) {
          data = {};
        }
        if (res.ok && data.allowed) return user;
        if (res.status === 403 || data.code === 'AUTH_ACCESS_DENIED' || data.allowed === false) {
          throw denyAccessError();
        }
        // Non-403 API failure → fall through to local cache
      } catch (err) {
        if (err && err.code === 'AUTH_ACCESS_DENIED') throw err;
        /* network — try local */
      }
    }

    var local = localAccessAllowed(user);
    if (local === true) return user;
    if (local === false) throw denyAccessError();
    // No API and no cache: fail closed for published apps (project id present)
    throw denyAccessError();
  }

  async function signOutQuiet() {
    try {
      if (isInIframe()) {
        notifyBridgeListeners(null);
      }
      var auth = await ensureFirebase();
      await auth.signOut();
    } catch (e) {
      /* ignore */
    }
  }

  function ensureFirebase() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      var config = global.__GOCREATE_FIREBASE_CONFIG__;
      if (!config || !config.apiKey || !config.authDomain || !config.projectId) {
        var err = new Error(
          'Firebase config em falta. Publica o app no GoCreate ou define window.__GOCREATE_FIREBASE_CONFIG__.'
        );
        err.code = 'NO_FIREBASE_CONFIG';
        throw err;
      }

      var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
      if (!global.firebase || !global.firebase.app) {
        await loadScript(base + 'firebase-app-compat.js');
      }
      if (!global.firebase || !global.firebase.auth) {
        await loadScript(base + 'firebase-auth-compat.js');
      }

      if (!global.firebase.apps || !global.firebase.apps.length) {
        global.firebase.initializeApp(config);
      }
      return global.firebase.auth();
    })();
    return readyPromise;
  }

  function onParentMessage(event) {
    var data = event && event.data;
    if (!data || data.type !== MSG_TYPE) return;
    if (data.action !== 'signInWithGoogleResult' && data.action !== 'signOutResult') return;
    var pending = pendingBridge[data.requestId];
    if (!pending) return;
    delete pendingBridge[data.requestId];
    clearTimeout(pending.timer);
    if (data.error) {
      pending.reject(friendlyAuthError(data.error));
      return;
    }
    pending.resolve(data);
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('message', onParentMessage);
  }

  function requestParentAuth(action, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!isInIframe() || !global.parent || global.parent === global.self) {
        var unavailable = new Error(
          'Login Google indisponível neste preview. Abre o app no GoCreate (preview ou URL publicado).'
        );
        unavailable.code = 'BRIDGE_UNAVAILABLE';
        reject(unavailable);
        return;
      }
      var requestId = 'gc-auth-' + Date.now() + '-' + ++bridgeReqSeq;
      var timer = setTimeout(function () {
        delete pendingBridge[requestId];
        var t = new Error('O login Google demorou demasiado. Tenta novamente.');
        t.code = 'BRIDGE_TIMEOUT';
        reject(t);
      }, timeoutMs || 120000);
      pendingBridge[requestId] = { resolve: resolve, reject: reject, timer: timer };
      try {
        global.parent.postMessage(
          {
            type: MSG_TYPE,
            action: action,
            requestId: requestId,
            projectId: global.__GOCREATE_PROJECT_ID__ || null,
          },
          '*'
        );
      } catch (err) {
        clearTimeout(timer);
        delete pendingBridge[requestId];
        reject(friendlyAuthError(err));
      }
    });
  }

  async function signInLocal() {
    var auth = await ensureFirebase();
    var provider = new global.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      var result = await auth.signInWithPopup(provider);
      var user = serializeUser(result.user);
      try {
        await assertProjectAuthAccess(user);
      } catch (accessErr) {
        await signOutQuiet();
        throw accessErr;
      }
      return user;
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }

  function notifyBridgeListeners(user) {
    bridgeUser = user || null;
    for (var i = 0; i < bridgeAuthListeners.length; i++) {
      try {
        bridgeAuthListeners[i](bridgeUser);
      } catch (e) {
        /* ignore listener errors */
      }
    }
  }

  async function applyCredentialFromParent(payload) {
    var user = payload && payload.user ? payload.user : null;
    if (!payload || !payload.idToken) {
      notifyBridgeListeners(user);
      return user;
    }
    try {
      var auth = await ensureFirebase();
      var credential = global.firebase.auth.GoogleAuthProvider.credential(payload.idToken);
      var result = await auth.signInWithCredential(credential);
      user = serializeUser(result.user) || user;
      notifyBridgeListeners(user);
      return user;
    } catch (err) {
      // Credential apply may still fail on some sandboxes — keep parent user in memory
      console.warn('[GoCreateAuth] signInWithCredential falhou; a usar user do parent.', err);
      notifyBridgeListeners(user);
      return user;
    }
  }

  async function signInViaParentBridge() {
    var payload = await requestParentAuth('signInWithGoogle', 120000);
    var user = await applyCredentialFromParent(payload);
    try {
      await assertProjectAuthAccess(user);
    } catch (accessErr) {
      await signOutQuiet();
      try {
        await requestParentAuth('signOut', 10000);
      } catch (e) {
        /* ignore */
      }
      throw accessErr;
    }
    return user;
  }

  global.GoCreateAuth = {
    signInWithGoogle: function () {
      if (isInIframe()) {
        return signInViaParentBridge().catch(function (err) {
          throw friendlyAuthError(err);
        });
      }
      return signInLocal();
    },
    signOut: function () {
      if (isInIframe()) {
        return requestParentAuth('signOut', 30000)
          .catch(function () {
            /* parent may ignore signOut — still clear local */
          })
          .then(function () {
            notifyBridgeListeners(null);
            return ensureFirebase()
              .then(function (auth) {
                return auth.signOut();
              })
              .catch(function () {});
          })
          .catch(function (err) {
            throw friendlyAuthError(err);
          });
      }
      return ensureFirebase()
        .then(function (auth) {
          return auth.signOut();
        })
        .catch(function (err) {
          throw friendlyAuthError(err);
        });
    },
    getCurrentUser: function () {
      if (isInIframe() && bridgeUser) {
        return Promise.resolve(bridgeUser);
      }
      return ensureFirebase().then(function (auth) {
        return serializeUser(auth.currentUser) || bridgeUser;
      });
    },
    onAuthStateChanged: function (callback) {
      if (typeof callback !== 'function') {
        return function () {};
      }
      var unsub = null;
      var cancelled = false;
      bridgeAuthListeners.push(callback);
      // Immediate bridge snapshot for iframe apps
      try {
        callback(bridgeUser);
      } catch (e) {
        /* ignore */
      }
      ensureFirebase()
        .then(function (auth) {
          if (cancelled) return;
          unsub = auth.onAuthStateChanged(function (user) {
            var serialized = serializeUser(user) || bridgeUser;
            if (serialized) bridgeUser = serialized;
            callback(serialized);
          });
        })
        .catch(function () {
          /* config missing — bridge-only mode still works */
        });
      return function () {
        cancelled = true;
        bridgeAuthListeners = bridgeAuthListeners.filter(function (cb) {
          return cb !== callback;
        });
        if (typeof unsub === 'function') unsub();
      };
    },
    /** @deprecated internal */
    _isInIframe: isInIframe,
    version: '1.2.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
