function initProtocolOptionsEvents() {
    const addButton = document.getElementById('addProtocolOption');
    if (addButton) {
        addButton.removeEventListener('click', openAddModal);
        addButton.addEventListener('click', openAddModal);
    }
}

async function loadProtocolOptions() {
    initProtocolOptionsEvents();
    
    const tbody = document.getElementById('protocolOptionsTableBody');
    
    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="p-10 text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
                <span class="text-white/60 font-semibold">加载中...</span>
            </td>
        </tr>
    `;
    
    try {
        const result = await Api.getProtocolOptionsList();
        
        if (result.code === 0) {
            const data = result.data || [];
            
            if (data.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="p-10 text-center text-white/60 font-semibold">
                            暂无协议配置
                        </td>
                    </tr>
                `;
                return;
            }
            
            let html = '';
            data.forEach(option => {
                html += `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td class="p-4 text-white">${option.id}</td>
                        <td class="p-4 text-white">${option.name}</td>
                        <td class="p-4 text-white">${option.created_at || '-'}</td>
                        <td class="p-4">
                            <button class="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors mr-2" onclick="editProtocolOption(${option.id})">
                                <i class="fa fa-edit mr-1"></i>编辑
                            </button>
                            <button class="bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:shadow-neon transition-colors" onclick="deleteProtocolOption(${option.id}, '${option.name}')">
                                <i class="fa fa-trash mr-1"></i>删除
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="p-10 text-center text-white/60 font-semibold">
                        加载失败: ${result.msg || '未知错误'}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-10 text-center text-white/60 font-semibold">
                    网络错误: ${error.message}
                </td>
            </tr>
        `;
    }
}

async function openAddModal() {
    showProtocolOptionsModal('新增协议预设', null, {});
}

function editProtocolOption(id) {
    // 同时获取预设详情和服务器默认配置，供"加载默认"按钮使用
    Promise.all([
        Api.getProtocolOptions(id),
        Api.getServerConfig(),
    ]).then(([detailResult, configResult]) => {
        if (detailResult.code !== 0) {
            showToast('获取配置失败: ' + (detailResult.msg || '未知错误'), 'error');
            return;
        }
        const serverConfig = {};
        if (configResult.code === 0 && configResult.data && configResult.data.length > 0) {
            for (const [key, value] of Object.entries(configResult.data[0] || {})) {
                if (key.startsWith('protocol.')) {
                    serverConfig[key.substring('protocol.'.length)] = value;
                }
            }
        }
        showProtocolOptionsModal('编辑协议预设', detailResult.data, serverConfig);
    }).catch(error => {
        showToast('获取配置失败: ' + error.message, 'error');
    });
}

