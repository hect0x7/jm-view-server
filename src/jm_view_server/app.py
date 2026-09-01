import os
import re
import secrets
import gzip
from typing import Optional

from flask import Flask, abort, jsonify, request, session

from .files import FileManager
from .message import MessageManager
from .routes import FileRoutesMixin, PageRoutesMixin, ServiceRoutesMixin, TransferRoutesMixin


# noinspection PyMethodMayBeStatic
class JmServer(FileRoutesMixin, PageRoutesMixin, TransferRoutesMixin, ServiceRoutesMixin):
    DEFAULT_PORT = 80
    # 匹配移动端设备的正则表达式
    MATCH_EXP = 'Android|webOS|iPhone|iPad|iPod|BlackBerry'

    def __init__(self,
                 default_path,
                 password,
                 *,
                 jm_option=None,
                 ip_whitelist=None,
                 current_path=None,
                 img_overwrite: Optional[dict] = None,
                 env=None,
                 **extra,
                 ):
        """
        创建一个共享文件服务器

        :param default_path: 默认路径
        :param password: 登录密码
        :param current_path: 当前路径
        :param extra: 额外配置
        """
        if current_path is None:
            current_path = default_path

        # 自定义背景图片，采用覆盖文件的方式
        self.handle_img_overwrite(img_overwrite or {})

        # 创建项目以及初始化一些关键信息
        self.app = Flask(__name__,
                         template_folder='templates',
                         static_folder='static',
                         static_url_path='/static',
                         )
        @self.app.after_request
        def finalize_response(response):
            # 文件列表会同时携带列表/网格两套响应式 DOM，目录名较长时 HTML
            # 可超过 200 KB。移动 Chrome 在频繁刷新这种未压缩响应时会偶发
            # 收到截断正文并报 ERR_CONTENT_LENGTH_MISMATCH，导致解析永远停在
            # loading，所有 defer 脚本也就完全不执行。只压缩普通 HTML 响应，
            # set_data 会按压缩后的真实字节数重算 Content-Length。
            content_type = response.headers.get('Content-Type', '')
            accepts_gzip = 'gzip' in request.headers.get('Accept-Encoding', '').lower()
            if (request.method != 'HEAD' and accepts_gzip and
                    content_type.startswith('text/html') and
                    not response.direct_passthrough and
                    'Content-Encoding' not in response.headers):
                data = response.get_data()
                if len(data) >= 1024:
                    response.set_data(gzip.compress(data, compresslevel=5))
                    response.headers['Content-Encoding'] = 'gzip'
                    response.headers['Vary'] = 'Accept-Encoding'
            return response

        # 使用安全随机值作为 secret_key，避免可预测的 session 签名
        self.app.secret_key = os.environ.get('FLASK_SECRET_KEY') or secrets.token_hex(32)
        # 设置登录密钥
        self.password = password
        self.file_manager = FileManager(default_path, current_path)
        self.extra = extra
        self.ip_whitelist = ip_whitelist
        self.jm_option = jm_option
        if jm_option is not None:
            import queue
            self.jm_log_msg_queue = queue.Queue()
            self.__hook_jm_logging()
        if env:
            for k, v in env.items():
                os.environ[k] = v

        # 初始化消息管理器
        self.message_manager = MessageManager()

    def __hook_jm_logging(self):
        import jmcomic
        def executor_log(topic: str, msg: str):
            from common import format_ts, current_thread
            msg = '[{}] [{}]:【{}】{}\n'.format(format_ts(), current_thread().name, topic, msg)
            self.jm_log_msg_queue.put(msg)

        jmcomic.JmModuleConfig.EXECUTOR_LOG = executor_log

    def verify(self):
        ip_whitelist = self.ip_whitelist
        if ip_whitelist is not None and request.remote_addr not in ip_whitelist:
            abort(404)

        """
        验证登录状态
        """
        if (self.password == '') or session.get('password', None) == self.password:
            return True
        else:
            return False

    def mobile_check(self):
        """
        设备类型检查
        """
        try:
            if session.mobile == 'yes':
                return True
            elif session.mobile == 'no':
                return False
        except AttributeError:
            if re.search(self.MATCH_EXP, request.headers.get('User-Agent', '')):
                session.mobile = 'yes'
                return True
            else:
                session.mobile = 'no'
                return False

    def url_format(self, device_isMobile, default_load_url):
        """
        返回 PC/移动端共用的响应式模板。

        保留 device_isMobile 参数以兼容现有调用点；旧 m_ 模板已经移除。
        """
        return default_load_url

    def url_random_arg(self):
        """
        url添加一个随机参数，防止浏览器缓存
        """
        from random import randint
        return randint(100000, 1000000)

    def register_routes(self):
        # 添加路由
        self.app.add_url_rule('/jm_view', 'jm_view', self.jm_view, methods=['GET'])
        self.app.add_url_rule("/view_file/", 'view_file', self.view_file, methods=['GET'], strict_slashes=False)
        self.app.add_url_rule('/', 'index', self.index, methods=['GET'])
        self.app.add_url_rule('/login', 'login', self.login, methods=['GET', 'POST'])
        self.app.add_url_rule('/logout', 'logout', self.logout, methods=['GET', 'POST'])
        self.app.add_url_rule("/download_file/<filename>", 'file_content', self.file_content)
        self.app.add_url_rule('/open/<path:directory>', 'open_directory', self.open_directory)
        self.app.add_url_rule("/upload_file", 'upload', self.upload, methods=['GET', 'POST'])
        self.app.add_url_rule("/settings", 'settings_page', self.settings_page, methods=['GET'])
        self.app.add_url_rule("/stream", 'stream', self.stream, methods=['GET', 'POST'])

        # [New] SPA Routes
        self.app.add_url_rule("/spa", 'spa_view', self.spa_view, methods=['GET'])
        self.app.add_url_rule("/api/list_files", 'api_list_files', self.api_list_files, methods=['GET'])
        self.app.add_url_rule("/api/album_images", 'api_album_images', self.api_album_images, methods=['GET'])
        self.app.add_url_rule("/api/jm_images", 'api_jm_images', self.api_jm_images, methods=['GET'])
        self.app.add_url_rule("/api/thumb", 'api_thumbnail', self.api_thumbnail, methods=['GET'])
        self.app.add_url_rule("/api/open_file", 'api_open_file', self.api_open_file, methods=['GET'])
        self.app.add_url_rule("/api/delete", 'api_delete_path', self.api_delete_path, methods=['GET', 'POST'])
        self.app.add_url_rule("/api/download_zip", 'api_download_zip', self.api_download_zip, methods=['GET'])
        self.app.add_url_rule("/api/rename", 'api_rename', self.api_rename, methods=['POST'])
        self.app.add_url_rule("/api/mkdir", 'api_mkdir', self.api_mkdir, methods=['POST'])
        self.app.add_url_rule("/api/move", 'api_move', self.api_move, methods=['POST'])
        self.app.add_url_rule("/api/batch_delete", 'api_batch_delete', self.api_batch_delete, methods=['POST'])

        # PWA：从根路径提供 sw / manifest（控制整站作用域）
        self.app.add_url_rule('/sw.js', 'pwa_service_worker', self.pwa_service_worker, methods=['GET'])
        self.app.add_url_rule('/manifest.webmanifest', 'pwa_manifest', self.pwa_manifest, methods=['GET'])

        # 自定义背景图路由
        self.app.add_url_rule("/api/upload_bg", 'api_upload_bg', self.api_upload_bg, methods=['POST'])
        self.app.add_url_rule("/api/background", 'api_background', self.api_background, methods=['GET'])
        self.app.add_url_rule("/api/background/clear", 'api_background_clear', self.api_background_clear,
                              methods=['POST', 'DELETE'])

        # 消息功能路由
        self.app.add_url_rule("/message", 'message_page', self.message_page, methods=['GET'])
        self.app.add_url_rule("/api/messages", 'api_get_messages', self.api_get_messages, methods=['GET'])
        self.app.add_url_rule("/api/messages", 'api_send_message', self.api_send_message, methods=['POST'])
        self.app.add_url_rule("/api/messages", 'api_delete_message', self.api_delete_message, methods=['DELETE'])

        # 获取服务器基础信息
        self.app.add_url_rule("/api/info", 'api_info', self.api_info, methods=['GET'])

    def run(self, **kwargs):
        kwargs.setdefault('port', self.DEFAULT_PORT)
        self.register_routes()
        # 监听在所有 IP 地址上
        self.app.run(**kwargs)

    def api_info(self):
        from . import __version__
        return jsonify({
            'version': __version__,
            'name': 'jm-view-server'
        })

    def handle_img_overwrite(self, img_overwrite: dict):
        bg_dir = os.path.abspath(__file__ + '/../static/img/')
        for orig_filename, overwrite_filepath in img_overwrite.items():
            orig_filepath = os.path.join(bg_dir, orig_filename)

            # copy overwrite_filepath to orig_filepath
            if os.path.exists(overwrite_filepath):
                with open(overwrite_filepath, 'rb') as f:
                    with open(orig_filepath, 'wb') as f2:
                        f2.write(f.read())
                        print(f'overwrite img [{orig_filename}] -> [{overwrite_filepath}]')
