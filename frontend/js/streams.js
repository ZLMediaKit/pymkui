const hlsInstances = [];
const whepConnections = new Set();
let currentStreamRows = [];
let streamsPlaybackEpoch = 0;

function cleanupStreamsPage() {
    ++streamsPlaybackEpoch;
    const sdkClose = typeof H265WebPyMKUI === 'undefined'
        ? Promise.resolve(true) : H265WebPyMKUI.close();
    console.log('清理视频管理页面资源，销毁所有播放器实例');
    whepConnections.forEach(connection => connection.close());
    whepConnections.clear();
    
    // 销毁HLS播放器实例
    hlsInstances.forEach(instance => {
        try {
            if (instance) {
                instance.destroy();
            }
        } catch (error) {
            console.error('销毁HLS播放器实例失败:', error);
        }
    });
    hlsInstances.length = 0;
    
    // 清空模态框容器
    const streamsModalContainer = document.getElementById('streams-modal-container');
    if (streamsModalContainer) {
        streamsModalContainer.querySelectorAll('[data-modal="streams"] video').forEach(video => {
            video.pause();
            video.removeAttribute('src');
            video.srcObject = null;
            video.load();
        });
        streamsModalContainer.innerHTML = '';
    }
    sdkClose.catch(error => console.error('释放 h265web.js 失败:', error));
    return sdkClose;
}

