/*! Tariq embed widget launcher — injects a floating chat button and lazy-loads the iframe panel. */
(function () {
  "use strict";

  // ---------- Idempotency ----------
  if (window.__tariqWidgetLoaded) return;
  window.__tariqWidgetLoaded = true;

  // ---------- Self-locate and read data-* ----------
  var script = document.currentScript;
  if (!script) {
    // Fallback: find a script tag that matches widget.js (rare — currentScript is supported in all modern browsers).
    var candidates = document.querySelectorAll("script[src*='widget.js']");
    script = candidates[candidates.length - 1] || null;
  }
  if (!script) {
    console.error("[Tariq] could not locate widget script tag");
    return;
  }

  var app = script.getAttribute("data-app");
  if (!app) {
    console.error("[Tariq] data-app is required on script tag");
    return;
  }

  function detectLocale() {
    var explicit = script.getAttribute("data-locale");
    if (explicit === "fa" || explicit === "en") return explicit;
    var htmlLang = (document.documentElement.lang || "").toLowerCase();
    return htmlLang.indexOf("fa") === 0 ? "fa" : "en";
  }

  function computeEmbedOrigin() {
    var explicit = script.getAttribute("data-src");
    if (explicit) return explicit.replace(/\/+$/, "");
    try {
      var u = new URL(script.src, window.location.href);
      // Strip filename to get origin + path base (e.g. https://chat.example.com -> same).
      var path = u.pathname.replace(/\/[^/]*$/, "");
      return u.origin + path;
    } catch (e) {
      console.error("[Tariq] failed to compute embed origin", e);
      return window.location.origin;
    }
  }

  var locale = detectLocale();
  var position = script.getAttribute("data-position") === "bottom-start" ? "bottom-start" : "bottom-end";
  var theme = script.getAttribute("data-theme") || "auto";
  var greeting = script.getAttribute("data-greeting") || "";
  var embedBase = computeEmbedOrigin();
  var iframeOrigin;
  try {
    iframeOrigin = new URL(embedBase).origin;
  } catch (e) {
    iframeOrigin = window.location.origin;
  }

  var isRTL = locale === "fa";
  var labels = {
    open: isRTL ? "باز کردن چت" : "Open chat",
    close: isRTL ? "بستن چت" : "Close chat",
  };

  // ---------- Event bus ----------
  var listeners = { ready: [], open: [], close: [], message: [], authRequired: [] };
  function emit(name) {
    var handlers = listeners[name];
    if (!handlers) return;
    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](); } catch (e) { console.error("[Tariq] listener error", e); }
    }
  }

  // ---------- Host-site Keycloak token (optional) ----------
  // _token is set via window.Tariq.setToken(jwt) or boot-time data-token.
  // _tokenProvider, when set via window.Tariq.setTokenProvider(fn), is invoked
  // before each send so host code can return a fresh token (refresh-aware).
  var _token = script.getAttribute("data-token") || null;
  var _tokenProvider = null;

  function resolveToken() {
    if (typeof _tokenProvider === "function") {
      try {
        return Promise.resolve(_tokenProvider());
      } catch (e) {
        console.error("[Tariq] tokenProvider threw", e);
        return Promise.resolve(null);
      }
    }
    return Promise.resolve(_token);
  }

  function enqueueOrPost(payload) {
    if (iframeReady) postToIframe(payload);
    else pendingMessages.push(payload);
  }

  // Resolve token then enqueue/post `tariq:host:token` followed by `payload`,
  // preserving order so the iframe applies the token before processing the
  // dependent action (typically a sendMessage).
  function postWithToken(payload) {
    resolveToken().then(function (jwt) {
      if (typeof jwt === "string" && jwt.length > 0) {
        enqueueOrPost({ type: "tariq:host:token", token: jwt });
      }
      enqueueOrPost(payload);
    });
  }

  // ---------- CSS injection ----------
  var css = [
    "#tariq-launcher, #tariq-panel { all: initial; font-family: system-ui, -apple-system, \"Segoe UI\", sans-serif; box-sizing: border-box; }",
    "#tariq-launcher *, #tariq-panel * { box-sizing: border-box; }",
    "#tariq-launcher {",
    "  position: fixed; bottom: 16px; z-index: 2147483000;",
    "  width: 56px; height: 56px; border-radius: 50%;",
    "  background: #00a389; color: #fff; cursor: pointer;",
    "  display: flex; align-items: center; justify-content: center;",
    "  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.12);",
    "  border: none; padding: 0;",
    "  transition: transform 180ms ease, box-shadow 180ms ease;",
    "}",
    "#tariq-launcher:hover { transform: scale(1.06); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22), 0 3px 8px rgba(0, 0, 0, 0.14); }",
    "#tariq-launcher:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }",
    "#tariq-launcher.tariq-pos-end { " + (isRTL ? "left: 16px;" : "right: 16px;") + " }",
    "#tariq-launcher.tariq-pos-start { " + (isRTL ? "right: 16px;" : "left: 16px;") + " }",
    "#tariq-launcher .tariq-icon { width: 26px; height: 26px; display: block; }",
    "#tariq-launcher .tariq-unread {",
    "  position: absolute; top: 6px;" + (isRTL ? " left: 6px;" : " right: 6px;"),
    "  width: 12px; height: 12px; border-radius: 50%; background: #ef4444;",
    "  border: 2px solid #fff; display: none;",
    "}",
    "#tariq-launcher.tariq-has-unread .tariq-unread { display: block; }",
    "#tariq-panel {",
    "  position: fixed; bottom: 88px; z-index: 2147482999;",
    "  width: 380px; height: 600px; max-height: calc(100vh - 104px);",
    "  border-radius: 16px; overflow: hidden;",
    "  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25), 0 8px 20px rgba(0, 0, 0, 0.12);",
    "  background: #fff; display: none;",
    "  opacity: 0; transform: translateY(12px) scale(0.98);",
    "  transition: opacity 200ms ease, transform 200ms ease;",
    // content-visibility skips layout/paint while the panel is hidden;
    // contain isolates the panel from the host page so iframe load doesn't
    // trigger reflow on outer document content.
    "  content-visibility: auto;",
    "  contain-intrinsic-size: 600px 380px;",
    "  contain: layout style paint;",
    "}",
    "#tariq-panel.tariq-pos-end { " + (isRTL ? "left: 16px;" : "right: 16px;") + " }",
    "#tariq-panel.tariq-pos-start { " + (isRTL ? "right: 16px;" : "left: 16px;") + " }",
    "#tariq-panel.tariq-open { display: block; opacity: 1; transform: translateY(0) scale(1); }",
    "#tariq-panel iframe { width: 100%; height: 100%; border: 0; display: block; background: transparent; }",
    "@media (max-width: 639px) {",
    "  #tariq-panel {",
    "    top: 0; bottom: 0; left: 0; right: 0;",
    "    width: 100vw; height: 100vh; max-height: 100vh;",
    "    border-radius: 0;",
    "  }",
    "  #tariq-panel.tariq-pos-end, #tariq-panel.tariq-pos-start { left: 0; right: 0; }",
    "}",
  ].join("\n");

  var styleTag = document.createElement("style");
  styleTag.setAttribute("data-tariq", "widget-styles");
  styleTag.appendChild(document.createTextNode(css));
  document.head.appendChild(styleTag);

  // ---------- Launcher button ----------
  var posClass = position === "bottom-start" ? "tariq-pos-start" : "tariq-pos-end";
  var chatIconSVG =
    '<svg class="tariq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var closeIconSVG =
    '<svg class="tariq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  var launcher = document.createElement("button");
  launcher.id = "tariq-launcher";
  launcher.type = "button";
  launcher.className = posClass;
  launcher.setAttribute("aria-label", labels.open);
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = chatIconSVG + '<span class="tariq-unread" aria-hidden="true"></span>';

  var panel = document.createElement("div");
  panel.id = "tariq-panel";
  panel.className = posClass;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", isRTL ? "پنل چت" : "Chat panel");

  function mountRoots() {
    if (document.body) {
      document.body.appendChild(launcher);
      document.body.appendChild(panel);
    } else {
      document.addEventListener("DOMContentLoaded", mountRoots, { once: true });
    }
  }
  mountRoots();

  // ---------- Iframe lifecycle ----------
  var iframe = null;
  var iframeReady = false;
  var pendingMessages = [];
  var isOpen = false;

  function buildIframeUrl() {
    var url = embedBase + "/embed/" + locale + "?app=" + encodeURIComponent(app);
    if (greeting) url += "&greeting=" + encodeURIComponent(greeting);
    if (theme && theme !== "auto") url += "&theme=" + encodeURIComponent(theme);
    // Pass the parent origin so the iframe can target postMessages back to
    // exactly this host instead of falling back to "*". The iframe still
    // validates the value against its own allowlist before trusting it.
    url += "&origin=" + encodeURIComponent(window.location.origin);
    return url;
  }

  function ensureIframe() {
    if (iframe) return iframe;
    iframe = document.createElement("iframe");
    iframe.src = buildIframeUrl();
    iframe.setAttribute("title", isRTL ? "چت طارق" : "Tariq chat");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    panel.appendChild(iframe);
    return iframe;
  }

  function postToIframe(payload) {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(payload, iframeOrigin);
  }

  function flushPending() {
    if (!iframeReady) return;
    while (pendingMessages.length) {
      postToIframe(pendingMessages.shift());
    }
  }

  // ---------- Open / close ----------
  function setLauncherState(open) {
    launcher.innerHTML =
      (open ? closeIconSVG : chatIconSVG) +
      '<span class="tariq-unread" aria-hidden="true"></span>';
    launcher.setAttribute("aria-label", open ? labels.close : labels.open);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function open() {
    if (isOpen) return;
    ensureIframe();
    panel.classList.add("tariq-open");
    launcher.classList.remove("tariq-has-unread");
    setLauncherState(true);
    isOpen = true;
    postToIframe({ type: "tariq:host:open" });
    // Defer focus until after the open transition has produced layout. Two
    // rAFs guarantee the panel is laid out and painted before we move focus,
    // avoiding the 50ms setTimeout race that previously fought the
    // transition and forced a synchronous reflow.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          try { iframe && iframe.focus(); } catch (e) { /* noop */ }
        });
      });
    } else {
      try { iframe && iframe.focus(); } catch (e) { /* noop */ }
    }
    emit("open");
  }

  function close() {
    if (!isOpen) return;
    panel.classList.remove("tariq-open");
    setLauncherState(false);
    isOpen = false;
    postToIframe({ type: "tariq:host:close" });
    try { launcher.focus(); } catch (e) { /* noop */ }
    emit("close");
  }

  function toggle() { isOpen ? close() : open(); }

  launcher.addEventListener("click", toggle);

  // ---------- Keyboard (Esc closes when focused inside panel) ----------
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) {
      e.stopPropagation();
      close();
    }
  });

  // ---------- postMessage from iframe ----------
  window.addEventListener("message", function (event) {
    if (event.origin !== iframeOrigin) return;
    var data = event.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;
    if (data.type.indexOf("tariq:widget:") !== 0) return;

    switch (data.type) {
      case "tariq:widget:ready":
        iframeReady = true;
        flushPending();
        // Push token (if any) right after ready so the next user message picks it up.
        resolveToken().then(function (jwt) {
          if (typeof jwt === "string" && jwt.length > 0) {
            postToIframe({ type: "tariq:host:token", token: jwt });
          }
        });
        emit("ready");
        break;
      case "tariq:widget:messageReceived":
        if (!isOpen) launcher.classList.add("tariq-has-unread");
        emit("message");
        break;
      case "tariq:widget:closeRequested":
        close();
        break;
      case "tariq:widget:authRequired":
        emit("authRequired");
        break;
    }
  });

  // ---------- window.Tariq API ----------
  var api = {
    open: open,
    close: close,
    toggle: toggle,
    sendMessage: function (text) {
      if (typeof text !== "string" || !text) return;
      if (!isOpen) open();
      postWithToken({ type: "tariq:host:sendMessage", text: text });
    },
    reset: function () {
      enqueueOrPost({ type: "tariq:host:reset" });
    },
    setLocale: function (next) {
      if (next !== "fa" && next !== "en") return;
      enqueueOrPost({ type: "tariq:host:setLocale", locale: next });
    },
    setToken: function (jwt) {
      if (typeof jwt !== "string" || !jwt) return;
      _token = jwt;
      enqueueOrPost({ type: "tariq:host:token", token: jwt });
    },
    setTokenProvider: function (fn) {
      if (typeof fn !== "function") return;
      _tokenProvider = fn;
      // Push immediately so the iframe has a token even before the first send.
      resolveToken().then(function (jwt) {
        if (typeof jwt === "string" && jwt.length > 0) {
          enqueueOrPost({ type: "tariq:host:token", token: jwt });
        }
      });
    },
    clearToken: function () {
      _token = null;
      _tokenProvider = null;
      enqueueOrPost({ type: "tariq:host:clearToken" });
    },
    on: function (event, handler) {
      if (!listeners[event] || typeof handler !== "function") return;
      listeners[event].push(handler);
    },
    off: function (event, handler) {
      var arr = listeners[event];
      if (!arr) return;
      var i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    },
  };

  window.Tariq = api;
})();
