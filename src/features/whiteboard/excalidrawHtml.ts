/**
 * Static HTML that hosts the real Excalidraw inside a WebView.
 *
 * Mirrors the `interior-os backend` web app's whiteboard implementation
 * (`@excalidraw/excalidraw`) — same library, same UX, just wrapped in a
 * React Native `<WebView>` so we can ship it on iOS / Android / tablet /
 * phone with one code path. We pin to **v0.17.6** because v0.18+ is
 * ESM-only and no longer ships the `dist/excalidraw.production.min.js`
 * UMD bundle that script-tag loading needs.
 *
 * Bridge protocol (window.ReactNativeWebView.postMessage):
 *   RN  → Web : injects `window.__INITIAL_STATE__` before load
 *   Web → RN  : { type: 'boot', stage }                 — debug breadcrumb
 *   Web → RN  : { type: 'ready' }                       — Excalidraw mounted
 *   Web → RN  : { type: 'change', count, dirty }        — debounced edits
 *   Web → RN  : { type: 'save',  data: <JSON string>  } — full scene
 *   Web → RN  : { type: 'export', svg: <string> }       — thumbnail SVG
 *   Web → RN  : { type: 'error', stage, message }       — surfaced to UI
 *   RN  → Web : { type: 'requestSave' }                 — ask for current scene
 *   RN  → Web : { type: 'requestExport' }               — ask for thumbnail
 *
 * Excalidraw + React are loaded from unpkg on first open (~600 KB) and
 * cached by the WebView for subsequent loads. Excalidraw v0.18 inlines
 * its own CSS so no separate stylesheet link is needed.
 */
export function buildExcalidrawHtml(initialState: {
  data?: string;
}): string {
  const initialJson = JSON.stringify(initialState ?? {});
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>Whiteboard</title>
  <style>
    html, body, #root { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
    body { background: #FFFFFF; -webkit-tap-highlight-color: transparent; font-family: -apple-system, system-ui, sans-serif; }
    /* Visible boot status — replaced by Excalidraw once it mounts. */
    #boot {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px; padding: 24px; text-align: center;
      background: #FFFFFF; z-index: 1; pointer-events: none;
    }
    #boot .label { color: #475569; font-size: 13px; font-weight: 600; letter-spacing: 0.4px; }
    #boot .stage { color: #94A3B8; font-size: 11px; font-family: ui-monospace, Menlo, monospace; }
    #boot .err {
      color: #DC2626; font-size: 12px; font-family: ui-monospace, Menlo, monospace;
      max-width: 320px; word-break: break-word; white-space: pre-wrap;
    }
    .booted #boot { display: none; }
    /* Hide Excalidraw's "Help" floating button — RN owns the chrome */
    button[aria-label="Help"] { display: none !important; }
    /* Strip every external-link surface inside Excalidraw -- we ship
       this whiteboard inside a native app; users should never leave
       the app from the canvas. */
    .excalidraw .library-menu-browse-button,
    .excalidraw .App-menu_top__left .github-corner,
    .excalidraw .encrypted-icon,
    .excalidraw .welcome-screen-decor a[href],
    .excalidraw a[href^="http"],
    .excalidraw a[href^="https"] { display: none !important; }
  </style>
