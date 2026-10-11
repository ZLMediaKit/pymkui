# PyMKUI

PyMKUI 是一个为 [ZLMediaKit](https://github.com/ZLMediaKit/ZLMediaKit) 设计的现代化 Web 管理界面，基于 Python 插件机制深度集成，提供直观、美观的流媒体服务器管理功能。

> ⚠️ **项目正处于快速迭代期，数据库结构频繁变动。每次更新代码后请先删除旧数据库：**
>
> ```bash
> rm data/pymkui.db
> ```
>
> 数据库将在下次启动时自动重建。

---

## 功能特性

- 🎬 **视频流管理** — 查看、播放、停止流，获取截图；RTMP/TS 流由 h265web.js 播放
- 📡 **拉流代理** — 多备用地址、按需/立即模式、自动故障切换、持久化恢复、在线编辑
- 🔄 **转协议预设** — 保存多套转协议参数，拉流时一键加载，支持加载服务器默认值
- 👥 **观众列表** — 实时查看每路流的在线观众及连接信息
- 📊 **服务器监控** — CPU、内存、磁盘、网络实时图表
- ⚙️ **服务配置** — 在线读写 ZLMediaKit 配置项
- 🌐 **在线推流** — 基于 WHIP 协议的浏览器端直播推流
- 🔗 **网络连接** — 查看和管理当前所有 TCP/UDP 会话
- 📁 **录像管理** — 录像文件分流、分日期浏览，支持检索、在线播放与下载，自动按策略清理过期文件
- 🧩 **插件系统** — 内置可扩展 Python 事件钩子，支持用户自定义推流鉴权、录制回调、流上下线通知等业务逻辑，无需修改核心代码
- 🩺 **视频质量探针** — 对推拉流实时采样分析，输出码率、帧率、GOP、音视频交织性等多维度质量指标，以折线图与打点图直观呈现，快速定位卡顿、花屏等异常

---

## 快速开始（Docker 一键部署）

已集成到 ZLMediaKit Docker 镜像中，无需手动配置：

```bash
docker run -id \
  -p 1935:1935 \
  -p 80:80 \
  -p 443:443 \
  -p 554:554 \
  -p 10000:10000 \
  -p 10000:10000/udp \
  -p 8000:8000/udp \
  -p 9000:9000/udp \
  zlmediakit/zlmediakit:master_py
```

启动后浏览器访问 `http://<服务器IP>/`，输入 `api.secret` 密钥即可登录。

### 端口说明

| 端口  | 协议    | 用途               |
| ----- | ------- | ------------------ |
| 80    | TCP     | HTTP（前端 + API） |
| 443   | TCP     | HTTPS / WSS        |
| 1935  | TCP     | RTMP               |
| 554   | TCP     | RTSP               |
| 10000 | TCP/UDP | RTP                |
| 8000  | UDP     | WebRTC             |
| 9000  | UDP     | SRT                |

---

## 手动部署（源码方式）

适用于自行编译 ZLMediaKit 并希望使用 PyMKUI 的场景。

### 项目结构

```text
pymkui/
├─ frontend/          # 静态前端页面
├─ backend/           # Python 插件与 FastAPI 接口
│  ├─ mk_plugin.py    # ZLMediaKit Python 插件入口
│  ├─ py_http_api.py  # FastAPI HTTP API
│  ├─ database.py     # SQLite 数据库
│  ├─ config.py       # 路径配置
│  ├─ mk_logger.py    # 日志封装
│  └─ shared_loop.py  # asyncio 事件循环共享
├─ data/              # 运行时自动生成
│  └─ pymkui.db       # ⚠️ 升级时请删除
└─ README.md
```

### 步骤 1：安装 Python 依赖

> 需要 Python 3.10+

```bash
cd pymkui/backend
pip install -r requirements.txt
```

<details>
<summary>conda / venv 方式</summary>

```bash
# conda
conda create -n pymkui python=3.12 && conda activate pymkui
pip install -r requirements.txt

# venv (Linux/Mac)
python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# venv (Windows)
python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
```

</details>

### 步骤 2：编译 ZLMediaKit 时开启 Python 支持

```bash
# 安装 Python 相关依赖
apt-get update && apt-get install -y python3 python3-dev python3-pip
# cmake时指定开启python相关特性
cmake .. -DENABLE_PYTHON=ON
```

### 步骤 3：修改 `config.ini`

```ini
[python]
plugin=mk_plugin

[http]
rootPath=/path/to/pymkui/frontend
```

### 步骤 4：让 ZLMediaKit 找到 backend 模块

```bash
# Linux/Mac
export PYTHONPATH=/path/to/pymkui/backend:$PYTHONPATH

# Windows
set PYTHONPATH=C:\pymkui\backend;%PYTHONPATH%
```

### 步骤 5：启动并验证

```bash
# 启动 ZLMediaKit
./MediaServer

# 验证前端可访问
curl -sv http://localhost:80/login.html
# 应返回 HTTP/1.1 200 OK
```

### h265web.js 播放入口

视频管理页的「播放」按钮对 RTMP 和 TS 流分别使用 ZLM 的 HTTP-FLV、HTTP-TS 地址并交给 h265web.js，按当前流的 vhost 获取 `on_play` 附加参数，默认静音。播放失败时可在弹窗中重试；重试先释放旧播放器，再重新请求播放授权。Jessibuca 不再由视频管理页加载或创建。HLS、fMP4 和 WHEP 仍走各自原有播放路径。

弹窗默认显示平面视频。确认当前流是 ERP 360 视频时，可点「360°模式」切换为可拖动/触摸旋转、滚轮缩放的透视视角；「重置视角」恢复初始方向，「平面模式」切回原画面。流列表没有可靠的 ERP 标记，因此不会按分辨率自动开启 360°。现有全屏和截图按钮在两种画面模式下共用。此控件只针对已由 h265web.js 接管的 RTMP/TS 行，不代表 PyMKUI 已接入 MP4/WebM 点播。

播放所需 `h265web.js`、`h265web_wasm.js` 和 `h265web_wasm.wasm` 位于 `frontend/js/lib/h265web/`，应与前端一起同源提供。部署时检查 JS/WASM MIME、媒体地址的 CORS 和 WebAssembly 线程所需的跨源隔离响应头；漏掉这三件资产会使 RTMP/TS 播放入口无法启动。

---

## 界面展示

|                                                       |                                                       |
| ----------------------------------------------------- | ----------------------------------------------------- |
| ![登录](image/wechat_2026-03-07_152523_627.png)         | ![服务器状态](image/wechat_2026-03-07_145716_786.png)   |
| ![流管理](image/wechat_2026-03-07_145746_419.png)       | ![流信息](image/wechat_2026-03-07_152506_741.png)       |
| ![流播放](image/wechat_2026-03-07_145756_844.png)       | ![观众列表](image/wechat_2026-03-07_145834_262.png)     |
| ![系统设置](image/wechat_2026-03-07_150120_303.png)     | ![网络连接](image/wechat_2026-03-07_145637_562.png)     |
| ![在线推流](image/wechat_2026-03-07_150213_341.png)     | ![拉流代理](image/wechat_2026-03-18_203037_193.png)     |
| ![拉流代理详情](image/wechat_2026-03-18_203057_257.png) | ![添加拉流代理](image/wechat_2026-03-18_203133_402.png) |
| ![录像管理](image/wechat_2026-05-04_105426_633.png)     | ![播放全天录像](image/wechat_2026-05-04_105440_247.png) |
| ![插件系统](image/wechat_2026-05-04_105512_197.png)     | ![插件配置](image/wechat_2026-05-04_105540_479.png)    |
| ![流信息](image/wechat_2026-05-04_105614_128.png)    | ![探针详情](image/wechat_2026-05-04_105632_441.png)        |

---

## 常见问题

| 问题                          | 解决方法                                              |
| ----------------------------- | ----------------------------------------------------- |
| zlm打印Python调用红色错误日志 | 同时更新zlm和pymkui至最新版本                         |
| `/index/pyapi/*` 返回未登录 | 正常现象，API 已通，完成登录即可                      |
| 配了 rootPath 仍 404          | 确认路径指向 `frontend/` 目录且 `login.html` 存在 |
| 启动报数据库错误              | 删除 `data/pymkui.db` 后重启                        |

---

## 技术栈

| 层级   | 技术                                              |
| ------ | ------------------------------------------------- |
| 前端   | HTML5 + Tailwind CSS + Font Awesome               |
| 播放器 | h265web.js (HTTP-FLV/HTTP-TS)、原生 HLS、WHEP (WebRTC) |
| 后端   | Python + FastAPI（内嵌于 ZLMediaKit Python 插件） |
| 数据库 | SQLite                                            |
| 服务器 | ZLMediaKit (C++)                                  |

---

## 未来规划

- 🤖 **AI 推理集成** — 对接 ONNX / TensorRT / OpenCV DNN，实现实时视频分析（目标检测、人脸识别等）

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
