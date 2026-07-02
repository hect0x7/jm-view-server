import threading
from urllib.parse import quote
from html import unescape
import os
import re
from typing import Optional

import common
from flask import Flask, abort, Response, stream_with_context
from flask import render_template, send_from_directory
from flask import request, session, redirect, flash, jsonify

from .files import FileManager
from .message import MessageManager
from .driver import get_lan_ip


# noinspection PyMethodMayBeStatic
class JmServer:
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
        self.app.secret_key = __file__
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
            if re.search(self.MATCH_EXP, request.headers.get('User-Agent')):
                session.mobile = 'yes'
                return True
            else:
                session.mobile = 'no'
                return False

    def url_format(self, device_isMobile, default_load_url):
        """
        根据设备类型返回对应的资源 url
        """
        if device_isMobile:
            return './m_' + default_load_url
        else:
            return default_load_url

    def url_random_arg(self):
        """
        url添加一个随机参数，防止浏览器缓存
        """
        from random import randint
        return randint(100000, 1000000)

    def spa_view(self):
        """
        [New] V2 SPA Interface (PC Only)
        """
        if not self.verify():
            return redirect('/login')

        # 获取路径参数，如果为空则使用默认路径
        path = request.args.get('path', None)
        if path is None:
            path = self.file_manager.default_path

        path = os.path.abspath(path)
        path = common.fix_filepath(path)

        if common.file_not_exists(path):
            return abort(404)

        return render_template('index_spa.html',
                               data={
                                   'currentPath': path,
                                   'defaultPath': self.file_manager.default_path,
                                   'drivers': self.file_manager.DRIVERS_LIST,
                                   'lan_ip': get_lan_ip(),
                                   'port': self.extra.get('port', self.DEFAULT_PORT)
                               },
                               randomArg=self.url_random_arg())

    def api_list_files(self):
        """
        [New] API: List files in directory
        """
        if not self.verify():
            return abort(403)

        path = request.args.get('path', self.file_manager.default_path)
        path = os.path.abspath(path)
        path = common.fix_filepath(path)

        if common.file_not_exists(path):
            return jsonify({'error': 'Path not found'}), 404

        files_data = self.file_manager.get_files_data(path)
        return jsonify({
            'currentPath': path,
            'files': files_data
        })

    def api_album_images(self):
        """
        [New] API: Get images for an album
        """
        if not self.verify():
            return abort(403)

        path = request.args.get('path', None)
        if not path:
            return jsonify({'error': 'Path required'}), 400

        path = os.path.abspath(path)
        if common.file_not_exists(path):
            return jsonify({'error': 'Path not found'}), 404

        images = self.file_manager.get_jm_view_images(path)
        return jsonify({
            'title': common.of_file_name(path),
            'images': images
        })

    def api_open_file(self):
        """
        [New] API: Open file/folder in Explorer
        """
        if not self.verify():
            return abort(403)
            
        path = request.args.get('path', None)
        if not path:
           return jsonify({'error': 'Path required'}), 400
           
        return self.open_directory(path) or jsonify({'status': 'ok'})

    def jm_view(self):
        """
        以禁漫章节的模式观看指定文件夹下的图片
        """
        if not self.verify():
            return redirect('/login')

        # path是要阅读的文件夹
        path = unescape(request.args.get('path', None))
        # 从哪个文件夹打开的
        openFromDir = unescape(request.args.get('openFromDir', self.file_manager.get_current_path()))

        if path is None:
            return redirect('/')

        path = os.path.abspath(path)
        if os.path.isfile(path):
            path = common.of_dir_path(path)

        # 文件不存在
        if common.file_not_exists(path):
            return abort(404)

        print(f'jm_view: {path}')
        return render_template(self.url_format(self.mobile_check(), "jm_view.html"),
                               data={
                                   'title': common.of_file_name(path),
                                   'images': self.file_manager.get_jm_view_images(path),
                                   'openFromDir': quote(openFromDir),
                               },
                               randomArg=self.url_random_arg())

    def view_file(self):
        """
        获取单个文件
        """
        # 判断是否已经在登录状态上
        if not self.verify():
            # 之前没有登录过,返回登录页
            return redirect('/login')

        # 已经登录了，返回文件夹内文件信息（此时为默认路径）
        path = request.args.get('path', None)
        if path is None:
            return abort(403)

        return send_from_directory(os.path.dirname(path),
                                   os.path.basename(path),
                                   )

    def index(self):
        """
        共享文件主页
        """
        # 判断是否已经在登录状态上
        if not self.verify():
            # 之前没有登录过,返回登录页
            return redirect('/login')

        # 已经登录了，返回文件夹内文件信息（此时为默认路径）
        path = request.args.get('path', self.file_manager.default_path)
        path = os.path.abspath(path)
        path = common.fix_filepath(path)

        # 文件不存在
        if common.file_not_exists(path):
            return abort(404)

        return render_template(self.url_format(self.mobile_check(), "index.html"),
                               data={
                                   "files": self.file_manager.get_files_data(path),
                                   "drivers": self.file_manager.DRIVERS_LIST,
                                   "currentPath": path,
                                   "defaultPath": self.file_manager.default_path,
                                   "lan_ip": get_lan_ip(),
                                   "port": self.extra.get('port', self.DEFAULT_PORT)
                               },
                               randomArg=self.url_random_arg())

    def login(self):
        """
        登录页
        """
        device_isMobile = self.mobile_check()
        if request.method == 'GET':
            if self.verify():
                return redirect('/')
            else:
                # 之前没有登录过,返回一个登录页
                return render_template(self.url_format(device_isMobile, 'login.html'),
                                       randomArg=self.url_random_arg())
        else:
            # 先保存才能验证
            password = request.form.get('password')
            session['password'] = password
            if self.verify():
                # 重定向到首页
                return redirect('/')
            else:
                # 登录失败的情况
                flash("密码错误！")
                return redirect('/login')

    def logout(self):
        """
        注销
        """
        if self.verify():
            # 声明重定向对象
            resp = redirect('/')
            # 删除值
            resp.delete_cookie('password')
            session.pop('password', None)
            return resp
        else:
            # 没有登录过,返回登录页
            return redirect('/login')

    def file_content(self, filename):
        """
        下载文件
        """
        if self.verify():
            # 若文件存在
            if filename in os.listdir(self.file_manager.get_current_path()):
                # 发送文件 参数：路径，文件名
                return send_from_directory(self.file_manager.get_current_path(), filename)
            else:
                # 否则返回错误页面
                device_isMobile = self.mobile_check()
                return render_template(self.url_format(device_isMobile, "download_error.html"),
                                       filename=filename,
                                       randomArg=self.url_random_arg())
        else:
            return redirect('/login')

    def upload(self):
        """
        上传文件
        """
        if self.verify():
            if request.method == "POST":
                # 获取文件 拼接存储路径并保存
                upload_file = request.files['file']
                upload_file.save(os.path.join(self.file_manager.get_current_path(), upload_file.filename))

                # 返回上传成功的消息给前端
                return '提示：上传的%s已经存储到了服务器中!' % upload_file.filename

            # 如果是 GET 方法：
            device_isMobile = self.mobile_check()
            return render_template(self.url_format(device_isMobile, "upload.html"),
                                   randomArg=self.url_random_arg())
        else:
            return redirect('/login')

    def stream(self):
        album_id = request.args.get('id', None)
        end = f'-- END [{album_id}] --'

        # 开线程调用download_album
        threading.Thread(target=self.invoke_jmcomic_download_album, args=(album_id, end)).start()

        @stream_with_context
        def yield_download_msg():
            while True:
                msg = self.jm_log_msg_queue.get()
                if msg == end:
                    break
                yield msg

        # noinspection PyCallingNonCallable
        return Response(yield_download_msg(), mimetype="text/event-stream", headers={
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        })

    def invoke_jmcomic_download_album(self, album_id, end):
        try:
            import jmcomic
        except ImportError:
            self.jm_log_msg_queue.put('未安装 jmcomic')
            self.jm_log_msg_queue.put(end)
            return

        try:

            if self.jm_option is None:
                self.jm_log_msg_queue.put('未配置option，使用默认值 (jmcomic.JmOption.default())')
                op = jmcomic.JmOption.default()
            else:
                op = self.jm_option

            op.download_album(album_id)
        except Exception as e:
            self.jm_log_msg_queue.put(f'下载失败: {e}')
        finally:
            self.jm_log_msg_queue.put(end)

    def open_directory(self, directory):
        path = os.path.abspath(directory)
        # os.startfile(path)  # Windows特有，打开文件夹
        import subprocess
        subprocess.Popen(f'explorer /select,"{path}"')
        return ''

    # ===== 消息功能 =====

    def message_page(self):
        """
        消息页面（支持 PC/移动端自适应）
        """
        if not self.verify():
            return redirect('/login')

        return render_template(
            self.url_format(self.mobile_check(), 'message.html'),
            randomArg=self.url_random_arg()
        )

    def api_get_messages(self):
        """
        API: 获取消息列表（支持增量拉取）
        """
        if not self.verify():
            return abort(403)

        since_id = request.args.get('since_id', 0, type=int)
        limit = request.args.get('limit', 50, type=int)

        messages = self.message_manager.get_messages(since_id=since_id, limit=limit)
        return jsonify({'messages': messages})

    def api_send_message(self):
        """
        API: 发送消息
        """
        if not self.verify():
            return abort(403)

        data = request.get_json(silent=True)
        if not data or not data.get('content'):
            return jsonify({'error': '消息内容不能为空'}), 400

        sender = data.get('sender', '').strip() or '匿名'
        content = data.get('content', '').strip()
        sender_ip = request.remote_addr or ''

        # 判断是否为服务器本机发送
        is_local = sender_ip in ('127.0.0.1', '::1', 'localhost')
        if is_local and sender == '服务器':
            msg = self.message_manager.send_server_message(content)
        else:
            msg = self.message_manager.send_message(sender, content, sender_ip)

        if msg:
            return jsonify({'status': 'ok', 'message': msg})
        else:
            return jsonify({'error': '发送失败'}), 400

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
        self.app.add_url_rule("/stream", 'stream', self.stream, methods=['GET', 'POST'])

        # [New] SPA Routes
        self.app.add_url_rule("/spa", 'spa_view', self.spa_view, methods=['GET'])
        self.app.add_url_rule("/api/list_files", 'api_list_files', self.api_list_files, methods=['GET'])
        self.app.add_url_rule("/api/album_images", 'api_album_images', self.api_album_images, methods=['GET'])
        self.app.add_url_rule("/api/open_file", 'api_open_file', self.api_open_file, methods=['GET'])

        # 消息功能路由
        self.app.add_url_rule("/message", 'message_page', self.message_page, methods=['GET'])
        self.app.add_url_rule("/api/messages", 'api_get_messages', self.api_get_messages, methods=['GET'])
        self.app.add_url_rule("/api/messages", 'api_send_message', self.api_send_message, methods=['POST'])

    def run(self, **kwargs):
        kwargs.setdefault('port', self.DEFAULT_PORT)
        self.register_routes()
        # 监听在所有 IP 地址上
        self.app.run(**kwargs)

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
