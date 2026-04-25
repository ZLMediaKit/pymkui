/**
 * plugins.js — 插件管理页面逻辑
 * 数据结构（新版）：
 *   _bindings = [
 *     { event_type: "on_publish", bindings: [{id, plugin_name, params, priority, enabled}, ...] },
 *     ...
 *   ]
 */

// ── 状态 ────────────────────────────────────────────────────────────
let _allPlugins   = [];   // 已加载插件列表
let _allEvents    = [];   // 支持的事件类型
let _bindings     = [];   // 事件绑定配置（新结构）
let _editEvent    = null; // 当前编辑的事件类型
let _dragSource   = null; // 拖拽源元素
// 编辑绑定弹窗中每个已选插件的临时 params（key = plugin_name）
let _editParams   = {};
// 参数弹窗状态
let _paramsPlugin = null; // 当前编辑参数的 plugin_name

// ── API 封装 ──────────────────────────────────────────────────────
async function apiGet(path) {
    return await Api.request(path, { method: 'GET' });
}
async function apiPost(path, body) {
    return await Api.request(path, { method: 'POST', body });
}

// ── 初始化 ──────────────────────────────────────────────────────────
async function initPluginsPage() {
    await Promise.all([loadPluginList(), loadEventBindings()]);
    document.getElementById('reloadPluginsBtn')
        .addEventListener('click', reloadPlugins);
}

// ── 加载插件列表 ──────────────────────────────────────────────────────
async function loadPluginList() {
    try {
        const res = await apiGet('/index/pyapi/plugin/list');
        _allPlugins = res.data || [];
        renderPluginList();
    } catch (e) {
        document.getElementById('pluginList').innerHTML =
            `<div class="col-span-full text-red-400 py-6 text-center"><i class="fa fa-exclamation-circle mr-2"></i>${e.message}</div>`;
    }
}

function renderPluginList() {
    const container = document.getElementById('pluginList');
    document.getElementById('pluginCount').textContent = `共 ${_allPlugins.length} 个`;

    if (!_allPlugins.length) {
        container.innerHTML = `<div class="col-span-full text-white/40 py-8 text-center">
            <i class="fa fa-inbox text-3xl mb-2 block"></i>
            暂无插件，请将插件 .py 文件放入 backend/plugins/ 目录后热加载
        </div>`;
        return;
    }

    container.innerHTML = _allPlugins.map(p => {
        const typeBadge = p.interruptible
            ? `<span class="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 ml-1 font-mono">拦截型</span>`
            : `<span class="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 ml-1 font-mono">监听型</span>`;
        return `
        <div class="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-primary/50 transition-colors">
            <div class="flex items-start justify-between mb-2 gap-2 flex-wrap">
                <span class="font-bold text-white truncate">${escHtml(p.name)}</span>
                <div class="flex items-center gap-1 shrink-0">
                    <span class="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono">${escHtml(p.type)}</span>
                    ${typeBadge}
                </div>
            </div>
            <p class="text-white/50 text-sm mb-2 line-clamp-2">${escHtml(p.description)}</p>
            <span class="text-white/30 text-xs">v${escHtml(p.version)}</span>
        </div>`;
    }).join('');
}

// ── 加载事件绑定 ──────────────────────────────────────────────────────
async function loadEventBindings() {
    try {
        const [evtRes, bindRes] = await Promise.all([
            apiGet('/index/pyapi/plugin/events'),
            apiGet('/index/pyapi/plugin/bindings'),
        ]);
        _allEvents = evtRes.data || [];
        _bindings  = bindRes.data || [];
        renderEventBindings();
    } catch (e) {
        document.getElementById('eventBindingsTable').innerHTML =
            `<tr><td colspan="3" class="text-red-400 p-6 text-center">${e.message}</td></tr>`;
    }
}

