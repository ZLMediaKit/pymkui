# h265web.js runtime for PyMKUI playback

The JavaScript, WASM loader and WASM binary are copied together from one validated h265web.js build. The adjacent `models/sr/` directory includes the fixed experimental SDR model, manifest and licenses. Shared `demo-enhancements.js` and `.css` provide the same playback enhancement controls as the SDK demos.

| File | SHA-256 |
| --- | --- |
| `h265web_wasm.js` | `e4efc307df982f42e822d65ad657a89a8aacf3ba63d75133e13b32680aa3ed7d` |
| `h265web_wasm.wasm` | `451b6bd56a1f092e3913f7f1d8a8f13993363fd4492177c45174d28e00b802d6` |
| `h265web.js` | `6c88bbdec1b98dd15f4ea550f619c5a19095e56ea48f1c9a8bfe6521949c2df3` |
| `models/sr/model.json` | `591994d189f61f080bd5a987e5bf05fbf7ffcb4737ccb6ba2b3d8a60ed24a1d4` |
| `models/sr/WEBSR-LICENSE.txt` | `32efd167268c181f862e1b9e805c872106a405bd487c54273fc1b0a9137cf3d3` |
| `models/sr/an.json` | `aecd5bf215a8962a13e38a8623433a7477f853ccdaefe8b6274f9aa6828368e0` |
| `models/sr/ANIME4K-LICENSE.txt` | `5bad448b737378e3d0c977ad0d0521fa37ad279a7e76ea9a31d9257eeb6953f5` |

The SDK integration covers HTTP-FLV/HTTP-TS live streams, HEVC MPEG-TS HLS, bounded AVC native-HLS error fallback, and single MP4/WebM recordings. Both enhancements default to off. Stable volume can be switched during playback without changing user volume or mute. SDR super resolution starts with the next available output level; users may select automatic output or an available fixed size. The panel shows the actual result and the reason when the original picture is used.

Arbitrary media starts with unknown input color. Confirmed SDR is applied when building the player. The explicit apply action releases the previous instance and reloads within the same dialog, preserving enhancement preferences and mute. Live reload obtains fresh playback authorization; recording reload starts from the beginning.

Serve the complete directory from the PyMKUI origin with JavaScript/WASM MIME types and cross-origin isolation headers required by the SDK. The model is fetched on demand. Native HTTP-fMP4, WHEP and full-day recording routes retain their existing playback controls; HEVC HLS-fMP4 retains its explicit support boundary.