async function loadStreams() {
    const tbody = document.getElementById('streamsTableBody');
    const protocolFilter = document.getElementById('protocolFilter');
    const vhostFilter = document.getElementById('vhostFilter');
    const appFilter = document.getElementById('appFilter');
    const streamFilter = document.getElementById('streamFilter');
    
    const schema = protocolFilter ? protocolFilter.value : 'all';
    const vhost = vhostFilter ? vhostFilter.value.trim() : '';
    const app = appFilter ? appFilter.value.trim() : '';
    const stream = streamFilter ? streamFilter.value.trim() : '';
    
    tbody.innerHTML = `
        <tr>
            <td colspan="10" class="p-10 text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
                <span class="text-white/60 font-semibold">加载中...</span>
            </td>
        </tr>
    `;
    
    try {
        const result = await Api.getMediaList(
            schema === 'all' ? undefined : schema,
            vhost || undefined,
            app || undefined,
            stream || undefined
        );
        
        console.log('getMediaList返回结果:', result);
        
        if (result.code === 0) {
            const data = result.data || [];
            currentStreamRows = data;
            
            console.log('流列表数据:', data);
            
            if (data.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="p-10 text-center text-white/60 font-semibold">
                            暂无媒体流
                        </td>
                    </tr>
                `;
                return;
            }
            
            let html = '';
            data.forEach((stream, rowIndex) => {
                console.log('流数据:', stream);
                const vhost = stream.vhost || '__defaultVhost__';
                const readerCount = stream.readerCount || 0;
                const aliveSecond = stream.aliveSecond || 0;
                const bytesSpeed = stream.bytesSpeed || 0;
                
                const aliveTime = formatAliveTime(aliveSecond);
                const bitrate = formatBitrate(bytesSpeed);
                
                // 处理轨道信息
                let tracksInfo = '-';
                if (stream.tracks && stream.tracks.length > 0) {
                    const trackCodes = stream.tracks.map(track => {
                        const codec = track.codec_id_name || track.codec_name || '-';
                        return track.codec_type === 0 ? `视频: ${codec}` : `音频: ${codec}`;
                    });
                    tracksInfo = trackCodes.join('<br>');
                }
                
                html += `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td class="p-4 text-white/60 text-sm" title="${vhost}">${vhost}</td>
                        <td class="p-4 text-white">${stream.app || '-'}</td>
                        <td class="p-4 text-white">${stream.stream || '-'}</td>
                        <td class="p-4 text-white">${stream.schema || '-'}</td>
                        <td class="p-4 text-white">${stream.originTypeStr || '-'}</td>
                        <td class="p-4 text-white">${readerCount}</td>
                        <td class="p-4 text-white">${aliveTime}</td>
                        <td class="p-4 text-white">${bitrate}</td>
                        <td class="p-4 text-white" style="white-space: pre-line;">${tracksInfo}</td>
                        <td class="p-4">
                            <button class="bg-gradient-primary text-white px-3 py-1 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors mr-2" data-stream-action="play" data-row-index="${rowIndex}">播放</button>
                            <button class="bg-gradient-accent text-white px-3 py-1 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors" data-stream-action="info" data-row-index="${rowIndex}">查看</button>
                        </td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html;
            tbody.onclick = event => {
                const button = event.target.closest('[data-stream-action]');
                if (!button || !tbody.contains(button)) return;
                const row = currentStreamRows[Number(button.dataset.rowIndex)];
                if (!row) return;
                const vhost = row.vhost || '__defaultVhost__';
                if (button.dataset.streamAction === 'info') {
                    showStreamInfo(row.schema, vhost, row.app, row.stream);
                } else {
                    playStream(row);
                }
            };
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="p-10 text-center text-white/60 font-semibold">
                        加载失败: ${result.msg || '未知错误'}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="p-10 text-center text-white/60 font-semibold">
                    网络错误: ${error.message}
                </td>
            </tr>
        `;
    }
}

function formatAliveTime(seconds) {
    if (!seconds || seconds <= 0) {
        return '-';
    }
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = '';
    if (days > 0) {
        result += `${days}天`;
    }
    if (hours > 0) {
        result += `${hours}小时`;
    }
    if (minutes > 0) {
        result += `${minutes}分钟`;
    }
    if (secs > 0) {
        result += `${secs}秒`;
    }
    
    return result || '-';
}

function formatBitrate(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) {
        return '-';
    }
    
    const kbps = bytesPerSecond / 1024;
    const mbps = kbps / 1024;
    
    if (mbps >= 1) {
        return `${mbps.toFixed(2)} MB/s`;
    } else {
        return `${kbps.toFixed(2)} KB/s`;
    }
}

function generatePlayUrl(app, stream, schema, extraParams) {
    const baseUrl = Api.getBaseUrl();
    let playUrl = '';
    
    if (schema === 'rtmp') {
        playUrl = `${baseUrl}/${app}/${stream}.live.flv`;
    } else if (schema === 'hls') {
        playUrl = `${baseUrl}/${app}/${stream}/hls.m3u8`;
    } else if (schema === 'hls.fmp4') {
        playUrl = `${baseUrl}/${app}/${stream}/hls.fmp4.m3u8`;
    } else if (schema === 'ts') {
        playUrl = `${baseUrl}/${app}/${stream}.live.ts`;
    } else if (schema === 'fmp4') {
        playUrl = `${baseUrl}/${app}/${stream}.live.mp4`;
    } else if (schema === 'rtsp') {
        playUrl = `${baseUrl}/index/api/whep?app=${encodeURIComponent(app)}&stream=${encodeURIComponent(stream)}`;
    } else {
        playUrl = `${baseUrl}/${app}/${stream}.live.flv`;
    }
    
    if (extraParams && typeof extraParams === 'object') {
        const qs = new URLSearchParams(extraParams).toString();
        if (qs) {
            playUrl += (playUrl.includes('?') ? '&' : '?') + qs;
        }
    }
    
    return playUrl;
}

async function fetchPlayUrlParams(app, stream) {
    try {
        const result = await Api.getPluginUrlParams('on_play', app, stream);
        if (result.code === 0 && result.data && Object.keys(result.data).length > 0) {
            return result.data;
        }
    } catch (e) {
        console.warn('获取播放URL附加参数失败，以默认模式播放:', e);
    }
    return null;
}

function generateH265WebPlayUrl(info, extraParams = {}) {
    if (!['rtmp', 'ts', 'hls'].includes(info.schema)) throw new Error('该协议尚未接入 h265web.js');
    const encodePath = value => String(value || '').split('/').map(segment => {
        if (!segment || segment === '.' || segment === '..') throw new Error('媒体路径包含无效段');
        return encodeURIComponent(segment);
    }).join('/');
    const app = encodePath(info.app);
    const stream = encodePath(info.stream);
    const base = new URL(Api.getBaseUrl(), window.location.href);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('媒体服务地址必须使用 HTTP 或 HTTPS');
    const baseQuery = new URLSearchParams(base.search);
    for (const key of ['vhost', 'app', 'stream']) {
        if (baseQuery.has(key)) throw new Error('媒体服务地址参数与流身份冲突');
    }
    base.pathname = base.pathname.replace(/\/?$/, '/');
    base.search = '';
    const mediaPath = info.schema === 'hls'
        ? `${app}/${stream}/hls.m3u8`
        : `${app}/${stream}.live.${info.schema === 'ts' ? 'ts' : 'flv'}`;
    const url = new URL(mediaPath, base);
    baseQuery.forEach((value, key) => url.searchParams.append(key, value));
    const vhost = info.vhost || '__defaultVhost__';
    if (vhost !== '__defaultVhost__') url.searchParams.set('vhost', vhost);
    Object.entries(extraParams).forEach(([key, value]) => {
        if (key === 'vhost' || key === 'app' || key === 'stream') {
            throw new Error('播放授权参数与流身份冲突');
        }
        url.searchParams.set(key, String(value));
    });
    return url.href;
}

async function openH265WebStream(info, epoch, options = {}) {
    const currentPage = () => epoch === streamsPlaybackEpoch &&
        document.getElementById('streams-modal-container')?.isConnected;
    if (!currentPage()) return;
    const getFreshUrl = async () => {
        const result = await Api.getPluginUrlParams(
            'on_play', info.app, info.stream, info.vhost || '__defaultVhost__'
        );
        if (!result || result.code !== 0) throw new Error('获取播放授权参数失败');
        return generateH265WebPlayUrl(info, result.data || {});
    };
    try {
        await H265WebPyMKUI.open(info, getFreshUrl, isCurrent => {
            if (isCurrent() && currentPage()) return openH265WebStream(info, epoch, options);
        }, {...options, isCurrent: currentPage});
    } catch (error) {
        if (currentPage()) showToast(error.message || '无法启动播放器', 'error');
    }
}

async function playStreamWithH265Web(info) {
    if (typeof H265WebPyMKUI === 'undefined') {
        showToast('h265web.js 适配脚本加载失败', 'error');
        return;
    }
    const release = cleanupStreamsPage();
    const epoch = streamsPlaybackEpoch;
    try {
        await release;
        return openH265WebStream(info, epoch);
    } catch (error) {
        if (epoch === streamsPlaybackEpoch) showToast(error.message || '无法释放旧播放器', 'error');
    }
}

async function playStream(info) {
    const {app, stream, schema} = info;
    const hevcVideo = info.tracks?.some(track =>
        Number(track.codec_type) === 0 &&
        /^(h265|hevc|hvc1|hev1)$/i.test(String(track.codec_id_name || track.codec_name || ''))
    );
    if (schema === 'rtmp' || schema === 'ts' || (schema === 'hls' && hevcVideo)) {
        return playStreamWithH265Web(info);
    }
    if (schema === 'hls.fmp4' && hevcVideo) {
        showToast('H.265 HLS-fMP4 当前无法正常解码，请使用 RTMP、TS 或 HLS 行播放', 'error');
        return;
    }
    const epoch = ++streamsPlaybackEpoch;
    const currentPage = () => epoch === streamsPlaybackEpoch &&
        document.getElementById('streams-modal-container')?.isConnected;
    try {
        if (typeof H265WebPyMKUI !== 'undefined') await H265WebPyMKUI.close();
        if (!currentPage()) return;
    } catch (error) {
        if (currentPage()) showToast('旧播放器尚未释放，请重试', 'error');
        return;
    }
    console.log('播放流:', app, stream, schema);
    
    if (schema === 'rtsp') {
        playWithWHEP(app, stream);
    } else if (schema === 'fmp4') {
        const urlParams = await fetchPlayUrlParams(app, stream);
        if (!currentPage()) return;
        playWithNative(app, stream, schema, urlParams, info);
    } else if (schema === 'hls' || schema === 'hls.fmp4') {
        const urlParams = await fetchPlayUrlParams(app, stream);
        if (!currentPage()) return;
        playWithNative(app, stream, schema, urlParams, info);
    } else {
        showToast('该协议暂不支持播放', 'error');
    }
}

function playWithNative(app, stream, schema, urlParams, streamInfo = null) {
    try {
        const modal = document.createElement('div');
        modal.className = 'absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto';
        modal.setAttribute('data-modal', 'streams');
        modal.innerHTML = `
            <div class="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 border border-white/20" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white">播放流: ${app}/${stream}</h3>
                    <button class="text-white/60 hover:text-white">
                        <i class="fa fa-times text-2xl"></i>
                    </button>
                </div>
                <div class="aspect-video bg-black rounded-lg overflow-hidden">
                    <video id="nativeVideo" class="w-full h-full" controls autoplay playsinline></video>
                </div>
                <div class="mt-4 text-white/60 text-sm">
                    协议: ${schema.toUpperCase()} | 应用: ${app} | 流: ${stream}
                </div>
                <p class="mt-2 text-white/60 text-sm" data-native-enhancement-info>当前使用原生播放器。要体验音量均衡和 SDR 超分，请关闭此窗口，在同一流的 RTMP 或 TS 行打开 SDK 播放器。</p>
            </div>
        `;
        document.getElementById('streams-modal-container').appendChild(modal);
        
        const playUrl = generatePlayUrl(app, stream, schema, urlParams);
        
        console.log('原生播放URL:', playUrl);
        
        const video = modal.querySelector('video');
        video.muted = true;
        
        let hlsInstance = null;
        let destroyed = false;
        let nativeHls = false;
        const epoch = streamsPlaybackEpoch;
        const avcVideo = streamInfo?.tracks?.some(track =>
            Number(track.codec_type) === 0 &&
            /^(h264|avc|avc1)$/i.test(String(track.codec_id_name || track.codec_name || ''))
        );
        const onNativeError = () => {
            if (destroyed || !modal.isConnected || epoch !== streamsPlaybackEpoch ||
                !nativeHls || schema !== 'hls' || !avcVideo ||
                ![3, 4].includes(video.error?.code)) return;
            if (typeof H265WebPyMKUI === 'undefined') {
                showToast('h265web.js 适配脚本加载失败', 'error');
                return;
            }
            // This failure owns only this modal; other native/WHEP players keep running.
            destroyPlayer();
            modal.remove();
            void openH265WebStream(streamInfo, epoch, {core: 'mse_hevc'});
        };
        const destroyPlayer = () => {
            if (destroyed) return;
            destroyed = true;
            video.removeEventListener('error', onNativeError);
            if (hlsInstance) {
                console.log('销毁HLS播放器');
                hlsInstance.destroy();
                const index = hlsInstances.indexOf(hlsInstance);
                if (index > -1) {
                    hlsInstances.splice(index, 1);
                }
                hlsInstance = null;
            }
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.srcObject = null;
                video.load();
            }
        };
        
        if (schema === 'hls' || schema === 'hls.fmp4') {
            if (video.canPlayType('application/vnd.apple.mpegurl')) {
                nativeHls = true;
                video.addEventListener('error', onNativeError);
                video.src = playUrl;
            } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsInstance = new Hls();
                hlsInstances.push(hlsInstance);
                hlsInstance.loadSource(playUrl);
                hlsInstance.attachMedia(video);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log('HLS manifest解析成功');
                    video.play();
                });
                hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS播放错误:', data);
                    showToast('HLS播放错误: ' + data.type, 'error');
                });
            } else {
                showToast('浏览器不支持HLS播放', 'error');
                return;
            }
        } else {
            video.src = playUrl;
        }
        
        video.play().catch(error => {
            if (destroyed || !modal.isConnected || epoch !== streamsPlaybackEpoch) return;
            console.error('播放失败:', error);
            showToast('播放失败: ' + error.message, 'error');
        });
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                destroyPlayer();
                modal.remove();
            }
        });
        
        modal.querySelector('button').addEventListener('click', () => {
            destroyPlayer();
            modal.remove();
        });
        
    } catch (error) {
        console.error('原生播放失败:', error);
        showToast('播放失败: ' + error.message, 'error');
    }
}

async function showStreamInfo(schema, vhost, app, stream) {
    try {
        console.log('获取流信息:', schema, vhost, app, stream);
        
        const result = await Api.getMediaInfo(schema, vhost, app, stream);
        
        if (result.code !== 0) {
            showToast('获取流信息失败: ' + (result.msg || '未知错误'), 'error');
            return;
        }
        
        const data = result;
        
        const modal = document.createElement('div');
        modal.className = 'absolute inset-0 bg-black/80 flex items-center justify-center overflow-y-auto pointer-events-auto';
        modal.setAttribute('data-modal', 'streams');
        modal.innerHTML = `
            <div class="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 my-8 border border-white/20 flex flex-col" style="max-height:90vh;" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center mb-4 shrink-0">
                    <h3 class="text-xl font-bold text-white">流信息: ${app}/${stream}</h3>
                    <button class="text-white/60 hover:text-white" onclick="this.closest('.absolute').remove()">
                        <i class="fa fa-times text-2xl"></i>
                    </button>
                </div>
                <div class="space-y-4 overflow-y-auto flex-1 min-h-0">
                    <div class="bg-white/5 rounded-lg p-4">
                        <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">流截图</h4>
                        <div class="flex items-center justify-center h-48 bg-white/5 rounded-lg" id="stream-snap-container">
                            <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                        </div>
                    </div>
                    <div class="bg-white/5 rounded-lg p-4" id="stream-playurl-container">
                        <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">播放地址</h4>
                        <div class="flex items-center gap-2 text-sm text-white/40"><i class="fa fa-spinner fa-spin"></i> 加载中...</div>
                    </div>
                    ${renderStreamInfo(data, vhost, app, stream)}
                </div>
                <div class="flex justify-end gap-2 pt-4 mt-2 border-t border-white/10 shrink-0">
                    <button class="bg-teal-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors probe-btn" data-vhost="${vhost}" data-app="${app}" data-stream="${stream}"><i class="fa fa-stethoscope mr-1"></i>探针</button>
                    <button class="bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors rec-nav-btn" data-vhost="${vhost}" data-app="${app}" data-stream="${stream}"><i class="fa fa-film mr-1"></i>录像</button>
                    <button class="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors" onclick="showStreamPlayers('${schema}', '${vhost}', '${app}', '${stream}')"><i class="fa fa-users mr-1"></i>观众</button>
                    <button class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors" onclick="stopStream('${schema}', '${vhost}', '${app}', '${stream}')"><i class="fa fa-stop mr-1"></i>停止</button>
                </div>
            </div>
        `;
        document.getElementById('streams-modal-container').appendChild(modal);

        // 录像按钮：通过 data-* 避免引号嵌套问题
        modal.querySelector('.rec-nav-btn')?.addEventListener('click', function() {
            navigateToRecordings(this.dataset.vhost, this.dataset.app, this.dataset.stream);
        });

        // 探针按钮
        modal.querySelector('.probe-btn')?.addEventListener('click', function() {
            showProbeModal(this.dataset.vhost, this.dataset.app, this.dataset.stream);
        });

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // 获取截图并显示
        const snapUrlParams = await fetchPlayUrlParams(app, stream);
        const playUrl = generatePlayUrl(app, stream, schema, snapUrlParams);

        // 截图用 URL：rtsp 改用 rtmp 协议的 flv 地址，并追加 self=1
        const baseUrl = Api.getBaseUrl();
        let snapUrl;
        if (schema === 'rtsp') {
            snapUrl = `${baseUrl}/${app}/${stream}.live.flv`;
            if (snapUrlParams) {
                const qs = new URLSearchParams(snapUrlParams).toString();
                if (qs) snapUrl += '?' + qs;
            }
        } else {
            snapUrl = playUrl;
        }
        snapUrl += (snapUrl.includes('?') ? '&' : '?') + 'self=1';

        // 填充播放地址
        const playUrlContainer = document.getElementById('stream-playurl-container');
        if (playUrlContainer) {
            playUrlContainer.innerHTML = `
                <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">播放地址</h4>
                <div class="flex items-center gap-2 text-sm">
                    <span class="text-white/80 break-all flex-1 font-mono bg-black/30 rounded px-3 py-2 select-all">${playUrl}</span>
                    <button class="shrink-0 bg-yellow-500 hover:bg-yellow-400 text-white px-3 py-2 rounded-lg font-semibold transition-colors" onclick="navigator.clipboard.writeText('${playUrl.replace(/'/g, "\\'")}').then(()=>showToast('已复制到剪贴板','success')).catch(()=>showToast('复制失败','error'))">
                        <i class="fa fa-copy mr-1"></i>拷贝
                    </button>
                </div>
            `;
        }

        const snapContainer = document.getElementById('stream-snap-container');
        if (snapContainer) {
            await getStreamSnap(snapUrl, snapContainer);
        }
        
    } catch (error) {
        console.error('获取流信息失败:', error);
        showToast('获取流信息失败: ' + error.message, 'error');
    }
}

function renderStreamInfo(data, vhost, app, stream) {
    let html = '';
    
    html += `
        <div class="bg-white/5 rounded-lg p-4">
            <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">基本信息</h4>
            <div class="grid grid-cols-2 gap-3 text-sm">
                <div><span class="text-white/60">应用:</span> <span class="text-white">${data.app || '-'}</span></div>
                <div><span class="text-white/60">流ID:</span> <span class="text-white">${data.stream || '-'}</span></div>
                <div><span class="text-white/60">协议:</span> <span class="text-white">${data.schema || '-'}</span></div>
                <div><span class="text-white/60">虚拟主机:</span> <span class="text-white">${data.vhost || '-'}</span></div>
                <div><span class="text-white/60">存活时间:</span> <span class="text-white">${data.aliveSecond ? data.aliveSecond + '秒' : '-'}</span></div>
                <div><span class="text-white/60">观众数:</span> <span class="text-white">${data.readerCount || 0}</span></div>
                <div><span class="text-white/60">总观众数:</span> <span class="text-white">${data.totalReaderCount || 0}</span></div>
                <div><span class="text-white/60">码率:</span> <span class="text-white">${data.bytesSpeed ? (data.bytesSpeed / 1024).toFixed(2) + ' KB/s' : '-'}</span></div>
                <div><span class="text-white/60">总流量:</span> <span class="text-white">${data.totalBytes ? (data.totalBytes / 1024 / 1024).toFixed(2) + ' MB' : '-'}</span></div>
                <div><span class="text-white/60">创建时间:</span> <span class="text-white">${data.createStamp ? new Date(data.createStamp * 1000).toLocaleString() : '-'}</span></div>
                <div><span class="text-white/60">当前时间戳:</span> <span class="text-white">${data.currentStamp || '-'}</span></div>
                <div><span class="text-white/60">参数:</span> <span class="text-white break-all">${data.params || '-'}</span></div>
            </div>
        </div>
    `;
    
    if (data.originSock) {
        html += `
            <div class="bg-white/5 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">源信息</h4>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div><span class="text-white/60">源类型:</span> <span class="text-white">${data.originTypeStr || '-'}</span></div>
                    <div><span class="text-white/60">源类型ID:</span> <span class="text-white">${data.originType || '-'}</span></div>
                    <div><span class="text-white/60">源URL:</span> <span class="text-white break-all">${data.originUrl || '-'}</span></div>
                    <div><span class="text-white/60">本地地址:</span> <span class="text-white">${data.originSock.local_ip}:${data.originSock.local_port}</span></div>
                    <div><span class="text-white/60">远端地址:</span> <span class="text-white">${data.originSock.peer_ip}:${data.originSock.peer_port}</span></div>
                    <div><span class="text-white/60">标识符:</span> <span class="text-white">${data.originSock.identifier || '-'}</span></div>
                </div>
            </div>
        `;
    }
    
    if (data.tracks && data.tracks.length > 0) {
        html += `
            <div class="bg-white/5 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">轨道信息</h4>
                <div class="space-y-3">
        `;
        
        data.tracks.forEach((track, index) => {
            const isVideo = track.codec_type === 0;
            html += `
                <div class="bg-white/5 rounded p-3">
                    <div class="font-semibold text-white mb-2">${isVideo ? '视频轨道' : '音频轨道'} #${index + 1}</div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="text-white/60">编码:</span> <span class="text-white">${track.codec_id_name || '-'}</span></div>
                        <div><span class="text-white/60">就绪:</span> <span class="text-white">${track.ready ? '是' : '否'}</span></div>
                        ${isVideo ? `
                            <div><span class="text-white/60">分辨率:</span> <span class="text-white">${track.width || '-'}x${track.height || '-'}</span></div>
                            <div><span class="text-white/60">帧率:</span> <span class="text-white">${track.fps || '-'}</span></div>
                            <div><span class="text-white/60">GOP大小:</span> <span class="text-white">${track.gop_size || '-'}</span></div>
                            <div><span class="text-white/60">GOP间隔:</span> <span class="text-white">${track.gop_interval_ms || '-'}ms</span></div>
                            <div><span class="text-white/60">关键帧数:</span> <span class="text-white">${track.key_frames || '-'}</span></div>
                            <div><span class="text-white/60">总帧数:</span> <span class="text-white">${track.frames || '-'}</span></div>
                        ` : `
                            <div><span class="text-white/60">采样率:</span> <span class="text-white">${track.sample_rate || '-'}</span></div>
                            <div><span class="text-white/60">通道数:</span> <span class="text-white">${track.channels || '-'}</span></div>
                            <div><span class="text-white/60">采样位数:</span> <span class="text-white">${track.sample_bit || '-'}</span></div>
                            <div><span class="text-white/60">总帧数:</span> <span class="text-white">${track.frames || '-'}</span></div>
                        `}
                        <div><span class="text-white/60">时长:</span> <span class="text-white">${track.duration ? (track.duration / 1000).toFixed(2) + '秒' : '-'}</span></div>
                        <div><span class="text-white/60">丢包率:</span> <span class="text-white">${track.loss || 0}%</span></div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    if (data.isRecordingHLS !== undefined || data.isRecordingMP4 !== undefined) {
        const hlsRecording = !!data.isRecordingHLS;
        const mp4Recording = !!data.isRecordingMP4;
        const v = vhost, a = app, s = stream;
        html += `
            <div class="bg-white/5 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">录制状态</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div class="flex items-center gap-3">
                        <span class="text-white/60">HLS:</span>
                        <span class="text-white mr-1">${hlsRecording ? '<span class="text-green-400">录制中</span>' : '<span class="text-white/40">未录制</span>'}</span>
                        ${hlsRecording
                            ? `<button class="bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors" onclick="toggleRecord(0,'${v}','${a}','${s}',false,this)"><i class="fa fa-stop mr-1"></i>停止</button>`
                            : `<button class="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors" onclick="toggleRecord(0,'${v}','${a}','${s}',true,this)"><i class="fa fa-circle mr-1"></i>开始</button>`
                        }
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-white/60">MP4:</span>
                        <span class="text-white mr-1">${mp4Recording ? '<span class="text-green-400">录制中</span>' : '<span class="text-white/40">未录制</span>'}</span>
                        ${mp4Recording
                            ? `<button class="bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors" onclick="toggleRecord(1,'${v}','${a}','${s}',false,this)"><i class="fa fa-stop mr-1"></i>停止</button>`
                            : `<button class="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors" onclick="toggleRecord(1,'${v}','${a}','${s}',true,this)"><i class="fa fa-circle mr-1"></i>开始</button>`
                        }
                    </div>
                </div>
            </div>
        `;
    }
    
    if (data.transcode && data.transcode.length > 0) {
        html += `
            <div class="bg-white/5 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-white mb-3 border-b border-white/10 pb-2">转码信息</h4>
                <div class="space-y-3">
        `;
        
        data.transcode.forEach((transcode, index) => {
            html += `
                <div class="bg-white/5 rounded p-3">
                    <div class="font-semibold text-white mb-2">转码配置 #${index + 1}</div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="text-white/60">视频解码:</span> <span class="text-white">${transcode.vdec || '-'}</span></div>
                        <div><span class="text-white/60">视频编码:</span> <span class="text-white">${transcode.venc || '-'}</span></div>
                        <div><span class="text-white/60">音频解码:</span> <span class="text-white">${transcode.adec || '-'}</span></div>
                        <div><span class="text-white/60">音频编码:</span> <span class="text-white">${transcode.aenc || '-'}</span></div>
                        <div><span class="text-white/60">名称:</span> <span class="text-white">${transcode.name || '-'}</span></div>
                    </div>
            `;
            
            if (transcode.setting) {
                html += `
                    <div class="mt-2 pt-2 border-t border-white/10">
                        <div class="text-white/80 font-semibold mb-1">转码设置</div>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div><span class="text-white/60">目标视频编码:</span> <span class="text-white">${transcode.setting.target_vcodec || '-'}</span></div>
                            <div><span class="text-white/60">目标音频编码:</span> <span class="text-white">${transcode.setting.target_acodec || '-'}</span></div>
                            <div><span class="text-white/60">视频解码线程:</span> <span class="text-white">${transcode.setting.vdecoder_threads || '-'}</span></div>
                            <div><span class="text-white/60">视频编码线程:</span> <span class="text-white">${transcode.setting.vencoder_threads || '-'}</span></div>
                            <div><span class="text-white/60">音频解码线程:</span> <span class="text-white">${transcode.setting.adecoder_threads || '-'}</span></div>
                            <div><span class="text-white/60">音频编码线程:</span> <span class="text-white">${transcode.setting.aencoder_threads || '-'}</span></div>
                            <div><span class="text-white/60">滤镜线程:</span> <span class="text-white">${transcode.setting.filter_threads || '-'}</span></div>
                            <div><span class="text-white/60">滤镜:</span> <span class="text-white">${transcode.setting.filter || '-'}</span></div>
                            <div><span class="text-white/60">硬件解码:</span> <span class="text-white">${transcode.setting.hw_decoder ? '是' : '否'}</span></div>
                            <div><span class="text-white/60">硬件编码:</span> <span class="text-white">${transcode.setting.hw_encoder ? '是' : '否'}</span></div>
                            <div><span class="text-white/60">强制转码:</span> <span class="text-white">${transcode.setting.force ? '是' : '否'}</span></div>
                        </div>
                    </div>
                `;
            }
            
            if (transcode.venc_ctx) {
                html += `
                    <div class="mt-2 pt-2 border-t border-white/10">
                        <div class="text-white/80 font-semibold mb-1">视频编码参数</div>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div><span class="text-white/60">分辨率:</span> <span class="text-white">${transcode.venc_ctx.width || '-'}x${transcode.venc_ctx.height || '-'}</span></div>
                            <div><span class="text-white/60">帧率:</span> <span class="text-white">${transcode.venc_ctx.fps || '-'}</span></div>
                            <div><span class="text-white/60">码率:</span> <span class="text-white">${transcode.venc_ctx.bit_rate || '-'}</span></div>
                            <div><span class="text-white/60">GOP:</span> <span class="text-white">${transcode.venc_ctx.gop || '-'}</span></div>
                            <div><span class="text-white/60">像素格式:</span> <span class="text-white">${transcode.venc_ctx.pix_fmt || '-'}</span></div>
                            <div><span class="text-white/60">B帧数:</span> <span class="text-white">${transcode.venc_ctx.has_b_frames || '-'}</span></div>
                        </div>
                    </div>
                `;
            }
            
            if (transcode.aenc_ctx) {
                html += `
                    <div class="mt-2 pt-2 border-t border-white/10">
                        <div class="text-white/80 font-semibold mb-1">音频编码参数</div>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div><span class="text-white/60">采样率:</span> <span class="text-white">${transcode.aenc_ctx.sample_rate || '-'}</span></div>
                            <div><span class="text-white/60">通道数:</span> <span class="text-white">${transcode.aenc_ctx.channels || '-'}</span></div>
                            <div><span class="text-white/60">码率:</span> <span class="text-white">${transcode.aenc_ctx.bit_rate || '-'}</span></div>
                            <div><span class="text-white/60">帧大小:</span> <span class="text-white">${transcode.aenc_ctx.frame_size || '-'}</span></div>
                            <div><span class="text-white/60">采样格式:</span> <span class="text-white">${transcode.aenc_ctx.sample_fmt || '-'}</span></div>
                        </div>
                    </div>
                `;
            }
            
            html += `</div>`;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    return html;
}

async function playWithWHEP(app, stream) {
    let peerConnection = null;
    let modal = null;
    try {
        modal = document.createElement('div');
        modal.className = 'absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto';
        modal.setAttribute('data-modal', 'streams');
        modal.innerHTML = `
            <div class="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 border border-white/20" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white">播放流: ${app}/${stream}</h3>
                    <button class="text-white/60 hover:text-white">
                        <i class="fa fa-times text-2xl"></i>
                    </button>
                </div>
                <div class="aspect-video bg-black rounded-lg overflow-hidden">
                    <video id="whepVideo" class="w-full h-full" controls autoplay playsinline></video>
                </div>
                <div class="mt-4 text-white/60 text-sm">
                    协议: WHEP (WebRTC) | 应用: ${app} | 流: ${stream}
                </div>
                <p class="mt-2 text-white/60 text-sm" data-native-enhancement-info>当前使用 WHEP 原生播放器。音量均衡和 SDR 超分位于同一流 RTMP 或 TS 行的 SDK 播放器中。</p>
            </div>
        `;
        document.getElementById('streams-modal-container').appendChild(modal);
        
        const video = document.getElementById('whepVideo');
        video.muted = true;
        const closeWhep = () => {
            if (peerConnection) {
                peerConnection.close();
                whepConnections.delete(peerConnection);
            }
            video.srcObject = null;
            modal.remove();
        };
        modal.addEventListener('click', event => {
            if (event.target === modal) closeWhep();
        });
        modal.querySelector('button').addEventListener('click', closeWhep);

        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });
        whepConnections.add(peerConnection);
        
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
        
        peerConnection.ontrack = (event) => {
            console.log('收到远程轨道:', event.track.kind);
            if (video.srcObject === null) {
                video.srcObject = new MediaStream();
            }
            video.srcObject.addTrack(event.track);
        };
        
        const offer = await peerConnection.createOffer();
        if (!modal.isConnected) return;
        await peerConnection.setLocalDescription(offer);
        if (!modal.isConnected) return;
        
        const whepUrlParams = await fetchPlayUrlParams(app, stream);
        if (!modal.isConnected) return;
        const whepUrl = generatePlayUrl(app, stream, 'rtsp', whepUrlParams);
        
        const response = await fetch(whepUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp'
            },
            body: offer.sdp,
            credentials: 'include'
        });
        if (!modal.isConnected) return;
        
        if (!response.ok) {
            throw new Error(`WHEP服务器返回错误: ${response.status}`);
        }
        
        const answerSDP = await response.text();
        if (!modal.isConnected) return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answerSDP
        }));
        
        console.log('WHEP播放成功');
        
    } catch (error) {
        if (peerConnection) {
            peerConnection.close();
            whepConnections.delete(peerConnection);
        }
        if (modal) modal.remove();
        console.error('WHEP播放失败:', error);
        showToast('播放失败: ' + error.message, 'error');
    }
}