function renderEventBindings() {
    const tbody = document.getElementById('eventBindingsTable');
    if (!_bindings.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-white/40 p-8 text-center">暂无数据</td></tr>`;
        return;
    }

    tbody.innerHTML = _bindings.map(row => {
        const bindings = row.bindings || [];
        const hasBind  = bindings.length > 0;

        const pills = hasBind
            ? bindings.map(b => {
                const plugin = _allPlugins.find(p => p.name === b.plugin_name);
                const typeTag = plugin
                    ? (plugin.interruptible
                        ? `<i class="fa fa-bolt text-red-400 ml-1 text-[10px]" title="拦截型：消费后终止后续插件"></i>`
                        : `<i class="fa fa-eye text-green-400 ml-1 text-[10px]" title="监听型：不阻断后续插件"></i>`)
                    : '';
                const hasParams = b.params && Object.keys(b.params).length > 0;
                const paramTag  = hasParams
                    ? `<i class="fa fa-cog text-yellow-400 ml-1 text-[10px]" title="已配置参数"></i>`
                    : '';
                const enabledCls = b.enabled ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/40 line-through';
                return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono mr-1 mb-1 ${enabledCls}">
                    ${escHtml(b.plugin_name)}${typeTag}${paramTag}
                </span>`;
              }).join('')
            : `<span class="text-white/30 text-sm italic">未绑定</span>`;

        return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
            <td class="py-3 px-4 font-mono text-sm text-white/80">${escHtml(row.event_type)}</td>
            <td class="py-3 px-4 leading-loose">${pills}</td>
            <td class="py-3 px-4 whitespace-nowrap">
                <button onclick="openBindingModal('${escHtml(row.event_type)}')"
                    class="text-primary hover:text-white text-sm transition-colors mr-3">
                    <i class="fa fa-pencil mr-1"></i>编辑
                </button>
                ${hasBind ? `<button onclick="clearBinding('${escHtml(row.event_type)}')"
                    class="text-red-400 hover:text-white text-sm transition-colors">
                    <i class="fa fa-trash mr-1"></i>清除
                </button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// ── 热加载插件 ────────────────────────────────────────────────────────
async function reloadPlugins() {
    const btn = document.getElementById('reloadPluginsBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>加载中...';
    try {
        const res = await apiPost('/index/pyapi/plugin/reload', {});
        if (res.code === 0) {
            showToast(res.msg, 'success');
            await loadPluginList();
            await loadEventBindings();
        } else {
            showToast(res.msg || '热加载失败', 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-refresh mr-2"></i>热加载插件';
    }
}

// ── 编辑绑定弹窗 ───────────────────────────────────────────────────────
function openBindingModal(eventType) {
    _editEvent  = eventType;
    _editParams = {};

    document.getElementById('modalEventType').textContent = eventType;

    // 当前绑定
    const row      = _bindings.find(b => b.event_type === eventType) || {};
    const curBinds = row.bindings || [];
    const enabled  = curBinds.some(b => b.enabled) || curBinds.length === 0;
    document.getElementById('bindingEnabled').checked = enabled;

    // 初始化临时参数
    curBinds.forEach(b => { _editParams[b.plugin_name] = Object.assign({}, b.params || {}); });

    // 过滤类型匹配的插件
    const matched   = _allPlugins.filter(p => p.type === eventType);
    const selNames  = curBinds.map(b => b.plugin_name);
    const selected  = selNames.map(n => matched.find(p => p.name === n)).filter(Boolean);
    const available = matched.filter(p => !selNames.includes(p.name));

    renderDragList('selectedPlugins', selected, true);
    renderDragList('availablePlugins', available, false);

    document.getElementById('bindingModal').classList.remove('hidden');
}

function closeBindingModal() {
    document.getElementById('bindingModal').classList.add('hidden');
    _editEvent = null;
}

function renderDragList(containerId, plugins, showParamsBtn) {
    const el = document.getElementById(containerId);
    if (!plugins.length) {
        el.innerHTML = `<div class="text-white/30 text-xs text-center py-2 select-none pointer-events-none">
            ${containerId === 'selectedPlugins' ? '（拖入插件以绑定）' : '（无可用插件）'}
        </div>`;
        return;
    }
    el.innerHTML = plugins.map(p => {
        const typeBadge = p.interruptible !== undefined
            ? (p.interruptible
                ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">拦截</span>`
                : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">监听</span>`)
            : '';
        const paramsBtn = showParamsBtn
            ? `<button type="button" onclick="openParamsModal('${escHtml(p.name)}')"
                class="ml-auto shrink-0 text-yellow-400/70 hover:text-yellow-400 transition-colors text-xs"
                title="编辑绑定参数">
                <i class="fa fa-cog mr-1"></i>参数
               </button>`
            : '';
        return `
        <div class="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 cursor-grab select-none
            hover:bg-primary/20 transition-colors"
            draggable="true"
            data-plugin-name="${escHtml(p.name)}"
            data-plugin-type="${escHtml(p.type)}"
            data-plugin-interruptible="${p.interruptible ? 'true' : 'false'}"
            ondragstart="dragStart(event)"
            ondragend="dragEnd(event)"
            ondblclick="togglePluginBinding(this)">
            <i class="fa fa-grip-vertical text-white/30 text-xs shrink-0"></i>
            <span class="font-mono text-sm text-white font-semibold">${escHtml(p.name)}</span>
            ${typeBadge}
            <span class="text-white/40 text-xs truncate max-w-[140px]">${escHtml(p.description)}</span>
            ${paramsBtn}
        </div>`;
    }).join('');
}

// ── 双击切换绑定/解绑 ─────────────────────────────────────────────────
function togglePluginBinding(el) {
    const srcContainer = el.parentElement;
    const isSelected   = srcContainer.id === 'selectedPlugins';
    const targetId     = isSelected ? 'availablePlugins' : 'selectedPlugins';
    const target       = document.getElementById(targetId);

    srcContainer.removeChild(el);
    _refreshEmptyHint(srcContainer);

    if (targetId === 'selectedPlugins') {
        _addToSelected(el, target);
    } else {
        // 移回未绑定：移除参数按钮
        const btn = el.querySelector('button');
        if (btn) btn.remove();
        const placeholder = target.querySelector('.pointer-events-none');
        if (placeholder) placeholder.remove();
        target.appendChild(el);
    }
}

// ── 将插件元素加入"已绑定"列表 ──────────────────────────────────────
function _addToSelected(el, selectedContainer) {
    // 清除占位提示
    const placeholder = selectedContainer.querySelector('.pointer-events-none');
    if (placeholder) placeholder.remove();

    // 追加"参数"按钮
    if (!el.querySelector('button[data-params-btn]')) {
        const pName = el.dataset.pluginName;
        const btn   = document.createElement('button');
        btn.type      = 'button';
        btn.dataset.paramsBtn = '1';
        btn.className = 'ml-auto shrink-0 text-yellow-400/70 hover:text-yellow-400 transition-colors text-xs';
        btn.title     = '编辑绑定参数';
        btn.innerHTML = '<i class="fa fa-cog mr-1"></i>参数';
        btn.setAttribute('onclick', `openParamsModal('${pName}')`);
        el.appendChild(btn);
    }

    selectedContainer.appendChild(el);
    _refreshEmptyHint(document.getElementById('availablePlugins'));
}

// ── 拖拽排序 ──────────────────────────────────────────────────────────
function dragStart(e) {
    _dragSource = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.currentTarget.dataset.pluginName);
    e.currentTarget.classList.add('opacity-50');
}
function dragEnd(e) {
    e.currentTarget.classList.remove('opacity-50');
    _dragSource = null;
}
function dropPlugin(e, targetArea) {
    e.preventDefault();
    if (!_dragSource) return;

    const targetContainerId = targetArea === 'selected' ? 'selectedPlugins' : 'availablePlugins';
    const targetContainer   = document.getElementById(targetContainerId);
    const srcContainer      = _dragSource.parentElement;
    const isReorder         = srcContainer.id === targetContainerId;

    if (isReorder) {
        const overEl = e.target.closest('[data-plugin-name]');
        if (overEl && overEl !== _dragSource) {
            targetContainer.insertBefore(_dragSource, overEl);
        }
    } else {
        if (srcContainer && _dragSource.dataset.pluginName) {
            srcContainer.removeChild(_dragSource);
            _refreshEmptyHint(srcContainer);
        }

        // 移入 selectedPlugins 时走统一的独占清场逻辑
        if (targetContainerId === 'selectedPlugins') {
            _addToSelected(_dragSource, targetContainer);
        } else {
            // 移回 availablePlugins 时移除参数按钮
            const btn = _dragSource.querySelector('button[data-params-btn]');
            if (btn) btn.remove();
            const placeholder = targetContainer.querySelector('.pointer-events-none');
            if (placeholder) placeholder.remove();
            targetContainer.appendChild(_dragSource);
        }
    }
}
function _refreshEmptyHint(container) {
    // 先清除已有的占位提示，避免重复追加
    container.querySelectorAll('.pointer-events-none').forEach(el => el.remove());
    const items = container.querySelectorAll('[data-plugin-name]');
    if (!items.length) {
        const hint     = document.createElement('div');
        hint.className = 'text-white/30 text-xs text-center py-2 select-none pointer-events-none';
        hint.textContent = container.id === 'selectedPlugins' ? '（拖入插件以绑定）' : '（无可用插件）';
        container.appendChild(hint);
    }
}

// ── 保存绑定 ──────────────────────────────────────────────────────────
async function saveBinding() {
    if (!_editEvent) return;

    const selectedEls = document.getElementById('selectedPlugins')
        .querySelectorAll('[data-plugin-name]');
    const enabled = document.getElementById('bindingEnabled').checked ? 1 : 0;

    const bindings = Array.from(selectedEls).map(el => ({
        plugin_name: el.dataset.pluginName,
        params: _editParams[el.dataset.pluginName] || {},
    }));

    try {
        const res = await apiPost('/index/pyapi/plugin/bindings/save', {
            event_type: _editEvent,
            bindings,
            enabled,
        });
        if
 (res.code === 0) {
            showToast('保存成功', 'success');
            closeBindingModal();
            await loadEventBindings();
        } else {
            showToast(res.msg || '保存失败', 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ── 清除绑定 ──────────────────────────────────────────────────────────
async function clearBinding(eventType) {
    if (!confirm(`确定清除 "${eventType}" 的所有插件绑定？`)) return;
    try {
        const res = await apiPost('/index/pyapi/plugin/bindings/delete', { event_type: eventType });
        if (res.code === 0) {
            showToast('已清除', 'success');
            await loadEventBindings();
        } else {
            showToast(res.msg || '清除失败', 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ── 参数编辑弹窗 ───────────────────────────────────────────────────────
// 缓存协议配置列表
let _protocolOptionsList = null;

async function _loadProtocolOptionsList() {
    if (_protocolOptionsList) return _protocolOptionsList;
    try {
        const res = await apiGet('/index/pyapi/get_protocol_options_list');
        _protocolOptionsList = res.data || res.options || [];
    } catch (e) {
        _protocolOptionsList = [];
    }
    return _protocolOptionsList;
}

// protocol_option 字段分组（与协议预设界面保持一致）
const _PROTO_GROUPS = [
    {
        title: '通用配置',
        cols: 2,
        fields: [
            { key: 'modify_stamp',    id: 'po_modify_stamp',    label: '时间戳覆盖(modify_stamp)',        type: 'select', opts: [['0','0-绝对'],['1','1-系统'],['2','2-相对']] },
            { key: 'enable_audio',    id: 'po_enable_audio',    label: '开启音频(enable_audio)',          type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'add_mute_audio',  id: 'po_add_mute_audio',  label: '添加静音音频(add_mute_audio)',    type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'auto_close',      id: 'po_auto_close',      label: '自动关闭(auto_close)',            type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'paced_sender_ms', id: 'po_paced_sender_ms', label: '平滑发送间隔ms(paced_sender_ms)', type: 'number' },
        ],
    },
    {
        title: '转协议开关',
        cols: 3,
        fields: [
            { key: 'enable_hls',      id: 'po_enable_hls',      label: '开启HLS(enable_hls)',            type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'enable_hls_fmp4', id: 'po_enable_hls_fmp4', label: '开启HLS-FMP4(enable_hls_fmp4)',  type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'enable_mp4',      id: 'po_enable_mp4',      label: '开启MP4录制(enable_mp4)',         type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'enable_rtsp',     id: 'po_enable_rtsp',     label: '开启RTSP(enable_rtsp)',           type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'enable_rtmp',     id: 'po_enable_rtmp',     label: '开启RTMP/FLV(enable_rtmp)',       type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'enable_ts',       id: 'po_enable_ts',       label: '开启HTTP-TS(enable_ts)',          type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'enable_fmp4',     id: 'po_enable_fmp4',     label: '开启FMP4(enable_fmp4)',           type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
        ],
    },
    {
        title: '按需转协议开关',
        cols: 3,
        fields: [
            { key: 'hls_demand',  id: 'po_hls_demand',  label: 'HLS按需(hls_demand)',   type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'rtsp_demand', id: 'po_rtsp_demand', label: 'RTSP按需(rtsp_demand)',  type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'rtmp_demand', id: 'po_rtmp_demand', label: 'RTMP按需(rtmp_demand)',  type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'ts_demand',   id: 'po_ts_demand',   label: 'TS按需(ts_demand)',      type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'fmp4_demand', id: 'po_fmp4_demand', label: 'FMP4按需(fmp4_demand)',  type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
        ],
    },
    {
        title: '录制配置',
        cols: 2,
        fields: [
            { key: 'mp4_as_player',  id: 'po_mp4_as_player',  label: 'MP4计入观看数(mp4_as_player)', type: 'select', opts: [['1','1-开启'],['0','0-关闭']] },
            { key: 'mp4_max_second', id: 'po_mp4_max_second', label: 'MP4切片大小s(mp4_max_second)',  type: 'number' },
            { key: 'mp4_save_path',  id: 'po_mp4_save_path',  label: 'MP4保存路径(mp4_save_path)',    type: 'text'   },
            { key: 'hls_save_path',  id: 'po_hls_save_path',  label: 'HLS保存路径(hls_save_path)',    type: 'text'   },
        ],
    },
];
// 扁平化字段列表（供读值/遍历使用）
const _PROTO_FIELDS = _PROTO_GROUPS.flatMap(g => g.fields);

// 从协议配置表单 DOM 读取当前值（只收集非空字段）
function _readProtoFormValues() {
    const result = {};
    _PROTO_FIELDS.forEach(f => {
        const el = document.getElementById(f.id);
        if (el && el.value !== '') result[f.key] = el.value;
    });
    return result;
}

// 渲染 protocol_option 内嵌表单（分组布局，与协议预设界面一致）
function _renderProtoOptionForm(paramKey, currentVal) {
    const cur = (currentVal && typeof currentVal === 'object') ? currentVal : {};
    const sel = (k, v) => cur[k] !== undefined && String(cur[k]) === v ? 'selected' : '';
    const selEmpty = k => cur[k] === undefined || cur[k] === '' ? 'selected' : '';
    const inCls = 'w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50';
    const pk = escHtml(paramKey);

    const makeSelect = (f) => `
        <select id="${f.id}" class="${inCls}" style="color:white;" onchange="_syncProtoForm('${pk}')">
            <option value="" ${selEmpty(f.key)}>默认</option>
            ${f.opts.map(([v, l]) => `<option value="${v}" ${sel(f.key, v)}>${l}</option>`).join('')}
        </select>`;
    const makeInput = (f) => `
        <input type="${f.type}" id="${f.id}" value="${escHtml(String(cur[f.key] ?? ''))}" placeholder="默认"
            class="${inCls}" oninput="_syncProtoForm('${pk}')">`;

    const groupsHtml = _PROTO_GROUPS.map(g => {
        const colCls = `grid grid-cols-${g.cols} gap-2`;
        const fieldsHtml = g.fields.map(f => `
            <div>
                <label class="block text-white/60 text-[11px] mb-0.5">${f.label}</label>
                ${f.type === 'select' ? makeSelect(f) : makeInput(f)}
            </div>`).join('');
        return `
        <div class="bg-white/5 rounded-lg p-3">
            <div class="text-white/70 text-xs font-semibold mb-2 border-b border-white/10 pb-1">${g.title}</div>
            <div class="${colCls}">${fieldsHtml}</div>
        </div>`;
    }).join('');

    return `
    <div class="mt-2 border border-white/10 rounded-lg overflow-hidden">
        <!-- 工具栏 -->
        <div class="flex gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
            <button type="button" onclick="_poLoadDefault('${pk}')"
                class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 transition-colors">
                <i class="fa fa-magic mr-1"></i>加载默认
            </button>
            <button type="button" onclick="_poLoadPreset('${pk}')"
                class="text-xs px-2 py-1 rounded bg-primary/30 hover:bg-primary/50 text-white transition-colors">
                <i class="fa fa-list mr-1"></i>从预设加载
            </button>
            <button type="button" onclick="_poClear('${pk}')"
                class="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors">
                <i class="fa fa-eraser mr-1"></i>清空
            </button>
        </div>
        <!-- 分组内容 -->
        <div class="space-y-2 p-3">${groupsHtml}</div>
    </div>`;
}

// 表单任意字段变化后同步回 _editParams
function _syncProtoForm(paramKey) {
    if (!_editParams[_paramsPlugin]) _editParams[_paramsPlugin] = {};
    _editParams[_paramsPlugin][paramKey] = _readProtoFormValues();
}

// 加载默认（从服务器 protocol.* 配置）
async function _poLoadDefault(paramKey) {
    try {
        const result = await Api.getServerConfig();
        if (result.code === 0 && result.data && result.data.length > 0) {
            const cfg = result.data[0] || {};
            _PROTO_FIELDS.forEach(f => {
                const el = document.getElementById(f.id);
                const v = cfg[`protocol.${f.key}`];
                if (el && v !== undefined && v !== null) el.value = String(v);
            });
            _syncProtoForm(paramKey);
            showToast('已加载服务器默认协议配置', 'success');
        } else {
            showToast('获取服务器配置失败', 'error');
        }
    } catch (e) {
        showToast('加载失败: ' + e.message, 'error');
    }
}

// 从预设加载
async function _poLoadPreset(paramKey) {
    const list = await _loadProtocolOptionsList();
    if (!list || !list.length) {
        showToast('暂无可用预设，请先在「协议配置」中添加', 'warning');
        return;
    }
    // 弹出预设选择器
    let picker = document.getElementById('_poPresetPicker');
    if (picker) picker.remove();
    picker = document.createElement('div');
    picker.id = '_poPresetPicker';
    picker.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[60]';
    picker.innerHTML = `
        <div class="bg-gray-900 rounded-xl p-6 max-w-sm w-full mx-4 border border-white/20" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-base font-bold text-white">选择协议预设</h3>
                <button onclick="document.getElementById('_poPresetPicker').remove()" class="text-white/50 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <select id="_poPresetSelect" class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm mb-4 focus:outline-none">
                <option value="">-- 请选择预设 --</option>
                ${list.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
            </select>
            <div class="flex justify-end gap-3">
                <button onclick="document.getElementById('_poPresetPicker').remove()"
                    class="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">取消</button>
                <button onclick="_poApplyPreset('${escHtml(paramKey)}')"
                    class="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/80 transition-colors">确定</button>
            </div>
        </div>`;
    picker.addEventListener('click', e => { if (e.target === picker) picker.remove(); });
    document.body.appendChild(picker);
}

async function _poApplyPreset(paramKey) {
    const sel = document.getElementById('_poPresetSelect');
    if (!sel || !sel.value) { showToast('请先选择一个预设', 'warning'); return; }
    try {
        const res = await apiGet(`/index/pyapi/get_protocol_options?id=${sel.value}`);
        const p = res.data || res;
        if (!p) { showToast('获取预设详情失败', 'error'); return; }
        _PROTO_FIELDS.forEach(f => {
            const el = document.getElementById(f.id);
            if (el && p[f.key] !== undefined && p[f.key] !== null) el.value = String(p[f.key]);
        });
        _syncProtoForm(paramKey);
        document.getElementById('_poPresetPicker')?.remove();
        showToast('已从预设加载协议配置', 'success');
    } catch (e) {
        showToast('加载失败: ' + e.message, 'error');
    }
}

// 清空所有字段
function _poClear(paramKey) {
    _PROTO_FIELDS.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.value = '';
    });
    _syncProtoForm(paramKey);
    showToast('协议配置已清空', 'info');
}

async function openParamsModal(pluginName) {
    _paramsPlugin = pluginName;
    _paramsEvent  = _editEvent;
    document.getElementById('paramsPluginName').textContent = pluginName;
    document.getElementById('paramsEventType').textContent  = _editEvent || '';

    const plugin = _allPlugins.find(p => p.name === pluginName);
    const schema = plugin?.params_schema || {};
    if (!_editParams[pluginName]) _editParams[pluginName] = {};
    Object.entries(schema).forEach(([k, def]) => {
        if (!_editParams[pluginName].hasOwnProperty(k)) {
            _editParams[pluginName][k] = def.default ?? (def.type === 'protocol_option' ? {} : '');
        }
    });

    // 有 protocol_option 字段时预加载预设列表
    const hasProtoOpt = Object.values(schema).some(d => d.type === 'protocol_option');
    if (hasProtoOpt) await _loadProtocolOptionsList();

    renderParamsList();
    document.getElementById('paramsModal').classList.remove('hidden');
}

function closeParamsModal() {
    document.getElementById('paramsModal').classList.add('hidden');
    _paramsPlugin = null;
}

function renderParamsList() {
    const params    = _editParams[_paramsPlugin] || {};
    const container = document.getElementById('paramsList');
    const plugin    = _allPlugins.find(p => p.name === _paramsPlugin);
    const schema    = plugin?.params_schema || {};
    const keys      = Object.keys(schema);

    if (!keys.length) {
        container.innerHTML = `<div class="text-white/30 text-sm text-center py-4">此插件无可配置参数</div>`;
        return;
    }

    container.innerHTML = keys.map(k => {
        const def  = schema[k] || {};
        const val  = params.hasOwnProperty(k) ? params[k] : (def.default ?? '');
        const typeHint = def.type ? `<span class="text-white/20 text-[10px] ml-1">${escHtml(def.type)}</span>` : '';
        const desc = def.description
            ? `<div class="text-white/35 text-[11px] mt-0.5 leading-tight">${escHtml(def.description)}</div>`
            : '';

        let inputEl = '';
        if (def.type === 'protocol_option') {
            inputEl = _renderProtoOptionForm(k, val);
        } else {
            inputEl = `
            <input type="${def.type === 'int' ? 'number' : 'text'}"
                value="${escHtml(String(val ?? ''))}"
                class="w-full mt-1.5 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm
                    focus:outline-none focus:border-primary/50"
                onchange="updateParamValue('${escHtml(k)}', this.value)">`;
        }

        return `
        <div class="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <div class="flex items-center gap-1 mb-1">
                <span class="font-mono text-sm text-primary font-semibold">${escHtml(k)}</span>${typeHint}
            </div>
            ${desc}
            ${inputEl}
        </div>`;
    }).join('');
}

function updateParamValue(key, value) {
    if (!_editParams[_paramsPlugin]) _editParams[_paramsPlugin] = {};
    _editParams[_paramsPlugin][key] = value;
}

function saveParams() {
    showToast('参数已更新（保存绑定后生效）', 'success');
    closeParamsModal();
}

// ── 工具 ──────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
