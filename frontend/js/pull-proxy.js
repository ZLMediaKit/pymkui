// ==================== 拉流代理页面 ====================

function initPullProxyEvents() {
    const addButton = document.getElementById('addPullProxy');
    if (addButton) {
        // 移除旧监听器，防止重复绑定
        const newBtn = addButton.cloneNode(true);
        addButton.parentNode.replaceChild(newBtn, addButton);
        newBtn.addEventListener('click', openAddPullProxyModal);
    }

    const refreshBtn = document.getElementById('refreshPullProxy');
    if (refreshBtn) {
        const newRefreshBtn = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
        newRefreshBtn.addEventListener('click', loadPullProxyList);
    }
}

async function loadPullProxyList() {
    initPullProxyEvents();

    const tbody = document.getElementById('pullProxyTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="p-10 text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
                <span class="text-white/60 font-semibold">加载中...</span>
            </td>
        </tr>
    `;

    try {
        const result = await Api.getStreamProxyList();

        if (result.code === 0) {
            const data = result.data || [];

            if (data.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="p-10 text-center text-white/60 font-semibold">
                            暂无拉流代理，点击「新增拉流代理」添加
                        </td>
                    </tr>
                `;
                return;
            }

            let html = '';
            data.forEach(proxy => {
                const onDemand = proxy.on_demand ? 1 : 0;
                const onDemandClass = onDemand ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-white/40';
                const onDemandText = onDemand ? '按需' : '立即';
                const createdAt = proxy.created_at || '-';

                html += `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td class="p-4 text-white/70 text-sm">${proxy.id}</td>
                        <td class="p-4 text-white text-sm">${proxy.vhost || '__defaultVhost__'}</td>
                        <td class="p-4 text-white font-semibold">${proxy.app || '-'}</td>
                        <td class="p-4 text-white font-semibold">${proxy.stream || '-'}</td>
                        <td class="p-4 text-white/80 text-sm max-w-xs truncate" title="${proxy.url || ''}">${proxy.url || '-'}</td>
                        <td class="p-4">
                            <span class="px-3 py-1 rounded-full text-sm font-semibold ${onDemandClass}">${onDemandText}</span>
                        </td>
                        <td class="p-4 text-white/60 text-sm">${createdAt}</td>
                        <td class="p-4 space-x-2">
                            <button class="bg-blue-500/80 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors"
                                onclick="viewPullProxyDetail(${proxy.id})">
                                详情
                            </button>
                            <button class="bg-red-500/80 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors"
                                onclick="deletePullProxy('${proxy.vhost || '__defaultVhost__'}', '${proxy.app}', '${proxy.stream}', ${proxy.id})">
                                删除
                            </button>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="p-10 text-center text-white/60 font-semibold">
                        加载失败: ${result.msg || '未知错误'}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="p-10 text-center text-white/60 font-semibold">
                    网络错误: ${error.message}
                </td>
            </tr>
        `;
    }
}

// ==================== 新增弹窗 ====================

async function openAddPullProxyModal() {
    showPullProxyModal('新增拉流代理', null, {});
}

async function viewPullProxyDetail(id) {
    try {
        const result = await Api.getStreamProxy(id);
        if (result.code === 0 && result.data) {
            const proxy = result.data;
            let protocolParams = {};
            let customParams = {};
            try { protocolParams = JSON.parse(proxy.protocol_params || '{}'); } catch (e) {}
            try { customParams = JSON.parse(proxy.custom_params || '{}'); } catch (e) {}
            // 合并到 proxy 对象方便 getValue 使用
            // schema / rtp_type / retry_count / timeout_sec 存在 custom_params 里，也提升到顶层
            const mergedData = { ...proxy, ...protocolParams, ...customParams };
            // 详情弹窗的自定义参数区域只显示真正"额外"的参数（排除已有专属字段的）
            const knownKeys = new Set(['schema', 'rtp_type', 'retry_count', 'timeout_sec']);
            const extraCustomParams = Object.fromEntries(
                Object.entries(customParams).filter(([k]) => !knownKeys.has(k))
            );
            showPullProxyModal('拉流代理详情（只读）', mergedData, {}, true, extraCustomParams);
        } else {
            showToast('获取详情失败: ' + (result.msg || '未知错误'), 'error');
        }
    } catch (e) {
        showToast('获取详情失败: ' + e.message, 'error');
    }
}

function showPullProxyModal(title, data, serverConfig = {}, readOnly = false, initialCustomParams = {}) {
    // 确保旧弹窗已关闭
    const oldModal = document.getElementById('pullProxyModalWrapper');
    if (oldModal) oldModal.remove();

    const getValue = (key, defaultValue = '') => {
        if (data && data[key] !== undefined && data[key] !== null) return data[key];
        if (serverConfig && serverConfig[key] !== undefined) return serverConfig[key];
        return defaultValue;
    };

    const disabledAttr = readOnly ? 'disabled' : '';
    const inputCls = readOnly
        ? 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white/60 cursor-not-allowed'
        : 'w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary';

    const wrapper = document.createElement('div');
    wrapper.id = 'pullProxyModalWrapper';
    wrapper.className = 'absolute inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center pointer-events-auto overflow-y-auto py-8';
    wrapper.style.zIndex = '20';

    wrapper.innerHTML = `
        <div class="bg-gray-900 rounded-xl p-6 w-full max-w-3xl mx-4 border border-white/20 shadow-2xl" id="pullProxyModalContent">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold text-white">${title}</h3>
                <button id="pullProxyModalClose" class="text-white/60 hover:text-white transition-colors">
                    <i class="fa fa-times text-2xl"></i>
                </button>
            </div>

            <form id="pullProxyForm" class="space-y-5">
                <input type="hidden" id="proxyId" value="${data ? (data.id || '') : ''}">

                <!-- 基本信息 -->
                <div class="bg-white/5 rounded-lg p-4">
                    <h4 class="text-base font-semibold text-white mb-4 pb-2 border-b border-white/10">基本信息</h4>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-white/80 text-sm font-semibold mb-1">
                                拉流地址(url) <span class="text-red-400">*</span>
                            </label>
                            <input type="text" id="pullUrl" ${disabledAttr}
                                value="${getValue('url')}"
                                placeholder="rtsp://192.168.1.100/stream  或  rtmp://...  或  http://..."
                                class="${inputCls}">
                        </div>
                        <div class="grid grid-cols-3 gap-4">
                            <div>
                                <label class="block text-white/80 text-sm font-semibold mb-1">虚拟主机(vhost)</label>
                                <input type="text" id="pullVhost" ${disabledAttr}
                                    value="${getValue('vhost', '__defaultVhost__')}"
                                    placeholder="__defaultVhost__"
                                    class="${inputCls}">
                            </div>
                            <div>
                                <label class="block text-white/80 text-sm font-semibold mb-1">
                                    应用(app) <span class="text-red-400">*</span>
                                </label>
                                <input type="text" id="pullApp" ${disabledAttr}
                                    value="${getValue('app')}"
                                    placeholder="live"
                                    class="${inputCls}">
                            </div>
                            <div>
                                <label class="block text-white/80 text-sm font-semibold mb-1">
                                    流ID(stream) <span class="text-red-400">*</span>
                                </label>
                                <input type="text" id="pullStream" ${disabledAttr}
                                    value="${getValue('stream')}"
                                    placeholder="test"
                                    class="${inputCls}">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-white/80 text-sm font-semibold mb-1">重试次数(retry_count，-1=无限)</label>
                                <input type="number" id="retryCount" ${disabledAttr}
                                    value="${getValue('retry_count', '-1')}"
                                    placeholder="-1"
                                    class="${inputCls}">
                            </div>
                            <div>
                                <label class="block text-white/80 text-sm font-semibold mb-1">超时时间(timeout_sec，秒)</label>
                                <input type="number" id="timeoutSec" ${disabledAttr}
                                    value="${getValue('timeout_sec', '')}"
                                    placeholder="10"
                                    class="${inputCls}">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-white/80 text-sm font-semibold mb-1">
                                    按需拉流(on_demand)
                                    <span class="text-white/40 font-normal ml-1">— 有人播放时再拉流</span>
                                </label>
                                <select id="onDemand" ${disabledAttr}
                                    class="${inputCls}" style="color:white;">
                                    <option value="0" ${!getValue('on_demand') || getValue('on_demand') == '0' ? 'selected' : ''}>关闭（立即拉流）</option>
                                    <option value="1" ${getValue('on_demand') == '1' || getValue('on_demand') === true || getValue('on_demand') === 1 ? 'selected' : ''}>开启（按需拉流）</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-white/80 text-sm font-semibold mb-1">
                                    拉流协议(schema)
                                    <span class="text-white/40 font-normal ml-1">— URL无法判断协议时指定</span>
                                </label>
                                <select id="pullSchema" ${disabledAttr}
                                    class="${inputCls}" style="color:white;">
                                    <option value="" ${!getValue('schema') ? 'selected' : ''}>自动识别（默认）</option>
                                    <option value="hls" ${getValue('schema') === 'hls' ? 'selected' : ''}>hls</option>
                                    <option value="ts"  ${getValue('schema') === 'ts'  ? 'selected' : ''}>ts（HTTP-TS）</option>
                                    <option value="flv" ${getValue('schema') === 'flv' ? 'selected' : ''}>flv（HTTP-FLV）</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-white/80 text-sm font-semibold mb-1">RTSP拉流方式(rtp_type)</label>
                            <select id="rtpType" ${disabledAttr}
                                class="${inputCls}" style="color:white;">
                                <option value="" ${!getValue('rtp_type') ? 'selected' : ''}>默认（TCP）</option>
                                <option value="0" ${getValue('rtp_type') === '0' ? 'selected' : ''}>0 - TCP</option>
                                <option value="1" ${getValue('rtp_type') === '1' ? 'selected' : ''}>1 - UDP</option>
                                <option value="2" ${getValue('rtp_type') === '2' ? 'selected' : ''}>2 - 组播</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- 转协议参数 -->
                <div class="bg-white/5 rounded-lg p-4">
                    <div class="flex justify-between items-center mb-4 pb-2 border-b border-white/10">
                        <h4 class="text-base font-semibold text-white">转协议参数</h4>
                        ${!readOnly ? `
                        <div class="flex space-x-2">
                            <button type="button" id="loadDefaultProtocolBtn"
                                class="bg-white/10 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-white/20 transition-colors">
                                <i class="fa fa-magic mr-1"></i>加载默认
                            </button>
                            <button type="button" id="loadPresetProtocolBtn"
                                class="bg-primary/30 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-primary/50 transition-colors">
                                <i class="fa fa-list mr-1"></i>从预设加载
                            </button>
                            <button type="button" id="clearProtocolBtn"
                                class="bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition-colors">
                                <i class="fa fa-eraser mr-1"></i>清空
                            </button>
                        </div>` : ''}
                    </div>

                    <!-- 开关类参数（使用 select） -->
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        ${buildProtocolToggle('开启HLS(enable_hls)', 'enableHls', getValue('enable_hls'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('开启HLS-FMP4(enable_hls_fmp4)', 'enableHlsFmp4', getValue('enable_hls_fmp4'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('开启MP4录制(enable_mp4)', 'enableMp4', getValue('enable_mp4'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('开启RTSP(enable_rtsp)', 'enableRtsp', getValue('enable_rtsp'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('开启RTMP/FLV(enable_rtmp)', 'enableRtmp', getValue('enable_rtmp'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('开启HTTP-TS(enable_ts)', 'enableTs', getValue('enable_ts'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('开启FMP4(enable_fmp4)', 'enableFmp4', getValue('enable_fmp4'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('开启音频(enable_audio)', 'enableAudio', getValue('enable_audio'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('添加静音音频(add_mute_audio)', 'addMuteAudio', getValue('add_mute_audio'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('自动关闭(auto_close)', 'autoClose', getValue('auto_close'), disabledAttr, inputCls)}
                    </div>

                    <!-- 按需生成 -->
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        ${buildProtocolToggle('HLS按需生成(hls_demand)', 'hlsDemand', getValue('hls_demand'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('RTSP按需生成(rtsp_demand)', 'rtspDemand', getValue('rtsp_demand'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('RTMP按需生成(rtmp_demand)', 'rtmpDemand', getValue('rtmp_demand'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('TS按需生成(ts_demand)', 'tsDemand', getValue('ts_demand'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('FMP4按需生成(fmp4_demand)', 'fmp4Demand', getValue('fmp4_demand'), disabledAttr, inputCls)}
                        ${buildProtocolToggle('MP4计入观看数(mp4_as_player)', 'mp4AsPlayer', getValue('mp4_as_player'), disabledAttr, inputCls)}
                    </div>

                    <!-- 其他参数 -->
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-white/80 text-sm font-semibold mb-1">时间戳覆盖(modify_stamp)</label>
                            <select id="modifyStamp" ${disabledAttr} class="${inputCls}" style="color:white;">
                                <option value="" ${!getValue('modify_stamp') ? 'selected' : ''}>默认</option>
                                <option value="0" ${getValue('modify_stamp') === '0' ? 'selected' : ''}>0 - 绝对时间戳</option>
                                <option value="1" ${getValue('modify_stamp') === '1' ? 'selected' : ''}>1 - 系统时间戳</option>
                                <option value="2" ${getValue('modify_stamp') === '2' ? 'selected' : ''}>2 - 相对时间戳</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-white/80 text-sm font-semibold mb-1">MP4切片大小(mp4_max_second，秒)</label>
                            <input type="number" id="mp4MaxSecond" ${disabledAttr}
                                value="${getValue('mp4_max_second')}"
                                placeholder="默认"
                                class="${inputCls}">
                        </div>
                        <div>
                            <label class="block text-white/80 text-sm font-semibold mb-1">MP4保存路径(mp4_save_path)</label>
                            <input type="text" id="mp4SavePath" ${disabledAttr}
                                value="${getValue('mp4_save_path')}"
                                placeholder="默认路径"
                                class="${inputCls}">
                        </div>
                        <div>
                            <label class="block text-white/80 text-sm font-semibold mb-1">HLS保存路径(hls_save_path)</label>
                            <input type="text" id="hlsSavePath" ${disabledAttr}
                                value="${getValue('hls_save_path')}"
                                placeholder="默认路径"
                                class="${inputCls}">
                        </div>
                        <div>
                            <label class="block text-white/80 text-sm font-semibold mb-1">断流保留时间(continue_push_ms，毫秒)</label>
                            <input type="number" id="continuePushMs" ${disabledAttr}
                                value="${getValue('continue_push_ms')}"
                                placeholder="默认"
                                class="${inputCls}">
                        </div>
                    </div>
                </div>

                <!-- 自定义参数 -->
                <div class="bg-white/5 rounded-lg p-4">
                    <div class="flex justify-between items-center mb-4 pb-2 border-b border-white/10">
                        <h4 class="text-base font-semibold text-white">自定义参数（追加到 ZLMediaKit addStreamProxy）</h4>
                        ${!readOnly ? `
                        <button type="button" id="addCustomParamBtn"
                            class="bg-primary/30 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-primary/50 transition-colors">
                            <i class="fa fa-plus mr-1"></i>添加参数
                        </button>` : ''}
                    </div>
                    <div id="customParamsContainer" class="space-y-2">
                        <!-- 动态填充 -->
                    </div>
                </div>

                ${!readOnly ? `
                <div class="flex justify-end space-x-3 pt-2">
                    <button type="button" id="pullProxyModalCancel"
                        class="bg-white/10 text-white px-6 py-2 rounded-lg font-semibold hover:bg-white/20 transition-colors">
                        取消
                    </button>
                    <button type="submit"
                        class="bg-gradient-primary text-white px-6 py-2 rounded-lg font-semibold hover:shadow-neon transition-all duration-300">
                        <i class="fa fa-save mr-2"></i>保存并添加代理
                    </button>
                </div>` : `
                <div class="flex justify-end pt-2">
                    <button type="button" id="pullProxyModalCancel"
                        class="bg-white/10 text-white px-6 py-2 rounded-lg font-semibold hover:bg-white/20 transition-colors">
                        关闭
                    </button>
                </div>`}
            </form>
        </div>
    `;

    // 挂载到专属容器并激活鼠标事件
    const container = document.getElementById('pull-proxy-modal-container');
    if (container) {
        container.style.pointerEvents = 'auto';
        container.appendChild(wrapper);
    } else {
        // 降级：直接挂到 body（fixed 定位）
        wrapper.style.position = 'fixed';
        wrapper.style.zIndex = '9999';
        document.body.appendChild(wrapper);
    }

    // 填充初始自定义参数
    Object.entries(initialCustomParams).forEach(([k, v]) => {
        addCustomParamRow(k, v, readOnly);
    });

    // ---- 事件绑定 ----
    const closeModal = () => {
        wrapper.remove();
        const c = document.getElementById('pull-proxy-modal-container');
        if (c) c.style.pointerEvents = 'none';
    };

    wrapper.addEventListener('click', e => { if (e.target === wrapper) closeModal(); });
    document.getElementById('pullProxyModalClose').addEventListener('click', closeModal);
    const cancelBtn = document.getElementById('pullProxyModalCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (!readOnly) {
        document.getElementById('loadDefaultProtocolBtn').addEventListener('click', loadDefaultProtocolParams);
        document.getElementById('loadPresetProtocolBtn').addEventListener('click', loadPresetProtocolParams);
        document.getElementById('clearProtocolBtn').addEventListener('click', clearProtocolParams);
        document.getElementById('addCustomParamBtn').addEventListener('click', () => addCustomParamRow());

        document.getElementById('pullProxyForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            await submitAddPullProxy(closeModal);
        });
    }
}

