# Local h265web.js runtime for PyMKUI playback

These three files were copied from one successful local `compile_webcodec_worker.sh` build of the root SDK source (base `90f6eca` plus the uncommitted Job6 HTTP transport fix). They are loaded from the same origin as PyMKUI. The independent `h265web.js/static/` publication worktree was restored after the build; this copy is not a CDN update or SDK release.

| File | SHA-256 |
| --- | --- |
| `h265web.js` | `828dbf783063b6cf30217226e215b658cd3dc84813a8f1abd5b194ef513b8436` |
| `h265web_wasm.js` | `3964d4997a1e75d5990ab9a0e67ab8d5962b4cd58d0ae780d72630e23fa801be` |
| `h265web_wasm.wasm` | `e2bc58cd2d349fb628ed112f5d26d26cd0edd430f4fb068b7eeeef5e0ac2ad88` |

The trial uses HTTP-FLV and HTTP-TS only. The old HLS extension files are intentionally not loaded. Serving these files still requires correct JavaScript/WASM MIME types and the SDK's cross-origin isolation settings for pthread support.
