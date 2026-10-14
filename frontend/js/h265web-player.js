// PyMKUI UI adapter. Decoding, core selection and A/V timing remain in h265web.js.
const H265WebPyMKUI = (() => {
    let active = null;
    let generation = 0;
    let nextId = 0;
    let releasePending = Promise.resolve();
    let sdkPending = null;
    const sdkBase = new URL('js/lib/h265web/', document.baseURI).href;

    function loadSdk() {
        if (typeof window.H265webjsPlayer === 'function') return Promise.resolve();
        if (!sdkPending) {
            sdkPending = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = new URL('h265web.js?v=45033916', sdkBase).href;
                script.onload = () => typeof window.H265webjsPlayer === 'function'
                    ? resolve() : reject(new Error('播放器脚本没有提供 H265webjsPlayer'));
                script.onerror = () => reject(new Error('播放器脚本加载失败'));
                document.head.appendChild(script);
            }).catch(error => {
                sdkPending = null;
                throw error;
            });
        }
        return sdkPending;
    }

    function clearSession(session) {
        clearTimeout(session.firstFrameTimer);
        session.resizeObserver?.disconnect();
        session.modal.remove();
    }

    async function close(expectedSession = null) {
        if (expectedSession && active !== expectedSession) return false;
        const closeGeneration = ++generation;
        const session = active;
        active = null;
        if (session) {
            clearSession(session);
            if (session.player) {
                releasePending = new Promise((resolve, reject) => {
                    try {
                        session.player.release(resolve);
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        }
        await releasePending;
        return closeGeneration === generation;
    }

    async function open(info, urlFactory, onRetry, options = {}) {
        const allowed = options.isCurrent || (() => true);
        if (!allowed() || !await close() || !allowed()) return false;
        const openGeneration = ++generation;
        const container = document.getElementById('streams-modal-container');
        if (!container?.isConnected) return false;
        const session = {
            generation: openGeneration, player: null, modal: document.createElement('div'),
            firstFrameTimer: null, resizeObserver: null, muted: true,
            ready: false, vrFallback: false
        };
        const current = () => allowed() && active === session && generation === openGeneration && session.modal.isConnected;
        active = session;
        session.modal.className = 'absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto';
        session.modal.setAttribute('data-modal', 'streams');
        session.modal.setAttribute('data-h265web-player', '');
        session.modal.innerHTML = `
            <div class="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 border border-white/20" style="max-height:90vh;overflow-y:auto">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white" data-role="title"></h3>
                    <button class="text-white/60 hover:text-white" data-role="close" aria-label="关闭播放器">×</button>
                </div>
                <div class="aspect-video bg-black rounded-lg overflow-hidden" data-role="viewport">
                    <div class="w-full h-full" data-role="player"></div>
                </div>
                <div class="mt-3 text-white/70 text-sm" data-role="status" aria-live="polite">正在获取播放授权…</div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <button class="bg-blue-600 text-white px-3 py-1 rounded" data-role="play">播放</button>
                    <button class="bg-blue-600 text-white px-3 py-1 rounded" data-role="pause">暂停</button>
                    <button class="bg-blue-600 text-white px-3 py-1 rounded" data-role="mute">取消静音</button>
                    <button class="bg-blue-600 text-white px-3 py-1 rounded" data-role="fullscreen">全屏</button>
                    <button class="bg-blue-600 text-white px-3 py-1 rounded" data-role="screenshot">截图</button>
                    <button class="bg-blue-600 text-white px-3 py-1 rounded" data-role="vr-toggle">360°模式</button>
                    <button class="bg-blue-600 text-white px-3 py-1 rounded hidden" data-role="vr-reset">重置视角</button>
                    <button class="bg-amber-600 text-white px-3 py-1 rounded hidden" data-role="retry">重试播放</button>
                </div>
                <div class="mt-2 text-white/60 text-sm hidden" data-role="vr-hint">拖动画面或触摸调整视角，滚轮缩放</div>
                <img class="hidden mt-3 max-w-full" data-role="capture" alt="播放截图">
            </div>`;
        const title = session.modal.querySelector('[data-role="title"]');
        title.textContent = `播放流：${info.app}/${info.stream}`;
        const status = session.modal.querySelector('[data-role="status"]');
        const retry = session.modal.querySelector('[data-role="retry"]');
        const vrToggle = session.modal.querySelector('[data-role="vr-toggle"]');
        const vrReset = session.modal.querySelector('[data-role="vr-reset"]');
        const vrHint = session.modal.querySelector('[data-role="vr-hint"]');
        const playerBox = session.modal.querySelector('[data-role="player"]');
        const capture = session.modal.querySelector('[data-role="capture"]');
        playerBox.id = `h265web-pymkui-${++nextId}`;
        capture.id = `${playerBox.id}-capture`;
        container.appendChild(session.modal);
        const showFailure = message => {
            if (!current()) return;
            clearTimeout(session.firstFrameTimer);
            status.textContent = message;
            if (onRetry) retry.classList.remove('hidden');
        };
        const updateProjectionUi = () => {
            const vr = session.player?.get_vr_view?.()?.projection === 'erp360';
            vrToggle.textContent = vr ? '平面模式' : '360°模式';
            vrReset.classList.toggle('hidden', !vr || session.vrFallback);
            vrHint.classList.toggle('hidden', !vr || session.vrFallback);
            if (session.ready && !session.vrFallback) {
                status.textContent = vr ? '播放中（360°，静音）' : '播放中（静音）';
            }
        };
        session.modal.addEventListener('click', event => {
            if (event.target === session.modal || event.target.closest('[data-role="close"]')) {
                close(session).catch(error => console.error('释放 h265web.js 失败:', error));
            }
        });
        for (const [role, method] of [['play', 'play'], ['pause', 'pause'], ['fullscreen', 'fullScreen']]) {
            session.modal.querySelector(`[data-role="${role}"]`).addEventListener('click', () => {
                if (current() && session.player) session.player[method]();
            });
        }
        session.modal.querySelector('[data-role="mute"]').addEventListener('click', event => {
            if (!current() || !session.player) return;
            session.muted = !session.muted;
            session.player.set_voice(session.muted ? 0 : 1);
            event.currentTarget.textContent = session.muted ? '取消静音' : '静音';
        });
        session.modal.querySelector('[data-role="screenshot"]').addEventListener('click', () => {
            if (!current() || !session.player) return;
            capture.classList.remove('hidden');
            session.player.screenshot(capture.id);
        });
        vrToggle.addEventListener('click', () => {
            if (!current() || !session.player) return;
            const player = session.player;
            if (typeof player.get_vr_view !== 'function' || typeof player.set_projection !== 'function') {
                status.textContent = '当前 SDK 不支持 360°模式';
                return;
            }
            const vr = player.get_vr_view()?.projection === 'erp360';
            const next = vr ? 'flat' : 'erp360';
            session.vrFallback = false;
            if (!player.set_projection(next)) {
                status.textContent = '画面模式切换失败';
                return;
            }
            if (next === 'erp360') player.set_vr_controls?.({mouse: true, touch: true});
            updateProjectionUi();
        });
        vrReset.addEventListener('click', () => {
            if (!current() || !session.player || session.vrFallback) return;
            if (!session.player.reset_vr_view?.()) status.textContent = '视角重置失败';
        });
        retry.addEventListener('click', () => {
            if (!current() || !onRetry || retry.disabled) return;
            retry.disabled = true;
            Promise.resolve().then(() => onRetry(current, session)).catch(error => {
                if (current()) status.textContent = error.message || '重试播放失败';
            }).finally(() => {
                if (current()) retry.disabled = false;
            });
        });

        try {
            const url = await urlFactory();
            if (!current()) return false;
            status.textContent = '正在加载播放器…';
            await loadSdk();
            if (!current()) return false;
            const player = window.H265webjsPlayer();
            session.player = player;
            player.on_ready_show_done_callback = () => {
                if (!current()) return;
                clearTimeout(session.firstFrameTimer);
                player.set_voice(0);
                session.ready = true;
                updateProjectionUi();
            };
            player.on_error_callback = error => {
                if (!current()) return;
                if (error?.domain === 'vr' && error.fatal === false) {
                    session.vrFallback = true;
                    updateProjectionUi();
                    status.textContent = `360°显示不可用，继续平面播放（${error.code || '渲染失败'}）`;
                    return;
                }
                const statusCode = Number(error?.status || 0);
                showFailure(statusCode ? `播放失败（HTTP ${statusCode}）` : '播放失败，请检查流和浏览器支持');
            };
            player.build({
                player_id: playerBox.id,
                base_url: sdkBase,
                wasm_js_uri: 'h265web_wasm.js',
                wasm_wasm_uri: 'h265web_wasm.wasm',
                width: '100%', height: playerBox.clientHeight || 360,
                auto_play: true, ignore_audio: false,
                format_type: info.schema === 'hls' ? 'hls' : (info.schema === 'ts' ? 'ts' : 'flv'),
                protocol: 'http',
                ...(options.core ? {core: options.core} : {})
            });
            if (!current()) return false;
            player.set_voice(0);
            status.textContent = '等待首帧…';
            session.firstFrameTimer = setTimeout(() => showFailure('等待首帧超时，请检查流后重试播放'), 30000);
            player.load_media(url);
            if (typeof ResizeObserver === 'function') {
                session.resizeObserver = new ResizeObserver(() => {
                    if (current() && session.player) {
                        session.player.resize(playerBox.clientWidth, playerBox.clientHeight);
                    }
                });
                session.resizeObserver.observe(playerBox);
            }
            return true;
        } catch (error) {
            showFailure(error.message || '播放器启动失败');
            return false;
        }
    }

    return {open, close, loadSdk, sdkBase};
})();