// 生成开关型 select HTML
function buildProtocolToggle(label, id, currentValue, disabledAttr, inputCls) {
    const sel0 = currentValue === '0' ? 'selected' : '';
    const sel1 = currentValue === '1' ? 'selected' : '';
    const selDef = (!currentValue) ? 'selected' : '';
    return `
        <div>
            <label class="block text-white/80 text-sm font-semibold mb-1">${label}</label>
            <select id="${id}" ${disabledAttr} class="${inputCls}" style="color:white;">
                <option value="" ${selDef}>默认</option>
                <option value="1" ${sel1}>开启</option>
                <option value="0" ${sel0}>关闭</option>
            </select>
        </div>
    `;
}

// ==================== 表单提交 ====================

async function submitAddPullProxy(closeModal) {
    const url     = document.getElementById('pullUrl').value.trim();
    const vhost   = document.getElementById('pullVhost').value.trim() || '__defaultVhost__';
    const app     = document.getElementById('pullApp').value.trim();
    const stream  = document.getElementById('pullStream').value.trim();

    if (!url || !app || !stream) {
        showToast('拉流地址、应用名、流ID 不能为空', 'error');
        return;
    }

    // 收集转协议参数（非空才放入）
    const protocolMap = {
        enable_hls:        'enableHls',
        enable_hls_fmp4:   'enableHlsFmp4',
        enable_mp4:        'enableMp4',
        enable_rtsp:       'enableRtsp',
        enable_rtmp:       'enableRtmp',
        enable_ts:         'enableTs',
        enable_fmp4:       'enableFmp4',
        enable_audio:      'enableAudio',
        add_mute_audio:    'addMuteAudio',
        auto_close:        'autoClose',
        hls_demand:        'hlsDemand',
        rtsp_demand:       'rtspDemand',
        rtmp_demand:       'rtmpDemand',
        ts_demand:         'tsDemand',
        fmp4_demand:       'fmp4Demand',
        mp4_as_player:     'mp4AsPlayer',
        modify_stamp:      'modifyStamp',
        mp4_max_second:    'mp4MaxSecond',
        mp4_save_path:     'mp4SavePath',
        hls_save_path:     'hlsSavePath',
        continue_push_ms:  'continuePushMs',
    };
    const protocolParams = {};
    Object.entries(protocolMap).forEach(([apiKey, domId]) => {
        const el = document.getElementById(domId);
        if (el && el.value !== '') protocolParams[apiKey] = el.value;
    });

    // 自定义参数
    const customParams = {};
    document.querySelectorAll('#customParamsContainer .custom-param-row').forEach(row => {
        const k = row.querySelector('.custom-param-key').value.trim();
        const v = row.querySelector('.custom-param-value').value.trim();
        if (k) customParams[k] = v;
    });

    // 其他 ZLM 参数
    const retryCount  = document.getElementById('retryCount').value;
    const timeoutSec  = document.getElementById('timeoutSec').value;
    const rtpType     = document.getElementById('rtpType').value;
    const schema      = document.getElementById('pullSchema').value;
    const onDemand    = document.getElementById('onDemand').value;  // "0" or "1"
    if (retryCount !== '') customParams['retry_count'] = retryCount;
    if (timeoutSec !== '') customParams['timeout_sec'] = timeoutSec;
    if (rtpType    !== '') customParams['rtp_type']    = rtpType;
    if (schema     !== '') customParams['schema']      = schema;

    const formData = {
        url,
        vhost,
        app,
        stream,
        on_demand: onDemand,
        protocol_params: JSON.stringify(protocolParams),
        custom_params:   JSON.stringify(customParams),
    };

    // 按钮状态
    const submitBtn = document.querySelector('#pullProxyForm button[type="submit"]');
    const origText  = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>提交中...';
    }

    try {
        const result = await Api.addStreamProxy(formData);
        if (result.code === 0) {
            showToast('添加成功', 'success');
            closeModal();
            loadPullProxyList();
        } else {
            showToast('添加失败: ' + (result.msg || '未知错误'), 'error');
        }
    } catch (error) {
        showToast('添加失败: ' + error.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
        }
    }
}