function showProtocolOptionsModal(title, data, serverConfig = {}) {
    const modal = document.createElement('div');
    modal.className = 'absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto';
    
    const getValue = (key, defaultValue = '') => {
        if (data && data[key] !== undefined) {
            return data[key];
        }
        if (serverConfig && serverConfig[key] !== undefined) {
            return serverConfig[key];
        }
        return defaultValue;
    };
    
    const iCls = 'w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary';
    const buildToggle = (label, id, val) => `
        <div>
            <label class="block text-white font-semibold mb-2">${label}</label>
            <select id="${id}" class="${iCls}" style="color:white;">
                <option value="" ${!val ? 'selected' : ''}>默认</option>
                <option value="1" ${val === '1' ? 'selected' : ''}>1 - 开启</option>
                <option value="0" ${val === '0' ? 'selected' : ''}>0 - 关闭</option>
            </select>
        </div>`;

    modal.innerHTML = `
        <div class="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 border border-white/20 max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-white">${title}</h3>
                <div class="flex items-center gap-2">
                    <button type="button" id="poLoadDefaultBtn"
                        class="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/20 transition-colors">
                        <i class="fa fa-magic mr-1"></i>加载默认
                    </button>
                    <button type="button" id="poClearBtn"
                        class="bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition-colors">
                        <i class="fa fa-eraser mr-1"></i>清空
                    </button>
                    <button class="text-white/60 hover:text-white ml-1" onclick="this.closest('.absolute').remove()">
                        <i class="fa fa-times text-2xl"></i>
                    </button>
                </div>
            </div>
            <form id="protocolOptionsForm" class="space-y-6">
                <input type="hidden" id="optionId" value="${data ? data.id : ''}">

                <!-- 通用配置 -->
                <div class="bg-white/5 rounded-lg p-4">
                    <h4 class="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-2">通用配置</h4>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-white font-semibold mb-2">预设名称(name) *</label>
                            <input type="text" id="optionName" required value="${data ? data.name : ''}" class="${iCls}">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-white font-semibold mb-2">时间戳覆盖(modify_stamp)</label>
                                <select id="modifyStamp" class="${iCls}" style="color:white;">
                                    <option value="" ${!getValue('modify_stamp') ? 'selected' : ''}>默认</option>
                                    <option value="0" ${getValue('modify_stamp') === '0' ? 'selected' : ''}>0 - 绝对时间戳</option>
                                    <option value="1" ${getValue('modify_stamp') === '1' ? 'selected' : ''}>1 - 系统时间戳</option>
                                    <option value="2" ${getValue('modify_stamp') === '2' ? 'selected' : ''}>2 - 相对时间戳</option>
                                </select>
                            </div>
                            ${buildToggle('开启音频(enable_audio)', 'enableAudio', getValue('enable_audio'))}
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            ${buildToggle('添加静音音频(add_mute_audio)', 'addMuteAudio', getValue('add_mute_audio'))}
                            ${buildToggle('自动关闭(auto_close)', 'autoClose', getValue('auto_close'))}
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-white font-semibold mb-2">断连续推延时(continue_push_ms，毫秒)</label>
                                <input type="number" id="continuePushMs" value="${getValue('continue_push_ms')}" placeholder="15000" class="${iCls}">
                            </div>
                            <div>
                                <label class="block text-white font-semibold mb-2">平滑发送间隔(paced_sender_ms，毫秒)</label>
                                <input type="number" id="pacedSenderMs" value="${getValue('paced_sender_ms')}" placeholder="0" class="${iCls}">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 转协议开关 -->
                <div class="bg-white/5 rounded-lg p-4">
                    <h4 class="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-2">转协议开关</h4>
                    <div class="grid grid-cols-3 gap-4">
                        ${buildToggle('开启HLS(enable_hls)', 'enableHls', getValue('enable_hls'))}
                        ${buildToggle('开启HLS-FMP4(enable_hls_fmp4)', 'enableHlsFmp4', getValue('enable_hls_fmp4'))}
                        ${buildToggle('开启MP4录制(enable_mp4)', 'enableMp4', getValue('enable_mp4'))}
                        ${buildToggle('开启RTSP(enable_rtsp)', 'enableRtsp', getValue('enable_rtsp'))}
                        ${buildToggle('开启RTMP/FLV(enable_rtmp)', 'enableRtmp', getValue('enable_rtmp'))}
                        ${buildToggle('开启HTTP-TS(enable_ts)', 'enableTs', getValue('enable_ts'))}
                        ${buildToggle('开启FMP4(enable_fmp4)', 'enableFmp4', getValue('enable_fmp4'))}
                    </div>
                </div>

                <!-- 按需转协议开关 -->
                <div class="bg-white/5 rounded-lg p-4">
                    <h4 class="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-2">按需转协议开关</h4>
                    <div class="grid grid-cols-3 gap-4">
                        ${buildToggle('HLS按需(hls_demand)', 'hlsDemand', getValue('hls_demand'))}
                        ${buildToggle('RTSP按需(rtsp_demand)', 'rtspDemand', getValue('rtsp_demand'))}
                        ${buildToggle('RTMP按需(rtmp_demand)', 'rtmpDemand', getValue('rtmp_demand'))}
                        ${buildToggle('TS按需(ts_demand)', 'tsDemand', getValue('ts_demand'))}
                        ${buildToggle('FMP4按需(fmp4_demand)', 'fmp4Demand', getValue('fmp4_demand'))}
                    </div>
                </div>

                <!-- 录制配置 -->
                <div class="bg-white/5 rounded-lg p-4">
                    <h4 class="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-2">录制配置</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${buildToggle('MP4计入观看数(mp4_as_player)', 'mp4AsPlayer', getValue('mp4_as_player'))}
                        <div>
                            <label class="block text-white font-semibold mb-2">MP4切片大小(mp4_max_second，秒)</label>
                            <input type="number" id="mp4MaxSecond" value="${getValue('mp4_max_second')}" placeholder="3600" class="${iCls}">
                        </div>
                        <div>
                            <label class="block text-white font-semibold mb-2">MP4保存路径(mp4_save_path)</label>
                            <input type="text" id="mp4SavePath" value="${getValue('mp4_save_path')}" placeholder="./www" class="${iCls}">
                        </div>
                        <div>
                            <label class="block text-white font-semibold mb-2">HLS保存路径(hls_save_path)</label>
                            <input type="text" id="hlsSavePath" value="${getValue('hls_save_path')}" placeholder="./www" class="${iCls}">
                        </div>
                    </div>
                </div>

                <div class="flex justify-end space-x-4 mt-6">
                    <button type="button" class="bg-white/10 text-white px-6 py-2 rounded-lg font-semibold hover:bg-white/20 transition-colors" onclick="this.closest('.absolute').remove()">
                        取消
                    </button>
                    <button type="submit" class="bg-gradient-primary text-white px-6 py-2 rounded-lg font-semibold hover:shadow-neon transition-all duration-300">
                        保存
                    </button>
                </div>
            </form>
        </div>
    `;
    const container = document.getElementById('protocol-options-modal-container');
    if (container) {
        container.appendChild(modal);
    } else {
        document.body.appendChild(modal);
    }
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // ---- 字段 id 列表（用于加载默认 / 清空）----
    const _fieldMap = {
        modifyStamp:    'modify_stamp',
        enableAudio:    'enable_audio',
        addMuteAudio:   'add_mute_audio',
        autoClose:      'auto_close',
        continuePushMs: 'continue_push_ms',
        pacedSenderMs:  'paced_sender_ms',
        enableHls:      'enable_hls',
        enableHlsFmp4:  'enable_hls_fmp4',
        enableMp4:      'enable_mp4',
        enableRtsp:     'enable_rtsp',
        enableRtmp:     'enable_rtmp',
        enableTs:       'enable_ts',
        enableFmp4:     'enable_fmp4',
        hlsDemand:      'hls_demand',
        rtspDemand:     'rtsp_demand',
        rtmpDemand:     'rtmp_demand',
        tsDemand:       'ts_demand',
        fmp4Demand:     'fmp4_demand',
        mp4AsPlayer:    'mp4_as_player',
        mp4MaxSecond:   'mp4_max_second',
        mp4SavePath:    'mp4_save_path',
        hlsSavePath:    'hls_save_path',
    };

    // 加载默认：从 serverConfig 填入各字段
    document.getElementById('poLoadDefaultBtn').addEventListener('click', function () {
        let applied = 0;
        Object.entries(_fieldMap).forEach(([domId, cfgKey]) => {
            const el = document.getElementById(domId);
            if (el && serverConfig[cfgKey] !== undefined && serverConfig[cfgKey] !== null) {
                el.value = String(serverConfig[cfgKey]);
                applied++;
            }
        });
        if (applied > 0) {
            showToast(`已加载 ${applied} 个服务器默认值`, 'success');
        } else {
            showToast('未获取到服务器默认值，请确认已连接服务器', 'warning');
        }
    });

    // 清空：将所有字段（除名称外）重置为空
    document.getElementById('poClearBtn').addEventListener('click', function () {
        Object.keys(_fieldMap).forEach(domId => {
            const el = document.getElementById(domId);
            if (el) el.value = '';
        });
        showToast('已清空所有协议参数', 'info');
    });
    
    document.getElementById('protocolOptionsForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const id = document.getElementById('optionId').value;
        const name = document.getElementById('optionName').value;
        
        if (!name) {
            showToast('预设名称不能为空', 'error');
            return;
        }
        
        const formData = {
            name: name,
            modify_stamp: document.getElementById('modifyStamp').value,
            enable_audio: document.getElementById('enableAudio').value,
            add_mute_audio: document.getElementById('addMuteAudio').value,
            auto_close: document.getElementById('autoClose').value,
            continue_push_ms: document.getElementById('continuePushMs').value,
            paced_sender_ms: document.getElementById('pacedSenderMs').value,
            enable_hls: document.getElementById('enableHls').value,
            enable_hls_fmp4: document.getElementById('enableHlsFmp4').value,
            enable_mp4: document.getElementById('enableMp4').value,
            enable_rtsp: document.getElementById('enableRtsp').value,
            enable_rtmp: document.getElementById('enableRtmp').value,
            enable_ts: document.getElementById('enableTs').value,
            enable_fmp4: document.getElementById('enableFmp4').value,
            mp4_as_player: document.getElementById('mp4AsPlayer').value,
            mp4_max_second: document.getElementById('mp4MaxSecond').value,
            mp4_save_path: document.getElementById('mp4SavePath').value,
            hls_save_path: document.getElementById('hlsSavePath').value,
            hls_demand: document.getElementById('hlsDemand').value,
            rtsp_demand: document.getElementById('rtspDemand').value,
            rtmp_demand: document.getElementById('rtmpDemand').value,
            ts_demand: document.getElementById('tsDemand').value,
            fmp4_demand: document.getElementById('fmp4Demand').value
        };
        
        try {
            let result;
            if (id) {
                formData.id = id;
                result = await Api.updateProtocolOptions(formData);
            } else {
                result = await Api.addProtocolOptions(formData);
            }
            
            if (result.code === 0) {
                showToast(id ? '修改成功' : '添加成功', 'success');
                modal.remove();
                loadProtocolOptions();
            } else {
                showToast((id ? '修改失败' : '添加失败') + ': ' + (result.msg || '未知错误'), 'error');
            }
        } catch (error) {
            showToast((id ? '修改失败' : '添加失败') + ': ' + error.message, 'error');
        }
    });
}

async function deleteProtocolOption(id, name) {
    showConfirmModal(
        '确认删除',
        `确定要删除协议预设 "${name}" 吗？`,
        async function() {
            try {
                const result = await Api.deleteProtocolOptions(id);
                
                if (result.code === 0) {
                    showToast('删除成功', 'success');
                    loadProtocolOptions();
                } else {
                    showToast('删除失败: ' + (result.msg || '未知错误'), 'error');
                }
            } catch (error) {
                showToast('删除失败: ' + error.message, 'error');
            }
        }
    );
}
