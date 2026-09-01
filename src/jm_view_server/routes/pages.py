import os
from urllib.parse import quote

import common
from flask import abort, Response
from flask import render_template, send_from_directory
from flask import request, session, redirect, flash, jsonify

from ..driver import get_lan_ip


class PageRoutesMixin:
    def jm_view(self):
        """
        以禁漫章节的模式观看指定文件夹下的图片
        """
        if not self.verify():
            return redirect('/login')

        # path是要阅读的文件夹
        path = request.args.get('path', None)
        # 从哪个文件夹打开的
        openFromDir = request.args.get(
            'openFromDir', self.file_manager.get_current_path())

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
                                   'os_type': self._os_type(),
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

    def api_thumbnail(self):
        """
        API: 获取图片文件的纯内存缩略图（宽<=300px，WebP/JPEG 格式，零磁盘持久化）
        支持 HTTP ETag / If-None-Match / Cache-Control 协商缓存
        """
        if not self.verify():
            return abort(403)

        raw_path = request.args.get('path', None)
        if not raw_path:
            return jsonify({'error': 'Path required'}), 400

        from urllib.parse import unquote
        path = unquote(raw_path)
        path = os.path.abspath(path)

        if not os.path.isfile(path):
            return abort(404)

        from ..thumbnail import thumbnail_cache
        width = request.args.get('w', 300, type=int)
        height = request.args.get('h', 400, type=int)

        thumb_res = thumbnail_cache.get_thumbnail(path, max_width=width, max_height=height)
        if thumb_res:
            data, mime_type, mtime, etag = thumb_res

            # 协商缓存检查
            if_none_match = request.headers.get('If-None-Match')
            if if_none_match and if_none_match == etag:
                return Response(status=304)

            response = Response(data, mimetype=mime_type)
            response.headers['Cache-Control'] = 'public, max-age=86400'
            response.headers['ETag'] = etag
            return response
        else:
            # 降级：未安装 Pillow 或缩放失败时回退到原图发送
            return send_from_directory(os.path.dirname(path), os.path.basename(path))

    def api_jm_images(self):
        """
        获取指定文件夹的图片列表（供无缝连播使用）
        """
        if not self.verify():
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401

        path = request.args.get('path', None)
        if not path:
            return jsonify({'status': 'error', 'message': 'Path is required'}), 400

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
            directory = (request.args.get('dir') or
                         self.file_manager.get_current_path())

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