</head>
<body>
  <div id="boot">
    <div class="label">Loading whiteboard…</div>
    <div class="stage" id="boot-stage">starting</div>
    <div class="err" id="boot-err"></div>
  </div>
  <div id="root"></div>

  <script>
    // Stash initial state from RN before any other JS runs.
    window.__INITIAL_STATE__ = ${initialJson};

    function post(msg) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        }
      } catch (e) {}
    }
    function setStage(s) {
      var el = document.getElementById('boot-stage');
      if (el) el.textContent = s;
      post({ type: 'boot', stage: s });
    }
    function showError(stage, message) {
      var el = document.getElementById('boot-err');
      if (el) el.textContent = '[' + stage + '] ' + message;
      post({ type: 'error', stage: stage, message: String(message) });
    }
    window.addEventListener('error', function (e) {
      showError('window.error', (e && e.message) || 'unknown');
    });
    window.addEventListener('unhandledrejection', function (e) {
      showError('unhandledrejection', (e && e.reason && e.reason.message) || String(e.reason));
    });

    // Helper: load a script with onerror reporting.
    function loadScript(url) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        s.async = false;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('failed to load ' + url)); };
        document.body.appendChild(s);
      });
    }

    // Excalidraw v0.18+ ships ESM-only -- no more dist/excalidraw.production.min.js
    // UMD bundle. v0.17.6 is the last release with that file, so we pin to it
    // (still actively-used, identical UX to v0.18 for our needs).
    // (No backticks in this comment -- the whole HTML lives in a template literal.)
    setStage('loading react');
    loadScript('https://unpkg.com/react@18.3.1/umd/react.production.min.js')
      .then(function () {
        setStage('loading react-dom');
        return loadScript('https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js');
      })
      .then(function () {
        setStage('loading excalidraw');
        return loadScript('https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/excalidraw.production.min.js');
      })
      .then(function () {
        setStage('mounting');
        boot();
      })
      .catch(function (err) {
        // Fallback: try jsDelivr if unpkg is being flaky.
        setStage('retrying via jsdelivr');
        loadScript('https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@0.17.6/dist/excalidraw.production.min.js')
          .then(function () { setStage('mounting'); boot(); })
          .catch(function (err2) {
            showError('loadScript', (err.message || String(err)) + ' / ' + (err2.message || String(err2)));
          });
      });

    function boot() {
      try {
        var ExcalidrawLib = window.ExcalidrawLib;
        if (!ExcalidrawLib) {
          showError('boot', 'window.ExcalidrawLib is undefined after script load');
          return;
        }
        var React = window.React;
        var ReactDOM = window.ReactDOM;
        var Excalidraw = ExcalidrawLib.Excalidraw;
        var MainMenu = ExcalidrawLib.MainMenu;
        var serializeAsJSON = ExcalidrawLib.serializeAsJSON;
        var exportToSvg = ExcalidrawLib.exportToSvg;
        var restore = ExcalidrawLib.restore;

        var apiRef = { current: null };

        function App() {
          var setApi = React.useCallback(function (api) { apiRef.current = api; }, []);

          var initial = window.__INITIAL_STATE__ || {};
          var initialData = React.useMemo(function () {
            try {
              if (initial.data) {
                var parsed = typeof initial.data === 'string' ? JSON.parse(initial.data) : initial.data;
                return restore(parsed, null, null);
              }
            } catch (e) { showError('restore', e.message || String(e)); }
            return {
              elements: [],
              appState: { viewBackgroundColor: '#FFFFFF' },
            };
          }, []);

          // RN → Web message handler
          React.useEffect(function () {
            var handler = function (e) {
              try {
                var msg = JSON.parse(e.data);
                if (msg.type === 'requestSave' && apiRef.current) {
                  var data = serializeAsJSON(
                    apiRef.current.getSceneElements(),
                    apiRef.current.getAppState(),
                    apiRef.current.getFiles(),
                    'local'
                  );
                  post({ type: 'save', data: data });
                } else if (msg.type === 'requestExport' && apiRef.current) {
                  exportToSvg({
                    elements: apiRef.current.getSceneElements(),
                    appState: apiRef.current.getAppState(),
                    files: apiRef.current.getFiles(),
                    exportPadding: 8,
                  }).then(function (svg) {
                    post({ type: 'export', svg: svg.outerHTML });
                  }).catch(function (e) { showError('export', e.message || String(e)); });
                }
              } catch (e) { showError('handler', e.message || String(e)); }
            };
            window.addEventListener('message', handler);
            document.addEventListener('message', handler);
            return function () {
              window.removeEventListener('message', handler);
              document.removeEventListener('message', handler);
            };
          }, []);

          // Track scene changes — lightweight ping (count + dirty flag).
          var changeTimer = React.useRef(null);
          var lastSnapshot = React.useRef('');
          var handleChange = React.useCallback(function (elements) {
            if (changeTimer.current) clearTimeout(changeTimer.current);
            changeTimer.current = setTimeout(function () {
              var visible = elements.filter(function (e) { return !e.isDeleted; });
              var snap = JSON.stringify(visible.map(function (e) {
                return [e.id, e.versionNonce];
              }));
              var dirty = snap !== lastSnapshot.current;
              lastSnapshot.current = snap;
              post({ type: 'change', count: visible.length, dirty: dirty });
            }, 250);
          }, []);

          // Ready ping + remove the boot overlay
          React.useEffect(function () {
            var t = setTimeout(function () {
              document.body.classList.add('booted');
              post({ type: 'ready' });
            }, 100);
            return function () { clearTimeout(t); };
          }, []);

          // Custom MainMenu: ONLY the items we want exposed inside our
          // native app. Replaces Excalidraw's default menu (which links
          // to GitHub / Discord / Twitter / "Excalidraw+" / library
          // browser -- none of which we want users navigating to from
          // inside SiteExpens).
          var customMenu = React.createElement(
            MainMenu,
            null,
            React.createElement(MainMenu.DefaultItems.ClearCanvas, null),
            React.createElement(MainMenu.Separator, null),
            React.createElement(MainMenu.DefaultItems.Help, null),
            React.createElement(MainMenu.DefaultItems.ChangeCanvasBackground, null)
          );

          return React.createElement(
            'div',
            { style: { width: '100vw', height: '100vh' } },
            React.createElement(Excalidraw, {
              excalidrawAPI: setApi,
              initialData: initialData,
              onChange: handleChange,
              UIOptions: {
                canvasActions: {
                  loadScene: false,
                  saveAsImage: false,
                  saveToActiveFile: false,
                  export: false,
                  changeViewBackgroundColor: true,
                },
              },
            }, customMenu)
          );
        }

        var root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
      } catch (e) {
        showError('boot', e.message || String(e));
      }
    }
  </script>
</body>
</html>`;
}