// ==================== 参数辅助函数 ====================

function addCustomParamRow(key = '', value = '', readOnly = false) {
    const container = document.getElementById('customParamsContainer');
    if (!container) return;
    const disabledAttr = readOnly ? 'disabled' : '';
    const row = document.createElement('div');
    row.className = 'custom-param-row flex space-x-2';
    row.innerHTML = `
        <input type="text" ${disabledAttr}
            class="custom-param-key flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            placeholder="参数名 (如 retry_count)" value="${key}">
        <input type="text" ${disabledAttr}
            class="custom-param-value flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            placeholder="参数值" value="${value}">
        ${!readOnly ? `<button type="button"
            class="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg hover:bg-red-500/30 transition-colors flex-shrink-0"
            onclick="this.parentElement.remove()">
            <i class="fa fa-times"></i>
        </button>` : ''}
    `;
    container.appendChild(row);
}

async function loadDefaultProtocolParams() {
    // dom id  <-->  protocol.xxx 字段名映射
    const fieldMap = {
        modifyStamp:   'modify_stamp',
        enableAudio:   'enable_audio',
        addMuteAudio:  'add_mute_audio',
        autoClose:     'auto_close',
        enableHls:     'enable_hls',
        enableHlsFmp4: 'enable_hls_fmp4',
        enableMp4:     'enable_mp4',
        enableRtsp:    'enable_rtsp',
        enableRtmp:    'enable_rtmp',
        enableTs:      'enable_ts',
        enableFmp4:    'enable_fmp4',
        hlsDemand:     'hls_demand',
        rtspDemand:    'rtsp_demand',
        rtmpDemand:    'rtmp_demand',
        tsDemand:      'ts_demand',
        fmp4Demand:    'fmp4_demand',
        mp4AsPlayer:   'mp4_as_player',
        mp4MaxSecond:  'mp4_max_second',
        mp4SavePath:   'mp4_save_path',
        hlsSavePath:   'hls_save_path',
        continuePushMs:'continue_push_ms',
    };

    try {
        const result = await Api.getServerConfig();
        if (result.code === 0 && result.data && result.data.length > 0) {
            const serverConfig = result.data[0] || {};
            let applied = 0;
            Object.entries(fieldMap).forEach(([domId, configKey]) => {
                const fullKey = `protocol.${configKey}`;
                const el = document.getElementById(domId);
                if (el && serverConfig[fullKey] !== undefined && serverConfig[fullKey] !== null) {
                    el.value = String(serverConfig[fullKey]);
                    applied++;
                }
            });
            showToast(`已从服务器加载 ${applied} 个默认转协议参数`, 'success');
        } else {
            showToast('获取服务器配置失败: ' + (result.msg || '未知错误'), 'error');
        }
    } catch (e) {
        showToast('获取服务器配置失败: ' + e.message, 'error');
    }
}

