# h265web.js runtime for PyMKUI playback

The WASM files come from one successful `compile_webcodec_worker.sh` build of the h265web.js SDK source, including the HTTP transport fix. The JavaScript bundle was rebuilt from the same source with the production `REMOVE_FUNCS` setting and the SDK script-load `console.info` message. All three files match `h265web.js/static/` byte-for-byte and are loaded from the same origin as PyMKUI.

| File | SHA-256 |
| --- | --- |
| `h265web.js` | `9a4b4d503f02deec5542cd1e9c5956604caf022fd436f2624b6a7e61db3758d8` |
| `h265web_wasm.js` | `3964d4997a1e75d5990ab9a0e67ab8d5962b4cd58d0ae780d72630e23fa801be` |
| `h265web_wasm.wasm` | `e2bc58cd2d349fb628ed112f5d26d26cd0edd430f4fb068b7eeeef5e0ac2ad88` |

PyMKUI uses this runtime for its RTMP and TS stream rows through HTTP-FLV and HTTP-TS. The old HLS extension files are intentionally not loaded. Serving these files requires correct JavaScript/WASM MIME types and the SDK's cross-origin isolation settings for pthread support.
