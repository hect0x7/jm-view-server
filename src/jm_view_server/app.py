import threading
from urllib.parse import quote
from html import unescape
import os
import re
import secrets
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
        根据设备类型返回对应的资源 url。
        已响应式化的页面（PC/移动共用一套模板）无论设备都返回同名模板，
        不再走 m_ 前缀；其余页面保持按设备切换 m_ 版的旧行为。
        """
        responsive_pages = {
            'login.html', 'index.html', 'jm_view.html',
            'upload.html', 'message.html', 'download_error.html',
        }
        if default_load_url in responsive_pages:
            return default_load_url
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

    # ===== 安全护栏（写操作复用） =====

    def _guard_dangerous_path(self, path):
        """
        写操作（删除/重命名/移动/新建）通用安全护栏。
        返回规范化后的绝对路径；若命中危险规则则返回 (None, (错误消息, 状态码))。
        护栏：禁盘符根、禁默认共享根本身、禁 Windows 关键系统目录。
        """
        path_abs = os.path.realpath(os.path.abspath(path))
        path_norm = os.path.normcase(path_abs)

        # 1. 绝对禁止操作盘符根目录（如 C:\, D:\, 或 unix 根 /），防止毁灭整盘数据
        drive, tail = os.path.splitdrive(path_abs)
        if not tail or tail.strip(r'\/') == '':
            return None, ('Permission denied: Cannot operate on drive root directory.', 403)

        # 2. 禁止操作默认共享根目录本身
        default_root_norm = os.path.normcase(os.path.realpath(os.path.abspath(self.file_manager.default_path)))
        if path_norm == default_root_norm:
            return None, ('Permission denied: Cannot operate on default shared root folder.', 403)

        # 3. 绝对防线，严禁触碰任何 Windows 关键系统盘敏感目录
        system_roots = [
            os.path.normcase(r'C:\Windows'),
            os.path.normcase(r'C:\Program Files'),
            os.path.normcase(r'C:\Program Files (x86)'),
            os.path.normcase(r'C:\Users'),
        ]
        if any(path_norm.startswith(sys_root) for sys_root in system_roots):
            return None, ('Permission denied: Cannot operate on critical system directories.', 403)

        return path_abs, None

    def _within_root(self, path_abs):
        """校验规范化后的绝对路径仍在默认共享根之内（防 .. 穿越到根外）。"""
        root = os.path.realpath(os.path.abspath(self.file_manager.default_path))
        target = os.path.realpath(path_abs)
        return target == root or target.startswith(root + os.sep)

    @staticmethod
    def _valid_name(name):
        """校验文件名/文件夹名：非空、不含路径分隔符、不是 . / .."""
        if not name or name in ('.', '..'):
            return False
        if '/' in name or '\\' in name:
            return False
        return True

    def api_delete_path(self):
        """
        [New] API: Delete file or folder securely
        """
        if not self.verify():
            return abort(403)

        path = request.values.get('path', None)
        if not path:
            return jsonify({'error': 'Path required'}), 400

        path_abs, err = self._guard_dangerous_path(path)
        if err:
            return jsonify({'error': err[0]}), err[1]

        if not self._within_root(path_abs):
            return jsonify({'error': 'Permission denied: Path escapes shared root.'}), 403

        if not os.path.exists(path_abs):
            return jsonify({'error': 'Path not found'}), 404

        try:
            if os.path.isdir(path_abs):
                import shutil
                shutil.rmtree(path_abs)
            else:
                os.remove(path_abs)
            return jsonify({'status': 'ok'})
        except Exception as e:
            return jsonify({'error': f'Delete failed: {e}'}), 500

    # ===== 打包下载 / 文件管理 / 批量操作 =====

    # 打包下载阈值：累计图片小于此值走内存 BytesIO，否则写临时文件。
    # 做成类常量便于测试临时调低以覆盖“大目录走临时文件”分支。
    ZIP_MEMORY_THRESHOLD = 200 * 1024 * 1024  # 200MB

    def api_download_zip(self):
        """
        [New] API: 把目录下的图片打包成 zip 流式下载。
        小目录（<ZIP_MEMORY_THRESHOLD）内存打包，大目录写临时文件后 send_file 并在响应后清理。
        """
        if not self.verify():
            return abort(403)

        path = request.args.get('path', None)
        if not path:
            return jsonify({'error': 'Path required'}), 400

        path_abs = os.path.realpath(os.path.abspath(path))
        if not self._within_root(path_abs):
            return jsonify({'error': 'Permission denied: Path escapes shared root.'}), 403
        if common.file_not_exists(path_abs) or not os.path.isdir(path_abs):
            return jsonify({'error': 'Directory not found'}), 404

        # 收集目录下的图片文件（仅当前层，与看本一致）
        images = []
        total = 0
        for f in self.file_manager.files_of_dir_safe(path_abs):
            if not self.file_manager.is_image_file(f):
                continue
            try:
                total += os.path.getsize(f)
            except OSError:
                continue
            images.append(f)

        if not images:
            return jsonify({'error': 'No image files in directory'}), 404

        import zipfile
        zip_name = common.of_file_name(path_abs) + '.zip'

        # I-6：逐个写入并跳过读不了的文件（权限/损坏），避免单个坏文件让整个打包 500。
        def _write_images(zf):
            added = 0
            for f in images:
                try:
                    zf.write(f, arcname=common.of_file_name(f))
                    added += 1
                except (OSError, PermissionError):
                    continue
            return added

        if total < self.ZIP_MEMORY_THRESHOLD:
            # 小目录：内存打包
            import io
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
                added = _write_images(zf)
            if not added:
                return jsonify({'error': '没有可读取的图片（可能无权限或文件损坏）'}), 422
            buf.seek(0)
            return Response(
                buf.getvalue(),
                mimetype='application/zip',
                headers={'Content-Disposition': f'attachment; filename="{quote(zip_name)}"'},
            )

        # 大目录：写系统临时文件，send_file 后清理
        import tempfile
        from flask import send_file, after_this_request
        fd, tmp_path = tempfile.mkstemp(suffix='.zip')
        os.close(fd)
        with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            added = _write_images(zf)
        if not added:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            return jsonify({'error': '没有可读取的图片（可能无权限或文件损坏）'}), 422

        @after_this_request
        def _cleanup(response):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            return response

        return send_file(tmp_path, mimetype='application/zip',
                         as_attachment=True, download_name=zip_name)

    def api_rename(self):
        """[New] API: 同目录重命名。body: path, new_name"""
        if not self.verify():
            return abort(403)

        path = request.values.get('path', None)
        new_name = request.values.get('new_name', None)
        if not path or new_name is None:
            return jsonify({'error': 'path and new_name required'}), 400
        if not self._valid_name(new_name):
            return jsonify({'error': 'Invalid new_name'}), 400

        path_abs, err = self._guard_dangerous_path(path)
        if err:
            return jsonify({'error': err[0]}), err[1]
        if not self._within_root(path_abs):
            return jsonify({'error': 'Permission denied: Path escapes shared root.'}), 403
        if not os.path.exists(path_abs):
            return jsonify({'error': 'Path not found'}), 404

        dst = os.path.join(os.path.dirname(path_abs), new_name)
        if os.path.exists(dst):
            return jsonify({'error': 'Target name already exists'}), 409
        try:
            os.rename(path_abs, dst)
            return jsonify({'status': 'ok', 'path': dst})
        except Exception as e:
            return jsonify({'error': f'Rename failed: {e}'}), 500

    def api_mkdir(self):
        """[New] API: 新建文件夹。body: parent, name"""
        if not self.verify():
            return abort(403)

        parent = request.values.get('parent', None)
        name = request.values.get('name', None)
        if not parent or name is None:
            return jsonify({'error': 'parent and name required'}), 400
        if not self._valid_name(name):
            return jsonify({'error': 'Invalid name'}), 400

        parent_abs = os.path.realpath(os.path.abspath(parent))
        if not self._within_root(parent_abs):
            return jsonify({'error': 'Permission denied: Path escapes shared root.'}), 403
        if not os.path.isdir(parent_abs):
            return jsonify({'error': 'Parent directory not found'}), 404

        target = os.path.join(parent_abs, name)
        if os.path.exists(target):
            return jsonify({'error': 'Directory already exists'}), 409
        try:
            os.makedirs(target)
            return jsonify({'status': 'ok', 'path': target})
        except Exception as e:
            return jsonify({'error': f'Mkdir failed: {e}'}), 500

    def api_move(self):
        """[New] API: 移动到目标目录。body: src, dst_dir"""
        if not self.verify():
            return abort(403)

        src = request.values.get('src', None)
        dst_dir = request.values.get('dst_dir', None)
        if not src or not dst_dir:
            return jsonify({'error': 'src and dst_dir required'}), 400

        src_abs, err = self._guard_dangerous_path(src)
        if err:
            return jsonify({'error': err[0]}), err[1]
        dst_dir_abs = os.path.realpath(os.path.abspath(dst_dir))
        if not self._within_root(src_abs) or not self._within_root(dst_dir_abs):
            return jsonify({'error': 'Permission denied: Path escapes shared root.'}), 403
        if not os.path.exists(src_abs):
            return jsonify({'error': 'Source not found'}), 404
        if not os.path.isdir(dst_dir_abs):
            return jsonify({'error': 'Target directory not found'}), 404

        try:
            import shutil
            shutil.move(src_abs, dst_dir_abs)
            return jsonify({'status': 'ok',
                            'path': os.path.join(dst_dir_abs, os.path.basename(src_abs))})
        except Exception as e:
            return jsonify({'error': f'Move failed: {e}'}), 500

    def api_batch_delete(self):
        """[New] API: 批量删除。body: paths（换行分隔或 JSON 数组）。逐个安全删除，返回成功/失败清单。"""
        if not self.verify():
            return abort(403)

        raw = request.values.get('paths', None)
        if not raw:
            return jsonify({'error': 'paths required'}), 400

        # 兼容 JSON 数组或换行分隔的多路径
        paths = None
        try:
            import json
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                paths = [str(p) for p in parsed]
        except (ValueError, TypeError):
            pass
        if paths is None:
            paths = [line.strip() for line in raw.splitlines() if line.strip()]

        succeeded, failed = [], []
        for p in paths:
            path_abs, err = self._guard_dangerous_path(p)
            if err:
                failed.append({'path': p, 'error': err[0]})
                continue
            if not self._within_root(path_abs):
                failed.append({'path': p, 'error': 'Path escapes shared root.'})
                continue
            if not os.path.exists(path_abs):
                failed.append({'path': p, 'error': 'Path not found'})
                continue
            try:
                if os.path.isdir(path_abs):
                    import shutil
                    shutil.rmtree(path_abs)
                else:
                    os.remove(path_abs)
                succeeded.append(p)
            except Exception as e:
                failed.append({'path': p, 'error': str(e)})

        return jsonify({'status': 'ok', 'succeeded': succeeded, 'failed': failed})

    def jm_view(self):
        """
        以禁漫章节的模式观看指定文件夹下的图片
        """
        if not self.verify():
            return redirect('/login')

        # path是要阅读的文件夹
        raw_path = request.args.get('path', None)
        path = unescape(raw_path) if raw_path is not None else None
        # 从哪个文件夹打开的
        raw_open_from = request.args.get('openFromDir', None)
        openFromDir = unescape(raw_open_from) if raw_open_from is not None else self.file_manager.get_current_path()

        if path is None:
            return redirect('/')

        path = os.path.abspath(path)
        if os.path.isfile(path):
            path = common.of_dir_path(path)

        # 文件不存在
        if common.file_not_exists(path):
            return abort(404)

        print(f'jm_view: {path}')
        next_dir = self.file_manager.get_next_dir(path)
        next_dir_path = quote(next_dir) if next_dir else ''

        return render_template(self.url_format(self.mobile_check(), "jm_view.html"),
                               data={
                                   'title': common.of_file_name(path),
                                   'full_path': path,
                                   'images': self.file_manager.get_jm_view_images(path),
                                   'openFromDir': quote(openFromDir),
                                   'next_dir_path': next_dir_path,
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

    def api_jm_images(self):
        """
        获取指定文件夹的图片列表（供无缝连播使用）
        """
        if not self.verify():
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401

        raw_path = request.args.get('path', None)
        if not raw_path:
            return jsonify({'status': 'error', 'message': 'Path is required'}), 400

        path = unescape(raw_path)
        path = os.path.abspath(path)

        if not os.path.exists(path):
            return jsonify({'status': 'error', 'message': 'Path not found'}), 404

        next_dir = self.file_manager.get_next_dir(path)
        next_dir_path = quote(next_dir) if next_dir else ''

        images = self.file_manager.get_jm_view_images(path)

        return jsonify({
            'status': 'ok',
            'title': common.of_file_name(path),
            'full_path': path,
            'images': images,
            'next_dir_path': next_dir_path
        })

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

        # I-8：路径不存在（含手动输入越权/不存在目录）时，渲染友好错误页而非浏览器默认 404/持续 loading。
        #      注意：本项目设计上允许自由浏览文件系统（驱动器/盘符），故不在此加“越权”硬拦截，
        #      仅把“打不开的路径”统一导向友好空态页。
        if common.file_not_exists(path):
            return render_template(
                self.url_format(self.mobile_check(), "download_error.html"),
                filename=path, randomArg=self.url_random_arg()), 404

        return render_template(self.url_format(self.mobile_check(), "index.html"),
                               data={
                                   "files": self.file_manager.get_files_data(path),
                                   "drivers": self.file_manager.DRIVERS_LIST,
                                   "currentPath": path,
                                   "defaultPath": self.file_manager.default_path,
                                   "lan_ip": get_lan_ip(),
                                   "port": self.extra.get('port', self.DEFAULT_PORT),
                                   "os_type": self._os_type()
                               },
                               randomArg=self.url_random_arg())

    @staticmethod
    def _os_type():
        """返回前端用于文案适配的 OS 类型：mac / windows / other"""
        import sys
        if sys.platform == 'darwin':
            return 'mac'
        if sys.platform.startswith('win'):
            return 'windows'
        return 'other'

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
            # 优先从 url 参数获取文件夹路径，若没有则回落到 get_current_path()
            raw_dir = request.args.get('dir', None)
            if raw_dir:
                directory = unescape(raw_dir)
            else:
                directory = self.file_manager.get_current_path()

            directory = os.path.abspath(directory)
            # 确保目录存在且文件在该目录下
            if os.path.exists(directory) and filename in os.listdir(directory):
                # 发送文件 参数：路径，文件名
                return send_from_directory(directory, filename)
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
                from werkzeug.utils import secure_filename
                safe_name = secure_filename(upload_file.filename)
                if not safe_name:
                    return '提示：文件名无效，请检查文件名', 400
                upload_file.save(os.path.join(self.file_manager.get_current_path(), safe_name))

                # 返回上传成功的消息给前端
                return '提示：上传的%s已经存储到了服务器中!' % upload_file.filename

            # 如果是 GET 方法：
            device_isMobile = self.mobile_check()
            return render_template(self.url_format(device_isMobile, "upload.html"),
                                   randomArg=self.url_random_arg())
        else:
            return redirect('/login')

    def stream(self):
        if not self.verify():
            return redirect('/login')

        # 确保消息队列已初始化（即使 jm_option 未配置也不抛 AttributeError）
        if not hasattr(self, 'jm_log_msg_queue'):
            import queue
            self.jm_log_msg_queue = queue.Queue()

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
        if not self.verify():
            return abort(403)
        import subprocess
        import sys
        # Flask 的 <path:...> 转换器会吃掉前导 '/'，导致 mac/linux 绝对路径
        # （如 /Users/x）到这里变成相对路径 Users/x，os.path.abspath 会基于 cwd
        # 重复拼接。这里补回前导 '/'（Windows 盘符路径如 C:\ 不受影响）。
        if not sys.platform.startswith('win') and not directory.startswith('/'):
            directory = '/' + directory
        path = os.path.abspath(directory)
        # I-7：路径不存在（如已被删/移动）时给出明确错误，前端可提示而非静默失败
        if not os.path.exists(path):
            return jsonify({'error': '目标不存在，可能已被移动或删除'}), 404
        # I-10：reveal=1（默认）在父目录中“选中”该项（适合列表里定位单个文件/文件夹）；
        #       reveal=0 直接“进入/打开”该目录本身（适合顶部“打开当前文件夹”按钮）。
        reveal = request.args.get('reveal', '1') != '0'
        is_dir = os.path.isdir(path)
        try:
            if sys.platform == 'darwin':
                if reveal or not is_dir:
                    subprocess.Popen(['open', '-R', path])   # 在访达中选中
                else:
                    subprocess.Popen(['open', path])          # 直接进入该目录
            elif sys.platform.startswith('win'):
                if reveal or not is_dir:
                    subprocess.Popen(f'explorer /select,"{path}"')  # 选中
                else:
                    subprocess.Popen(['explorer', path])            # 直接进入
            else:
                # Linux/其它：直接用默认文件管理器打开目录（无“选中”语义时打开所在目录）
                target = path if is_dir else os.path.dirname(path)
                subprocess.Popen(['xdg-open', target])
        except Exception as e:
            return jsonify({'error': f'无法打开文件管理器：{e}'}), 500
        return jsonify({'status': 'ok'})

    # ===== PWA 支持 =====

    def pwa_service_worker(self):
        """从根路径提供 service worker，使其作用域可覆盖整站（/）。"""
        static_dir = os.path.join(os.path.dirname(__file__), 'static')
        resp = send_from_directory(static_dir, 'sw.js', mimetype='text/javascript')
        # 允许 sw 控制根作用域（默认作用域受脚本所在路径限制）
        resp.headers['Service-Worker-Allowed'] = '/'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp

    def pwa_manifest(self):
        """从根路径提供 manifest（start_url=/，作用域根），方便安装到主屏。"""
        static_dir = os.path.join(os.path.dirname(__file__), 'static')
        return send_from_directory(static_dir, 'manifest.webmanifest',
                                   mimetype='application/manifest+json')

    # ===== 消息功能 =====

    def message_page(self):
        """
        消息页面（支持 PC/移动端自适应）
        """
        if not self.verify():
            return redirect('/login')

        # 获取客户端IP，默认本机是 server，其他设备是局域网IP
        client_ip = request.remote_addr or ''
        is_local = client_ip in ('127.0.0.1', '::1', 'localhost')
        default_nickname = 'server' if is_local else client_ip

        return render_template(
            self.url_format(self.mobile_check(), 'message.html'),
            server_addr=f'{get_lan_ip()}:{self.extra.get("port", self.DEFAULT_PORT)}',
            default_nickname=default_nickname,
            is_local=is_local,
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
        # 获取所有有效消息的 ID 列表
        all_messages = self.message_manager.get_all_messages()
        active_ids = [m['id'] for m in all_messages]

        return jsonify({
            'messages': messages,
            'active_ids': active_ids
        })

    def api_send_message(self):
        """
        API: 发送消息
        """
        if not self.verify():
            return abort(403)

        data = request.get_json(silent=True)
        if not data or not data.get('content'):
            return jsonify({'error': '消息内容不能为空'}), 400

        sender_ip = request.remote_addr or ''
        is_local = sender_ip in ('127.0.0.1', '::1', 'localhost')
        default_sender = 'server' if is_local else sender_ip

        sender = data.get('sender', '').strip() or default_sender
        content = data.get('content', '').strip()

        # 判断是否为服务器本机发送
        if is_local and sender in ('server', '服务器'):
            msg = self.message_manager.send_server_message(content)
        else:
            msg = self.message_manager.send_message(sender, content, sender_ip)

        if msg:
            return jsonify({'status': 'ok', 'message': msg})
        else:
            return jsonify({'error': '发送失败'}), 400

    def api_delete_message(self):
        """
        API: 删除消息（仅限服务器本机执行）
        """
        if not self.verify():
            return abort(403)

        # 校验是否为服务器本机请求
        sender_ip = request.remote_addr or ''
        is_local = sender_ip in ('127.0.0.1', '::1', 'localhost')
        if not is_local:
            return jsonify({'error': '只有服务器本机有权删除消息'}), 403

        msg_id = request.args.get('id', 0, type=int)
        if not msg_id:
            return jsonify({'error': '缺少消息 ID'}), 400

        success = self.message_manager.delete_message(msg_id)
        if success:
            return jsonify({'status': 'ok'})
        else:
            return jsonify({'error': '未找到该消息或已删除'}), 404

    # ===== 自定义背景图 =====

    # 允许的背景图扩展名（小写，不含点）
    BG_ALLOWED_EXT = ('jpg', 'jpeg', 'png', 'gif', 'webp')
    # 背景图大小上限（20MB）
    BG_MAX_SIZE = 20 * 1024 * 1024

    def _bg_dir(self):
        """背景图持久化目录：~/.jm_view_server（不存在则创建）。"""
        d = os.path.join(os.path.expanduser('~'), '.jm_view_server')
        os.makedirs(d, exist_ok=True)
        return d

    def _find_bg_file(self):
        """返回当前背景图文件的绝对路径；不存在返回 None。"""
        import glob
        matches = glob.glob(os.path.join(self._bg_dir(), 'background.*'))
        return matches[0] if matches else None

    def api_upload_bg(self):
        """[New] API: 上传自定义背景图。multipart/form-data，字段名 file。"""
        if not self.verify():
            return abort(403)

        upload_file = request.files.get('file')
        if upload_file is None or not upload_file.filename:
            return jsonify({'error': 'file required'}), 400

        ext = upload_file.filename.rsplit('.', 1)[-1].lower() if '.' in upload_file.filename else ''
        if ext not in self.BG_ALLOWED_EXT:
            return jsonify({'error': 'Only image files (jpg/jpeg/png/gif/webp) are allowed'}), 400

        # 校验大小（读到内存再落盘，便于精确控制上限）
        data = upload_file.read()
        if len(data) > self.BG_MAX_SIZE:
            return jsonify({'error': 'File too large (max 20MB)'}), 400
        if not data:
            return jsonify({'error': 'Empty file'}), 400

        # 先删除旧背景图，避免多扩展名残留
        old = self._find_bg_file()
        if old:
            try:
                os.remove(old)
            except OSError:
                pass

        # 文件名固定，防止路径穿越
        dst = os.path.join(self._bg_dir(), f'background.{ext}')
        try:
            with open(dst, 'wb') as f:
                f.write(data)
        except OSError as e:
            return jsonify({'error': f'Save failed: {e}'}), 500

        mtime = int(os.path.getmtime(dst))
        return jsonify({'status': 'ok', 'url': f'/api/background?t={mtime}'})

    def api_background(self):
        """[New] API: 返回当前背景图文件；不存在返回 404。"""
        bg = self._find_bg_file()
        if not bg:
            return abort(404)
        from flask import send_file
        return send_file(bg)

    def api_background_clear(self):
        """[New] API: 删除背景图，恢复无背景。"""
        if not self.verify():
            return abort(403)

        bg = self._find_bg_file()
        if bg:
            try:
                os.remove(bg)
            except OSError as e:
                return jsonify({'error': f'Clear failed: {e}'}), 500
        return jsonify({'status': 'ok'})

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
        self.app.add_url_rule("/api/jm_images", 'api_jm_images', self.api_jm_images, methods=['GET'])
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