function clearProtocolParams() {
    const ids = [
        'modifyStamp', 'enableAudio', 'addMuteAudio', 'autoClose',
        'enableHls', 'enableHlsFmp4', 'enableMp4', 'enableRtsp', 'enableRtmp',
        'enableTs', 'enableFmp4', 'hlsDemand', 'rtspDemand', 'rtmpDemand',
        'tsDemand', 'fmp4Demand', 'mp4AsPlayer', 'mp4MaxSecond', 'mp4SavePath',
        'hlsSavePath', 'continuePushMs',
    ];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    showToast('转协议参数已清空', 'info');
}

async function loadPresetProtocolParams() {
    try {
        const result = await Api.getProtocolOptionsList();
        if (result.code !== 0 || !result.data || result.data.length === 0) {
            showToast('暂无可用预设，请先在「协议配置」中添加', 'warning');
            return;
        }
        const presetList = result.data;

        const presetModal = document.createElement('div');
        presetModal.id = 'presetPickerModal';
        presetModal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
        presetModal.innerHTML = `
            <div class="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-white/20" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white">选择协议预设</h3>
                    <button onclick="document.getElementById('presetPickerModal').remove()" class="text-white/60 hover:text-white">
                        <i class="fa fa-times text-2xl"></i>
                    </button>
                </div>
                <select id="presetSelect" class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">-- 请选择预设 --</option>
                    ${presetList.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <div class="flex justify-end space-x-3">
                    <button onclick="document.getElementById('presetPickerModal').remove()"
                        class="bg-white/10 text-white px-5 py-2 rounded-lg font-semibold hover:bg-white/20 transition-colors">取消</button>
                    <button onclick="applyPreset()"
                        class="bg-gradient-primary text-white px-5 py-2 rounded-lg font-semibold hover:shadow-neon transition-all duration-300">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(presetModal);
        presetModal.addEventListener('click', e => { if (e.target === presetModal) presetModal.remove(); });
    } catch (e) {
        showToast('获取预设列表失败: ' + e.message, 'error');
    }
}

async function applyPreset() {
    const presetId = document.getElementById('presetSelect').value;
    if (!presetId) { showToast('请先选择一个预设', 'warning'); return; }
    try {
        const result = await Api.getProtocolOptions(parseInt(presetId));
        if (result.code === 0 && result.data) {
            const p = result.data;
            const fieldMap = {
                modify_stamp:     'modifyStamp',
                enable_audio:     'enableAudio',
                add_mute_audio:   'addMuteAudio',
                auto_close:       'autoClose',
                enable_hls:       'enableHls',
                enable_hls_fmp4:  'enableHlsFmp4',
                enable_mp4:       'enableMp4',
                enable_rtsp:      'enableRtsp',
                enable_rtmp:      'enableRtmp',
                enable_ts:        'enableTs',
                enable_fmp4:      'enableFmp4',
                hls_demand:       'hlsDemand',
                rtsp_demand:      'rtspDemand',
                rtmp_demand:      'rtmpDemand',
                ts_demand:        'tsDemand',
                fmp4_demand:      'fmp4Demand',
                mp4_as_player:    'mp4AsPlayer',
                mp4_max_second:   'mp4MaxSecond',
                mp4_save_path:    'mp4SavePath',
                hls_save_path:    'hlsSavePath',
                continue_push_ms: 'continuePushMs',
            };
            Object.entries(fieldMap).forEach(([apiKey, domId]) => {
                const el = document.getElementById(domId);
                if (el && p[apiKey] !== null && p[apiKey] !== undefined) el.value = p[apiKey];
            });
            document.getElementById('presetPickerModal').remove();
            showToast(`已加载预设「${p.name}」`, 'success');
        } else {
            showToast('获取预设详情失败: ' + (result.msg || ''), 'error');
        }
    } catch (e) {
        showToast('加载预设失败: ' + e.message, 'error');
    }
}

// ==================== 删除 ====================

async function deletePullProxy(vhost, app, stream, dbId) {
    showConfirmModal(
        '确认删除拉流代理',
        `确定要删除 <b>${app}/${stream}</b> 的拉流代理吗？<br>此操作将同时从 ZLMediaKit 和数据库中移除。`,
        async function () {
            try {
                const result = await Api.delStreamProxy(dbId);
                if (result.code === 0) {
                    showToast('删除成功', 'success');
                    loadPullProxyList();
                } else {
                    showToast('删除失败: ' + (result.msg || '未知错误'), 'error');
                }
            } catch (error) {
                showToast('删除失败: ' + error.message, 'error');
            }
        }
    );
}

// ==================== 页面清理 ====================

function cleanupPullProxyPage() {
    const wrapper = document.getElementById('pullProxyModalWrapper');
    if (wrapper) wrapper.remove();
    const container = document.getElementById('pull-proxy-modal-container');
    if (container) {
        container.innerHTML = '';
        container.style.pointerEvents = 'none';
    }
}
