"""
FFmpeg 转码插件（on_media_changed）

当媒体源注册（上线）时，启动 FFmpeg 进程进行转码；
当媒体源注销（下线）时，停止 FFmpeg 进程。

支持：
  - 自定义 FFmpeg 命令行参数
  - vhost / app / stream 来源过滤（支持通配符 *）
  - 命令行参数变量替换：{vhost} {app} {stream}
  - multi_binding=True：可多次绑定，每实例使用不同的转码参数
"""

import fnmatch
import threading
import subprocess
import os
import signal
import mk_loader
import mk_logger
from py_plugin import PluginBase


# ── 全局转码进程状态表 ────────────────────────────────────────────────────
# state_key → FFmpeg 进程对象
_transcoder_processes: dict = {}
_lock = threading.Lock()


# ── 插件类 ────────────────────────────────────────────────────────────

class FFMpegTranscoder(PluginBase):
    name        = "ffmpeg_transcoder"
    version     = "1.0.0"
    description = (
        "FFmpeg 转码插件（on_media_changed）。"
        "流上线时启动 FFmpeg 进程进行转码，"
        "流下线时停止 FFmpeg 进程。"
        "支持自定义命令行参数，支持 {vhost}/{app}/{stream} 变量替换。"
    )
    type          = "on_media_changed"
    interruptible = False   # 监听型：不拦截事件，继续派发后续插件
    multi_binding = True    # 支持多实例，每实例使用不同的转码参数

    def params(self) -> dict:
        return {
            "ffmpeg_cmd": {
                "type": "str",
                "description": (
                    "FFmpeg 命令行参数，支持变量：{vhost} {app} {stream}，"
                    "例如：-i rtsp://localhost:554/{app}/{stream} -c:v libx264 -c:a aac -f flv rtmp://localhost/live/{stream}_transcoded"
                ),
                "default": "",
            },
            "vhost_filter": {
                "type": "str",
                "description": "来源 vhost 过滤，支持通配符 *，默认匹配所有",
                "default": "*",
            },
            "app_filter": {
                "type": "str",
                "description": "来源 app 过滤，支持通配符 *，默认匹配所有",
                "default": "*",
            },
            "stream_filter": {
                "type": "str",
                "description": "来源 stream 过滤，支持通配符 *，默认匹配所有",
                "default": "*",
            },
            "schema_filter": {
                "type": "str",
                "description": (
                    "只对指定来源协议触发，多个用英文逗号分隔，"
                    "例如 rtsp,rtmp。空则匹配所有协议。"
                ),
                "default": "",
            },
        }

    def run(self, **kwargs) -> bool:
        is_register: bool    = kwargs.get("is_register", False)
        sender               = kwargs.get("sender")
        binding_params: dict = kwargs.get("binding_params") or {}

        if sender is None:
            return False

        # 同步获取来源流信息（sender是临时对象，不可在异步协程中引用）
        try:
            src_schema = sender.getSchema()
            mt     = sender.getMediaTuple()
            vhost  = mt.vhost
            app    = mt.app
            stream = mt.stream
        except Exception as e:
            mk_logger.log_warn(f"[ffmpeg_transcoder] 获取流信息异常: {e}")
            return False

        # 读取绑定参数（优先实例参数，缺省取 params() 默认值）
        p = self.params()
        def _get(key):
            return binding_params.get(key, p[key]["default"])

        ffmpeg_cmd   = str(_get("ffmpeg_cmd")).strip()
        vhost_filter  = str(_get("vhost_filter")  or "*")
        app_filter    = str(_get("app_filter")    or "*")
        stream_filter = str(_get("stream_filter") or "*")
        schema_filter = str(_get("schema_filter") or "").strip().lower()

        if not ffmpeg_cmd:
            return False

        # ── 来源过滤 ──
        if not fnmatch.fnmatch(vhost,  vhost_filter):  return False
        if not fnmatch.fnmatch(app,    app_filter):    return False
        if not fnmatch.fnmatch(stream, stream_filter): return False
        if schema_filter:
            allowed = [s.strip() for s in schema_filter.split(",") if s.strip()]
            if allowed and src_schema.lower() not in allowed:
                return False

        # ── 变量替换生成实际命令行 ──
        # 获取FFmpeg可执行文件路径
        ffmpeg_bin = mk_loader.get_config('ffmpeg.bin') or 'ffmpeg'
        # 生成完整命令
        cmd = f"{ffmpeg_bin} {ffmpeg_cmd}"
        # 变量替换
        cmd = (cmd
               .replace("{vhost}",  vhost)
               .replace("{app}",    app)
               .replace("{stream}", stream))

        # 状态 key：命令模板 + 流标识，唯一标识一个转码任务
        state_key = f"{ffmpeg_cmd}|{vhost}|{app}|{stream}"

        if is_register:
            with _lock:
                if state_key in _transcoder_processes:
                    mk_logger.log_info(
                        f"[ffmpeg_transcoder] 转码进程已存在，跳过重复启动 "
                        f"{vhost}/{app}/{stream}"
                    )
                    return False

            # 启动 FFmpeg 进程
            try:
                # 使用 shell=True 来执行完整的命令行
                process = subprocess.Popen(cmd, shell=True, preexec_fn=os.setsid)
                with _lock:
                    _transcoder_processes[state_key] = process
                mk_logger.log_info(
                    f"[ffmpeg_transcoder] 转码进程已启动 {vhost}/{app}/{stream} → 命令: {cmd}"
                )
            except Exception as e:
                mk_logger.log_warn(f"[ffmpeg_transcoder] 启动转码进程失败: {e}")
        else:
            with _lock:
                process = _transcoder_processes.pop(state_key, None)
            if process:
                try:
                    # 终止进程组，确保所有子进程都被终止
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    process.wait(timeout=5)
                    mk_logger.log_info(
                        f"[ffmpeg_transcoder] 转码进程已停止 {vhost}/{app}/{stream}"
                    )
                except Exception as e:
                    mk_logger.log_warn(f"[ffmpeg_transcoder] 停止转码进程失败: {e}")
            else:
                mk_logger.log_info(
                    f"[ffmpeg_transcoder] 流下线，未找到对应转码进程（已停止或未曾启动）"
                    f" {vhost}/{app}/{stream}"
                )

        return False  # 监听型，始终不拦截后续插件