function showConfirmModal(title, message, onConfirm, onCancel) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-white/20" id="confirmModalContent">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-white">${title}</h3>
                <button class="text-white/60 hover:text-white" id="confirmModalClose">
                    <i class="fa fa-times text-2xl"></i>
                </button>
            </div>
            <p class="text-white/80 mb-6">${message}</p>
            <div class="flex justify-end space-x-3">
                <button class="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-600 transition-colors" id="confirmModalCancel">取消</button>
                <button class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors" id="confirmModalConfirm">确认</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // 添加事件监听器
    document.getElementById('confirmModalClose').addEventListener('click', function() {
        modal.remove();
    });
    
    document.getElementById('confirmModalCancel').addEventListener('click', function() {
        modal.remove();
        if (typeof onCancel === 'function') {
            onCancel();
        }
    });
    
    document.getElementById('confirmModalConfirm').addEventListener('click', function() {
        modal.remove();
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    });
    
    document.getElementById('confirmModalContent').addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function showStreamPlayers(schema, vhost, app, stream) {
    try {
        console.log('获取播放器列表:', schema, vhost, app, stream);
        
        const result = await Api.getMediaPlayerList(schema, vhost, app, stream);
        
        if (result.code !== 0) {
            showToast('获取播放器列表失败: ' + (result.msg || '未知错误'), 'error');
            return;
        }
        
        const players = result.data || [];
        
        const modal = document.createElement('div');
        modal.className = 'absolute inset-0 bg-black/80 flex items-center justify-center overflow-y-auto pointer-events-auto';
        modal.setAttribute('data-modal', 'streams');
        
        let playersHtml = '';
        if (players.length === 0) {
            playersHtml = `
                <div class="p-8 text-center text-white/60">
                    暂无播放器连接
                </div>
            `;
        } else {
            playersHtml = `
                <div class="space-y-4">
                    ${players.map((player, index) => `
                        <div class="bg-white/5 rounded-lg p-4">
                            <div class="grid grid-cols-2 gap-3 text-sm">
                                <div><span class="text-white/60">标识符:</span> <span class="text-white">${player.identifier || '-'}</span></div>
                                <div><span class="text-white/60">类型:</span> <span class="text-white">${player.typeid || '-'}</span></div>
                                <div><span class="text-white/60">本地IP:</span> <span class="text-white">${player.local_ip || '-'}</span></div>
                                <div><span class="text-white/60">本地端口:</span> <span class="text-white">${player.local_port || '-'}</span></div>
                                <div><span class="text-white/60">远端IP:</span> <span class="text-white">${player.peer_ip || '-'}</span></div>
                                <div><span class="text-white/60">远端端口:</span> <span class="text-white">${player.peer_port || '-'}</span></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div class="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 my-8 border border-white/20" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white">播放器列表: ${app}/${stream}</h3>
                    <button class="text-white/60 hover:text-white" onclick="this.closest('.absolute').remove()">
                        <i class="fa fa-times text-2xl"></i>
                    </button>
                </div>
                <div class="max-h-[70vh] overflow-y-auto">
                    ${playersHtml}
                </div>
            </div>
        `;
        document.getElementById('streams-modal-container').appendChild(modal);
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
    } catch (error) {
        console.error('获取播放器列表失败:', error);
        showToast('获取播放器列表失败: ' + error.message, 'error');
    }
}

async function getStreamSnap(url, container) {
    try {
        console.log('获取截图:', url);
        
        // 显示加载状态
        container.innerHTML = `
            <div class="flex items-center justify-center h-full bg-white/5 rounded-lg">
                <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
        `;
        
        // 调用getSnap接口获取截图
        const result = await Api.getSnap(url, 5, 3);
        
        if (result.code === 0 && result.data) {
            // 显示截图
            container.innerHTML = `
                <div class="relative flex items-center justify-center h-full">
                    <img src="${result.data}" alt="流截图" class="max-w-full max-h-full object-contain rounded-lg border border-white/20 cursor-pointer hover:opacity-90 transition-opacity" onclick="showSnapModal('${result.data}')">
                    <div class="absolute bottom-2 right-2 flex space-x-1">
                        <button class="bg-blue-500 text-white px-2 py-1 rounded text-xs font-semibold hover:bg-blue-600 transition-colors" onclick="downloadSnap('${result.data}')">
                            <i class="fa fa-download mr-1"></i>下载
                        </button>
                    </div>
                </div>
            `;
        } else {
            // 显示错误状态
            container.innerHTML = `
                <div class="flex items-center justify-center h-full bg-white/5 rounded-lg">
                    <span class="text-white/60 text-sm">获取失败</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('获取截图失败:', error);
        // 显示错误状态
        container.innerHTML = `
            <div class="flex items-center justify-center h-full bg-white/5 rounded-lg">
                <span class="text-white/60 text-sm">获取失败</span>
            </div>
        `;
    }
}

function downloadSnap(imageUrl) {
    // 创建一个临时链接并点击下载
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `stream-snap-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showSnapModal(imageUrl) {
    // 创建弹窗显示放大的截图
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 border border-white/20" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-white">流截图</h3>
                <button class="text-white/60 hover:text-white" onclick="this.closest('.fixed').remove()">
                    <i class="fa fa-times text-2xl"></i>
                </button>
            </div>
            <div class="flex justify-center">
                <img src="${imageUrl}" alt="流截图" class="max-w-full max-h-[70vh] object-contain rounded-lg">
            </div>
            <div class="mt-4 flex justify-end">
                <button class="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors" onclick="downloadSnap('${imageUrl}')">
                    <i class="fa fa-download mr-2"></i>下载截图
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // 点击弹窗外部关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function copyStreamUrl(app, stream, schema) {
    const urlParams = await fetchPlayUrlParams(app, stream);
    const url = generatePlayUrl(app, stream, schema, urlParams);
    try {
        await navigator.clipboard.writeText(url);
        showToast('地址已拷贝到剪贴板', 'success');
    } catch (e) {
        // 降级方案
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('地址已拷贝到剪贴板', 'success');
    }
}

async function toggleRecord(type, vhost, app, stream, start, btn) {
    // type: 0=hls, 1=mp4; start: true=开始录制, false=停止录制
    const typeName = type === 0 ? 'HLS' : 'MP4';
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i>处理中...';
        let result;
        if (start) {
            result = await Api.startRecord(type, vhost, app, stream);
        } else {
            result = await Api.stopRecord(type, vhost, app, stream);
        }
        if (result.code === 0 && result.result !== false) {
            showToast(`${typeName}录制已${start ? '开始' : '停止'}`, 'success');
            // 切换按钮状态
            const isNowRecording = start;
            btn.className = isNowRecording
                ? 'bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors'
                : 'bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors';
            btn.innerHTML = isNowRecording
                ? '<i class="fa fa-stop mr-1"></i>停止'
                : '<i class="fa fa-circle mr-1"></i>开始';
            btn.setAttribute('onclick', `toggleRecord(${type},'${vhost}','${app}','${stream}',${!isNowRecording},this)`);
            btn.disabled = false;
            // 更新状态文字
            const statusSpan = btn.parentElement.querySelector('span.text-white span');
            if (statusSpan) {
                statusSpan.className = isNowRecording ? 'text-green-400' : 'text-white/40';
                statusSpan.textContent = isNowRecording ? '录制中' : '未录制';
            }
        } else {
            showToast(`${typeName}录制${start ? '开始' : '停止'}失败: ${result.msg || '未知错误'}`, 'error');
            btn.disabled = false;
            btn.innerHTML = start
                ? '<i class="fa fa-circle mr-1"></i>开始'
                : '<i class="fa fa-stop mr-1"></i>停止';
        }
    } catch (error) {
        showToast(`操作失败: ${error.message}`, 'error');
        btn.disabled = false;
    }
}

async function stopStream(schema, vhost, app, stream) {
    // 显示自定义确认弹窗
    showConfirmModal(
        '确认停止流',
        `确定要停止流 ${app}/${stream} 吗？`,
        async function() {
            try {
                console.log('停止流:', schema, vhost, app, stream);
                
                const result = await Api.closeStream(schema, vhost, app, stream);
                
                if (result.code === 0) {
                    showToast('停止流成功', 'success');
                    // 重新加载流列表
                    loadStreams();
                } else {
                    showToast('停止流失败: ' + (result.msg || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('停止流失败:', error);
                showToast('停止流失败: ' + error.message, 'error');
            }
        }
    );
}

// ══════════════════════════════════════════════════════════
// 流探针 - 帧数据分析弹窗
// ══════════════════════════════════════════════════════════
async function showProbeModal(vhost, app, stream) {
    const container = document.getElementById('streams-modal-container');

    // 先显示加载中弹窗
    const modal = document.createElement('div');
    modal.className = 'absolute inset-0 bg-black/80 overflow-y-auto pointer-events-auto';
    modal.setAttribute('data-modal', 'probe');
    modal.innerHTML = `
        <div class="bg-gray-900 rounded-xl p-6 w-full mx-auto my-8 border border-white/20" style="max-width:1200px;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-white"><i class="fa fa-stethoscope mr-2 text-teal-400"></i>流探针分析：${app}/${stream}</h3>
                <button class="text-white/60 hover:text-white" onclick="this.closest('[data-modal=probe]').remove()">
                    <i class="fa fa-times text-2xl"></i>
                </button>
            </div>
            <div id="probe-body" class="flex items-center justify-center min-h-32">
                <div class="text-center text-white/60 py-12">
                    <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-400 mx-auto mb-4"></div>
                    <p>正在采集 5 秒帧数据，请稍候…</p>
                </div>
            </div>
        </div>
    `;
    container.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    try {
        const result = await Api.addProbe(vhost, app, stream, 5000);
        const body = modal.querySelector('#probe-body');
        if (result.code !== 0) {
            body.innerHTML = `<div class="text-red-400 p-6">探针失败：${result.msg || '未知错误'}</div>`;
            return;
        }
        const frames = result.data || [];
        body.innerHTML = renderProbeAnalysis(frames);
        bindChartHover(body);
    } catch (e) {
        const body = modal.querySelector('#probe-body');
        body.innerHTML = `<div class="text-red-400 p-6">请求失败：${e.message}</div>`;
    }
}

/**
 * 绑定折线图悬停交互（需在 innerHTML 填充后调用）
 */
function bindChartHover(container) {
    container.querySelectorAll('[id^="pc"]').forEach(svg => {
        const tip = document.getElementById(svg.id + '-tip');
        if (!tip) return;
        const W = parseFloat(svg.getAttribute('viewBox').split(' ')[2]) || 1000;
        svg.querySelectorAll('.probe-hit').forEach(g => {
            g.addEventListener('mouseenter', function () {
                const vline = this.querySelector('.probe-vline');
                const dot   = this.querySelector('.probe-dot');
                if (vline) vline.style.display = '';
                if (dot)   dot.style.display   = '';
                const tx = parseFloat(this.getAttribute('transform').replace('translate(', ''));
                tip.textContent = this.dataset.val + ' ms';
                tip.style.left  = (tx / W * 100).toFixed(2) + '%';
                tip.style.display = 'block';
            });
            g.addEventListener('mouseleave', function () {
                const vline = this.querySelector('.probe-vline');
                const dot   = this.querySelector('.probe-dot');
                if (vline) vline.style.display = 'none';
                if (dot)   dot.style.display   = 'none';
                tip.style.display = 'none';
            });
        });
    });
}

/**
 * 分析帧数据并渲染分析报告
 */
function renderProbeAnalysis(frames) {
    if (!frames.length) return `<div class="text-white/50 p-6 text-center">未获取到帧数据</div>`;

    // ── 按 codec 分组 ──
    const groups = {};
    for (const f of frames) {
        const key = f.codec;
        if (!groups[key]) groups[key] = [];
        groups[key].push(f);
    }

    const codecKeys = Object.keys(groups);

    // ── 对每个 codec 统计 ──
    function analyzeGroup(list) {
        // 去重（有时同一帧有多条记录，config_frame 不同），保留 frame_size 最大的
        const byDts = {};
        for (const f of list) {
            const k = f.dts;
            if (!byDts[k] || f.frame_size > byDts[k].frame_size) byDts[k] = f;
        }
        const uniq = Object.values(byDts).sort((a, b) => a.dts - b.dts);

        // dts 间隔
        const dtsIntervals = [];
        for (let i = 1; i < uniq.length; i++) dtsIntervals.push(uniq[i].dts - uniq[i - 1].dts);

        // recv_stamp 间隔（到达间隔）
        const recvIntervals = [];
        for (let i = 1; i < uniq.length; i++) recvIntervals.push(uniq[i].recv_stamp - uniq[i - 1].recv_stamp);

        // pts - dts 偏移
        const ptsDtsOffsets = uniq.map(f => f.pts - f.dts);

        function stats(arr) {
            if (!arr.length) return { min: 0, max: 0, avg: 0, stddev: 0, p95: 0 };
            const sorted = [...arr].sort((a, b) => a - b);
            const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
            const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
            return {
                min: sorted[0],
                max: sorted[sorted.length - 1],
                avg: avg.toFixed(2),
                stddev: Math.sqrt(variance).toFixed(2),
                p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
            };
        }

        const dtsStats  = stats(dtsIntervals);
        const recvStats = stats(recvIntervals);
        const ptsStats  = stats(ptsDtsOffsets);
        const keyFrames = uniq.filter(f => f.key_frame).length;
        const totalBytes = uniq.reduce((s, f) => s + f.frame_size, 0);
        const duration = uniq.length > 1 ? uniq[uniq.length - 1].dts - uniq[0].dts : 0;
        const fps = duration > 0 ? ((uniq.length / duration) * 1000).toFixed(2) : 'N/A';

        // 平滑度评分（stddev/avg 越小越平滑）
        function smoothScore(s) {
            if (!s.avg || s.avg == 0) return '—';
            const ratio = s.stddev / s.avg;
            if (ratio < 0.05) return '<span class="text-green-400 font-bold">优秀</span>';
            if (ratio < 0.15) return '<span class="text-yellow-400 font-bold">良好</span>';
            if (ratio < 0.30) return '<span class="text-orange-400 font-bold">一般</span>';
            return '<span class="text-red-400 font-bold">抖动</span>';
        }

        return { uniq, dtsStats, recvStats, ptsStats, keyFrames, totalBytes, duration, fps, smoothScore };
    }

    // ── 音视频交织分析 ──
    function interleaveScore(allFrames) {
        if (codecKeys.length < 2) return null;
        // 按 recv_stamp 排序，检查音视频是否交替出现
        const sorted = [...allFrames].sort((a, b) => a.recv_stamp - b.recv_stamp);
        let runs = 0, prev = null;
        for (const f of sorted) {
            const type = f.track_type ? f.track_type.toLowerCase() : (f.index === 65535 ? 'audio' : 'video');
            if (type !== prev) { runs++; prev = type; }
        }
        // runs 越多越好（说明交替越频繁）
        const ratio = runs / sorted.length;
        if (ratio > 0.6) return `<span class="text-green-400 font-bold">良好</span>（交织比 ${(ratio * 100).toFixed(0)}%）`;
        if (ratio > 0.3) return `<span class="text-yellow-400 font-bold">一般</span>（交织比 ${(ratio * 100).toFixed(0)}%）`;
        return `<span class="text-red-400 font-bold">差</span>（交织比 ${(ratio * 100).toFixed(0)}%）`;
    }

    const interleave = interleaveScore(frames);

    // ── 渲染每个 codec 的可视化时间线 ──
    function renderTimeline(uniq, label) {
        if (uniq.length < 2) return '';
        const baseTs = uniq[0].dts;
        const totalDur = uniq[uniq.length - 1].dts - baseTs || 1;
        const W = 1000;
        const dots = uniq.map(f => {
            const x = Math.round(((f.dts - baseTs) / totalDur) * W);
            const color = f.key_frame ? '#34d399' : (f.config_frame ? '#60a5fa' : '#a78bfa');
            const tip = `dts=${f.dts} pts=${f.pts} size=${f.frame_size}B key=${f.key_frame}`;
            return `<circle cx="${x}" cy="12" r="${f.key_frame ? 5 : 3}" fill="${color}" opacity="0.85"><title>${tip}</title></circle>`;
        }).join('');
        return `
            <div class="mt-3">
                <div class="text-xs text-white/50 mb-1">${label} 帧时间线
                    <span class="ml-3 text-green-400">● 关键帧</span>
                    <span class="ml-2 text-blue-400">● 配置帧</span>
                    <span class="ml-2 text-purple-400">● 普通帧</span>
                </div>
                <svg width="100%" viewBox="0 0 ${W} 24" style="height:24px;background:rgba(255,255,255,0.04);border-radius:4px;">
                    <line x1="0" y1="12" x2="${W}" y2="12" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
                    ${dots}
                </svg>
            </div>
        `;
    }

    // ── 生成折线图（通用）──
    // 全局确保 probe 悬停 tooltip 样式只注入一次
    if (!document.getElementById('probe-chart-style')) {
        const s = document.createElement('style');
        s.id = 'probe-chart-style';
        s.textContent = `
            .probe-chart-wrap { position:relative; }
            .probe-chart-tip {
                position:absolute; top:-28px; transform:translateX(-50%);
                background:rgba(15,15,20,0.92); color:#fff;
                font-size:11px; padding:2px 7px; border-radius:4px;
                white-space:nowrap; pointer-events:none;
                border:1px solid rgba(255,255,255,0.15);
                display:none; z-index:99;
            }
            .probe-chart-wrap:hover .probe-chart-tip { display:block; }
        `;
        document.head.appendChild(s);
    }

    // 生成唯一 id 避免多图冲突
    let _chartId = 0;
    function renderLineChart(intervals, label, color) {
        if (intervals.length < 2) return '';
        const absMax = Math.max(...intervals.map(Math.abs), 1);
        const W = 1000, H = 40, mid = H / 2;
        const step = W / (intervals.length - 1 || 1);
        const id = `pc${++_chartId}`;

        // 折线坐标
        const pts = intervals.map((v, i) => ({
            x: i * step,
            y: mid - (v / absMax) * mid,
            v
        }));
        const pointsAttr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

        // 每个数据点画一个透明的宽感应矩形 + 竖线（hover 显示）
        const hitAreas = pts.map((p, i) => {
            const hw = Math.max(step / 2, 6);
            return `<g class="probe-hit" data-val="${p.v}" data-idx="${i}"
                        transform="translate(${p.x.toFixed(1)},0)" style="cursor:crosshair;">
                <rect x="${(-hw).toFixed(1)}" y="0" width="${(hw * 2).toFixed(1)}" height="${H}"
                      fill="transparent"/>
                <line x1="0" y1="0" x2="0" y2="${H}"
                      stroke="rgba(255,255,255,0.25)" stroke-width="1"
                      class="probe-vline" style="display:none;"/>
                <circle cx="0" cy="${p.y.toFixed(1)}" r="3"
                        fill="${color}" class="probe-dot" style="display:none;"/>
            </g>`;
        }).join('');

        return `
            <div class="mt-3">
                <div class="text-xs text-white/50 mb-1">${label}</div>
                <div class="probe-chart-wrap" style="position:relative;">
                    <div class="probe-chart-tip" id="${id}-tip"></div>
                    <svg id="${id}" width="100%" viewBox="0 0 ${W} ${H}"
                         style="height:40px;background:rgba(255,255,255,0.04);border-radius:4px;display:block;">
                        <line x1="0" y1="${mid}" x2="${W}" y2="${mid}"
                              stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4 4"/>
                        <polyline points="${pointsAttr}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
                        ${hitAreas}
                    </svg>
                </div>
            </div>
        `;
    }

    // ── 整体汇总卡片 ──
    let summaryCards = codecKeys.map(codec => {
        const g = analyzeGroup(groups[codec]);
        const trackType = (groups[codec][0]?.track_type || '').toLowerCase();
        const isVideo = trackType ? trackType === 'video' : true;
        const icon = isVideo ? '🎬' : '🎵';
        return `
        <div class="bg-white/5 rounded-lg p-4 border border-white/10">
            <div class="flex items-center justify-between mb-3">
                <span class="text-white font-bold text-base">${icon} ${codec}</span>
                <span class="text-white/40 text-xs">${g.uniq.length} 帧 · ${(g.totalBytes / 1024).toFixed(1)} KB · ${g.duration} ms</span>
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div class="text-white/50">帧率 / FPS</div>
                <div class="text-white font-mono">${g.fps}</div>
                <div class="text-white/50">关键帧数</div>
                <div class="text-white font-mono">${g.keyFrames}</div>

                <div class="text-white/50 mt-2 col-span-2 border-t border-white/10 pt-2 font-semibold text-white/70">DTS 时间戳间隔（ms）</div>
                <div class="text-white/50">均值 / 抖动 (σ)</div>
                <div class="text-white font-mono">${g.dtsStats.avg} / ${g.dtsStats.stddev} ms — 平滑度：${g.smoothScore(g.dtsStats)}</div>
                <div class="text-white/50">最小 / 最大</div>
                <div class="text-white font-mono">${g.dtsStats.min} / ${g.dtsStats.max} ms</div>

                <div class="text-white/50 mt-2 col-span-2 border-t border-white/10 pt-2 font-semibold text-white/70">接收间隔（到达抖动）</div>
                <div class="text-white/50">均值 / 抖动 (σ)</div>
                <div class="text-white font-mono">${g.recvStats.avg} / ${g.recvStats.stddev} ms — 平滑度：${g.smoothScore(g.recvStats)}</div>
                <div class="text-white/50">最小 / 最大</div>
                <div class="text-white font-mono">${g.recvStats.min} / ${g.recvStats.max} ms</div>

                <div class="text-white/50 mt-2 col-span-2 border-t border-white/10 pt-2 font-semibold text-white/70">PTS - DTS 偏移</div>
                <div class="text-white/50">均值 / 抖动 (σ)</div>
                <div class="text-white font-mono">${g.ptsStats.avg} / ${g.ptsStats.stddev} ms</div>
                <div class="text-white/50">最小 / 最大</div>
                <div class="text-white font-mono">${g.ptsStats.min} / ${g.ptsStats.max} ms</div>
            </div>
            ${renderTimeline(g.uniq, codec)}
            ${renderLineChart(
                g.uniq.slice(1).map((f, i) => g.uniq[i + 1].dts - g.uniq[i].dts),
                `${codec} ΔDTS 时间戳间隔抖动（ms）`, '#a78bfa'
            )}
            ${renderLineChart(
                g.uniq.slice(1).map((f, i) => g.uniq[i + 1].recv_stamp - g.uniq[i].recv_stamp),
                `${codec} ΔRecv 到达间隔抖动（ms）`, '#2dd4bf'
            )}
        </div>
        `;
    }).join('');

    // ── 音视频 DTS 打点交织图 ──
    function renderInterleaveChart(allFrames) {
        if (codecKeys.length < 2) return '';

        // 按 dts 排序，去掉 config_frame（SPS/PPS 等无意义帧）
        const sorted = allFrames
            .filter(f => !f.config_frame)
            .sort((a, b) => a.dts - b.dts);
        if (sorted.length < 2) return '';

        // 为每个 codec 分配独立 Y 行
        const tracks = [...new Set(sorted.map(f => f.codec))];
        const trackY  = {};   // codec → 中心 Y
        const ROW_H   = 28;   // 每行高度
        const PAD_TOP = 6;    // 顶部留白
        const LABEL_W = Math.min(Math.max(...tracks.map(t => t.length)) * 7 + 16, 160);  // 按最长名称动态计算，最大160
        const W_TOTAL = 1000;
        const W_CHART = W_TOTAL - LABEL_W; // 打点区宽度
        tracks.forEach((t, i) => { trackY[t] = PAD_TOP + i * ROW_H + ROW_H / 2; });
        const H = PAD_TOP + tracks.length * ROW_H + 4;

        const minDts = sorted[0].recv_stamp;
        const maxDts = sorted[sorted.length - 1].recv_stamp || minDts + 1;
        const xOf = ts => LABEL_W + ((ts - minDts) / (maxDts - minDts)) * W_CHART;

        // 轨道颜色
        const COLORS = ['#a78bfa', '#2dd4bf', '#f59e0b', '#f87171', '#34d399', '#60a5fa'];
        const trackColor = {};
        tracks.forEach((t, i) => { trackColor[t] = COLORS[i % COLORS.length]; });

        // 横向参考线（仅打点区）
        const hlines = tracks.map(t => {
            const y = trackY[t].toFixed(1);
            return `<line x1="${LABEL_W}" y1="${y}" x2="${W_TOTAL}" y2="${y}" stroke="${trackColor[t]}" stroke-width="0.5" opacity="0.15"/>`;
        }).join('');

        // 标签区背景分隔线
        const labelSep = `<line x1="${LABEL_W}" y1="0" x2="${LABEL_W}" y2="${H}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;

        // 帧打点（按 recv_stamp 排序绘制，x 轴为 recv_stamp）
        const vlines = sorted.map(f => {
            const x = xOf(f.recv_stamp).toFixed(1);
            const y = trackY[f.codec];
            const r = f.key_frame ? 4 : 2.5;
            const color = trackColor[f.codec];
            const tip = `[${f.codec}] recv=${f.recv_stamp} dts=${f.dts} size=${f.frame_size}B key=${f.key_frame}`;
            return `<circle cx="${x}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" opacity="0.75"><title>${tip}</title></circle>`;
        }).join('');

        // 连接线：recv_stamp 相邻的跨轨道帧连线
        const byRecv = [...sorted].sort((a, b) => a.recv_stamp - b.recv_stamp);
        const connLines = [];
        for (let i = 1; i < byRecv.length; i++) {
            const a = byRecv[i - 1], b = byRecv[i];
            if (a.codec !== b.codec) {
                const x1 = xOf(a.recv_stamp).toFixed(1), y1 = trackY[a.codec].toFixed(1);
                const x2 = xOf(b.recv_stamp).toFixed(1), y2 = trackY[b.codec].toFixed(1);
                connLines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.08)" stroke-width="0.8"/>`);
            }
        }

        // 轨道标签（最后绘制，确保在最上层；背景矩形防止文字与点重叠）
        const labels = tracks.map(t => {
            const y = trackY[t];
            const color = trackColor[t];
            return `
                <rect x="2" y="${(y - 8).toFixed(1)}" width="${LABEL_W - 6}" height="16" rx="2"
                      fill="rgba(17,24,39,0.85)"/>
                <text x="6" y="${(y + 4).toFixed(1)}"
                      font-size="10" fill="${color}" text-anchor="start"
                      font-family="monospace">${t}</text>
            `;
        }).join('');

        return `
            <div class="mt-4">
                <div class="text-xs text-white/50 mb-1">音视频 RecvStamp 交织打点图
                    <span class="ml-3 text-white/30">X轴=recv_stamp到达时间 · 圆点大=关键帧 · 连线=相邻到达帧跨轨道</span>
                </div>
                <svg width="100%" viewBox="0 0 ${W_TOTAL} ${H}"
                     style="height:${H}px;background:rgba(255,255,255,0.03);border-radius:4px;display:block;">
                    ${hlines}
                    ${labelSep}
                    ${connLines.join('')}
                    ${vlines}
                    ${labels}
                </svg>
            </div>
        `;
    }

    const interleaveRow = interleave ? `
        <div class="bg-white/5 rounded-lg p-4 border border-white/10">
            <div class="flex items-center gap-4 mb-3">
                <span class="text-white/70 font-semibold">🎵🎬 音视频交织性</span>
                <span>${interleave}</span>
                <span class="text-white/40 text-xs ml-auto">按 recv_stamp 时序统计音视频交替频率</span>
            </div>
            ${renderInterleaveChart(frames)}
        </div>
    ` : '';

    // 原始帧表格（折叠）- 计算每个 track（codec）内的 Δdts 和 Δrecv_stamp
    const trackLastDts = {};
    const trackLastRecv = {};
    const rows = frames.map(f => {
        const codec = f.codec;
        const deltaDts  = codec in trackLastDts  ? f.dts        - trackLastDts[codec]  : '—';
        const deltaRecv = codec in trackLastRecv ? f.recv_stamp - trackLastRecv[codec] : '—';
        trackLastDts[codec]  = f.dts;
        trackLastRecv[codec] = f.recv_stamp;

        const dtsColor  = (typeof deltaDts  === 'number' && deltaDts  < 0) ? 'text-red-400' : 'text-white';
        const recvColor = (typeof deltaRecv === 'number' && deltaRecv < 0) ? 'text-red-400'
                        : (typeof deltaRecv === 'number' && deltaRecv > 200) ? 'text-yellow-400' : 'text-white';
        return `
        <tr class="border-b border-white/5 hover:bg-white/5 text-xs">
            <td class="px-2 py-1 font-mono text-white/70">${f.codec}</td>
            <td class="px-2 py-1 font-mono">${f.dts}</td>
            <td class="px-2 py-1 font-mono">${f.pts}</td>
            <td class="px-2 py-1 font-mono">${f.pts - f.dts}</td>
            <td class="px-2 py-1 font-mono">${f.recv_stamp}</td>
            <td class="px-2 py-1 font-mono ${dtsColor}">${deltaDts}</td>
            <td class="px-2 py-1 font-mono ${recvColor}">${deltaRecv}</td>
            <td class="px-2 py-1 font-mono">${f.frame_size}</td>
            <td class="px-2 py-1">${f.key_frame ? '<span class="text-green-400">✓</span>' : ''}</td>
            <td class="px-2 py-1">${f.config_frame ? '<span class="text-blue-400">✓</span>' : ''}</td>
        </tr>
    `}).join('');

    return `
        <div class="space-y-4 p-1">
            ${summaryCards}
            ${interleaveRow}
            <details class="bg-white/5 rounded-lg border border-white/10">
                <summary class="px-4 py-3 cursor-pointer text-white/60 text-sm hover:text-white select-none">
                    <i class="fa fa-table mr-2"></i>原始帧数据（${frames.length} 条）
                </summary>
                <div class="overflow-x-auto max-h-64 overflow-y-auto">
                    <table class="w-full text-white">
                        <thead class="sticky top-0 bg-gray-900">
                            <tr class="border-b border-white/10 text-xs text-white/50">
                                <th class="px-2 py-2 text-left">Codec</th>
                                <th class="px-2 py-2 text-left">DTS</th>
                                <th class="px-2 py-2 text-left">PTS</th>
                                <th class="px-2 py-2 text-left">PTS-DTS</th>
                                <th class="px-2 py-2 text-left">RecvStamp</th>
                                <th class="px-2 py-2 text-left">ΔDTS</th>
                                <th class="px-2 py-2 text-left">ΔRecv</th>
                                <th class="px-2 py-2 text-left">Size(B)</th>
                                <th class="px-2 py-2 text-left">KeyFrm</th>
                                <th class="px-2 py-2 text-left">CfgFrm</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </details>
        </div>
    `;
}
