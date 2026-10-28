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
            session.enhancements?.unbind();
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
            duration: 0, ready: false, dragging: false, paused: false, playbackRevision: 0, enhancements: null, projection: 'flat'};
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
            <fieldset data-vod="enhancements" data-locale="zh" class="text-white"></fieldset>
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
            session.projection = next;
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
        async function startPlayback() {
            const revision = ++session.playbackRevision;
            const loading = () => current() && session.playbackRevision === revision;
            clearTimeout(session.timer);
            session.observer?.disconnect(); session.observer = null;
            const previous = session.player;
            session.player = null;
            session.enhancements?.unbind();
            session.ready = false; session.paused = false;
            session.dragging = false; session.duration = 0;
            el('seek').disabled = true;
            el('controls').querySelectorAll('button,select').forEach(button => { button.disabled = true; });
            progress(0);
            try {
                if (previous) {
                    releasePending = new Promise((resolve, reject) => {
                        try { previous.release(resolve); } catch (error) { reject(error); }
                    });
                }
                await releasePending;
                if (!loading()) return false;
                await H265WebPyMKUI.loadSdk();
                if (!loading()) return false;
                if (!session.enhancements) {
                    session.enhancements = window.createPlaybackEnhancementControls(el('enhancements'), () => session.player,
                        {recreate: () => current() ? startPlayback() : false, play: () => el('play').click()});
                }
                const player = session.player = window.H265webjsPlayer();
                const ownsPlayer = () => loading() && session.player === player;
                player.video_probe_callback = info => {
                    if (!ownsPlayer()) return;
                    session.duration = Number(info.duration) > 0 ? Number(info.duration) : 0;
                    el('seek').max = session.duration;
                    el('seek').disabled = session.duration <= 0;
                    progress(0);
                };
                player.on_play_time = seconds => { if (ownsPlayer()) progress(seconds); };
                player.on_play_finished = () => { if (ownsPlayer()) { session.paused = true; status(); } };
                player.on_ready_show_done_callback = () => {
                    if (!ownsPlayer()) return;
                    clearTimeout(session.timer);
                    session.ready = true;
                    el('controls').querySelectorAll('button,select').forEach(button => { button.disabled = false; });
                    player.set_voice(session.muted ? 0 : 1);
                    player.set_playback_rate(Number(el('rate').value));
                    status();
                };
                player.on_error_callback = error => {
                    if (!ownsPlayer()) return;
                    if (error?.domain === 'vr' && error.fatal === false) {
                        el('reset').hidden = true; el('hint').hidden = true;
                        fail('360°显示不可用，继续平面播放');
                    } else {
                        fail(error?.status ? `录像播放失败（HTTP ${error.status}）` : '录像播放失败，请检查文件和浏览器支持');
                    }
                };
                const enhancementConfig = session.enhancements.buildConfig(player);
                session.enhancements.bind(player);
                const built = player.build({player_id: box.id, base_url: H265WebPyMKUI.sdkBase,
                    wasm_js_uri: 'h265web_wasm.js?v=enhancements-20261028', wasm_wasm_uri: 'h265web_wasm.wasm?v=enhancements-20261028',
                    width: '100%', height: box.clientHeight || 360, auto_play: true,
                    ignore_audio: false, format_type: format, protocol: 'http', projection: session.projection,
                    vr: {mouse_control: session.projection === 'erp360', touch_control: session.projection === 'erp360'}, ...enhancementConfig});
                if (!built) throw new Error('播放器初始化失败');
                if (!ownsPlayer()) return false;
                player.set_voice(session.muted ? 0 : 1);
                session.timer = setTimeout(() => { if (ownsPlayer()) fail('等待录像首帧超时'); }, 30000);
                player.load_media(`/index/pyapi/recordings/file?id=${encodeURIComponent(record.id)}&disposition=inline`);
                session.enhancements.refresh();
                if (typeof ResizeObserver === 'function') {
                    session.observer = new ResizeObserver(() => {
                        if (ownsPlayer()) player.resize(box.clientWidth, box.clientHeight);
                    });
                    session.observer.observe(box);
                }
                return true;
            } catch (error) { if (loading()) fail(error.message || '播放器启动失败'); return false; }
        }
        return startPlayback();
    }

    return {open, close};
})();
