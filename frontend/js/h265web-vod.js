// Single-recording UI; media clocks and projection stay inside the SDK.
const H265WebVOD = (() => {
    let active = null, generation = 0, nextId = 0;
    let releasePending = Promise.resolve();
    function close() {
        ++generation;
        const session = active;
        active = null;
        if (session) {
            clearTimeout(session.timer);
            session.observer?.disconnect();
            session.modal.remove();
            if (session.player) {
                releasePending = new Promise((resolve, reject) => {
                    try { session.player.release(resolve); } catch (error) { reject(error); }
                });
            }
        }
        return releasePending;
    }
    async function open(record, format) {
        const pending = close();
        const epoch = generation;
        await pending;
        if (epoch !== generation) return;
        const session = {modal: document.createElement('div'), player: null, muted: true,
            duration: 0, ready: false, dragging: false, paused: false};
        active = session;
        const current = () => active === session && generation === epoch && session.modal.isConnected;
        const modal = session.modal;
        modal.id = 'recPlayerModal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm';
        modal.innerHTML = `<div class="bg-gray-900 rounded-2xl p-4 w-full max-w-3xl mx-4" style="max-height:95vh;overflow:auto">
            <div class="flex justify-between text-white"><span data-vod="title"></span><button data-vod="close" aria-label="关闭播放器">×</button></div>
            <div data-vod="viewport" style="aspect-ratio:16/9;background:black;position:relative"><div data-vod="player" style="width:100%;height:100%"></div></div>
            <div data-vod="status" class="text-white/70 text-sm mt-2" aria-live="polite">正在加载录像…</div>
            <div class="flex items-center gap-2 mt-2"><input data-vod="seek" aria-label="播放进度" type="range" min="0" max="0" step="0.1" value="0" disabled style="flex:1"><span data-vod="time" class="text-white text-sm">0:00 / 0:00</span></div>
            <div class="flex flex-wrap gap-2 mt-3" data-vod="controls">
                <button data-vod="play">播放</button><button data-vod="pause">暂停</button>
                <button data-vod="mute">取消静音</button><button data-vod="fullscreen">全屏</button><button data-vod="screenshot">截图</button>
                <button data-vod="vr">360°模式</button><button data-vod="reset" hidden>重置视角</button>
                <select data-vod="rate" aria-label="播放速度"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option></select>
            </div>
            <div data-vod="hint" hidden class="text-white/60 text-sm mt-2">拖动或触摸调整视角，滚轮缩放</div>
            <img data-vod="capture" hidden style="max-width:100%" alt="录像截图">
        </div>`;
        const el = role => modal.querySelector(`[data-vod="${role}"]`);
        el('title').textContent = record.file_name || '录像播放';
        el('controls').querySelectorAll('button,select').forEach(button => {
            button.className = 'bg-blue-600 text-white px-3 py-1 rounded';
            button.disabled = true;
        });
        const box = el('player');
        box.id = `h265web-recording-${++nextId}`;
        el('capture').id = `${box.id}-capture`;
        document.body.appendChild(modal);
        const clock = value => {
            const seconds = Math.max(0, Math.floor(Number(value) || 0));
            return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        };
        const progress = seconds => {
            if (!current()) return;
            if (!session.dragging) el('seek').value = seconds;
            el('time').textContent = `${clock(seconds)} / ${clock(session.duration)}`;
        };
        const status = () => {
            if (!current()) return;
            const vr = session.player?.get_vr_view()?.projection === 'erp360';
            el('vr').textContent = vr ? '平面模式' : '360°模式';
            el('reset').hidden = !vr;
            el('hint').hidden = !vr;
            el('status').textContent = `${session.paused ? '已暂停' : '播放中'}${vr ? '（360°）' : ''}${session.muted ? '（静音）' : ''}`;
        };
        const fail = message => {
            if (!current()) return;
            clearTimeout(session.timer);
            el('status').textContent = message;
        };
        modal.addEventListener('click', event => {
            if (event.target === modal || event.target.closest('[data-vod="close"]')) closeRecPlayer();
        });
        const action = (name, fn) => el(name).addEventListener('click', () => {
            if (current() && session.ready) fn(session.player);
        });
        action('play', player => { player.play(); session.paused = false; status(); });
        action('pause', player => { player.pause(); session.paused = true; status(); });
        action('mute', player => {
            session.muted = !session.muted;
            player.set_voice(session.muted ? 0 : 1);
            el('mute').textContent = session.muted ? '取消静音' : '静音'; status();
        });
        action('fullscreen', player => player.fullScreen());
        action('screenshot', player => { el('capture').hidden = false; player.screenshot(el('capture').id); });
        action('vr', player => {
            const next = player.get_vr_view().projection === 'erp360' ? 'flat' : 'erp360';
            if (!player.set_projection(next)) return fail('画面模式切换失败');
            player.set_vr_controls({mouse: next === 'erp360', touch: next === 'erp360'});
            status();
        });
        action('reset', player => player.reset_vr_view());
        el('seek').addEventListener('input', () => { session.dragging = true; });
        el('seek').addEventListener('change', () => {
            session.dragging = false;
            if (current() && session.ready) session.player.seek(Number(el('seek').value));
        });
        el('rate').addEventListener('change', () => {
            if (current() && session.ready) session.player.set_playback_rate(Number(el('rate').value));
        });
        try {
            await H265WebPyMKUI.loadSdk();
            if (!current()) return;
            const player = session.player = window.H265webjsPlayer();
            player.video_probe_callback = info => {
                if (!current()) return;
                session.duration = Number(info.duration) > 0 ? Number(info.duration) : 0;
                el('seek').max = session.duration;
                el('seek').disabled = session.duration <= 0;
                progress(0);
            };
            player.on_play_time = progress;
            player.on_play_finished = () => { session.paused = true; status(); };
            player.on_ready_show_done_callback = () => {
                if (!current()) return;
                clearTimeout(session.timer);
                session.ready = true;
                el('controls').querySelectorAll('button,select').forEach(button => { button.disabled = false; });
                status();
            };
            player.on_error_callback = error => {
                if (!current()) return;
                if (error?.domain === 'vr' && error.fatal === false) {
                    el('reset').hidden = true; el('hint').hidden = true;
                    fail('360°显示不可用，继续平面播放');
                } else {
                    fail(error?.status ? `录像播放失败（HTTP ${error.status}）` : '录像播放失败，请检查文件和浏览器支持');
                }
            };
            player.build({player_id: box.id, base_url: H265WebPyMKUI.sdkBase,
                wasm_js_uri: 'h265web_wasm.js', wasm_wasm_uri: 'h265web_wasm.wasm',
                width: '100%', height: box.clientHeight || 360, auto_play: true,
                ignore_audio: false, format_type: format, protocol: 'http'});
            if (!current()) return;
            player.set_voice(0);
            session.timer = setTimeout(() => fail('等待录像首帧超时'), 30000);
            player.load_media(`/index/pyapi/recordings/file?id=${encodeURIComponent(record.id)}&disposition=inline`);
            if (typeof ResizeObserver === 'function') {
                session.observer = new ResizeObserver(() => {
                    if (current()) player.resize(box.clientWidth, box.clientHeight);
                });
                session.observer.observe(box);
            }
        } catch (error) { fail(error.message || '播放器启动失败'); }
    }
    return {open, close};
})();
