import os
from flask import abort
from flask import render_template, send_from_directory
from flask import jsonify, redirect, request

from ..driver import get_lan_ip


class ServiceRoutesMixin:
    def api_copy_favorites(self):
        if not self.verify():
            return jsonify({'error': 'Unauthorized'}), 401
        body = request.get_json(silent=True)
        destination = body.get('destination') if isinstance(body, dict) else None
        clear = body.get('clear', False) if isinstance(body, dict) else False
        mode = body.get('mode') if isinstance(body, dict) else None
        if mode is not None and mode not in ('copy', 'copy_clear', 'move'):
            return jsonify({'error': '请选择有效的导出方式'}), 400
        if not isinstance(clear, bool):
            return jsonify({'error': 'clear 必须为布尔值'}), 400
        if (not isinstance(destination, str) or not destination.strip()
                or '\x00' in destination or not os.path.isabs(destination)):
            return jsonify({'error': '请输入服务器电脑上的完整文件夹路径'}), 400
        try:
            return jsonify(self.favorite_manager.copy_images(os.path.abspath(destination.strip()), clear=clear,
                                                            mode=mode, guard=self._guard_dangerous_path))
        except (OSError, ValueError):
            return jsonify({'error': '无法复制，请检查收藏记录、目标路径与读写权限'}), 500

    def api_favorites(self):
        if not self.verify():
            return jsonify({'error': 'Unauthorized'}), 401
        try:
            if request.method == 'GET':
                response = jsonify({'images': self.favorite_manager.list_images()})
                response.headers['Cache-Control'] = 'no-store'
                return response
            body = request.get_json(silent=True)
            path = body.get('path') if isinstance(body, dict) else None
            if not isinstance(path, str) or not path or '\x00' in path or not os.path.isabs(path):
                return jsonify({'error': '需要有效的图片路径'}), 400
            path = os.path.abspath(path)
            favorite = request.method == 'PUT'
            if favorite and (not os.path.isfile(path) or not self.file_manager.is_image_file(path)):
                return jsonify({'error': '图片不存在或格式不支持'}), 400
            self.favorite_manager.set_image(path, favorite)
            return jsonify({'favorite': favorite})
        except (OSError, ValueError):
            return jsonify({'error': '无法读写收藏记录，请检查收藏文件与访问权限'}), 500

    def favorites_page(self):
        if not self.verify():
            return redirect('/login')
        try:
            images = []
            for item in self.favorite_manager.list_images():
                image = {**item, 'name': os.path.basename(item['path']), 'available': False,
                         'parent': os.path.dirname(item['path']),
                         'modified_at': None, 'size_label': '不可用'}
                try:
                    if os.path.isfile(item['path']):
                        stat = os.stat(item['path'])
                        image.update(available=True, modified_at=stat.st_mtime,
                                     size_label=self.file_manager.file_size_format(stat.st_size, 'file') or f'{stat.st_size} B')
                except OSError:
                    pass
                images.append(image)
        except (OSError, ValueError):
            return render_template('favorites.html', images=[], error='无法读取收藏记录',
                                   randomArg=self.url_random_arg()), 500
        return render_template('favorites.html', images=images,
                               available_count=sum(image['available'] for image in images),
                               randomArg=self.url_random_arg())

    def pwa_service_worker(self):
        """从根路径提供 service worker，使其作用域可覆盖整站（/）。"""
        resp = send_from_directory(self.app.static_folder, 'sw.js', mimetype='text/javascript')
        # 允许 sw 控制根作用域（默认作用域受脚本所在路径限制）
        resp.headers['Service-Worker-Allowed'] = '/'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp

    def pwa_manifest(self):
        """从根路径提供 manifest（start_url=/，作用域根），方便安装到主屏。"""
        return send_from_directory(self.app.static_folder, 'manifest.webmanifest',
                                   mimetype='application/manifest+json')

    # ===== 消息功能 =====

    def settings_page(self):
        """浏览器本地设置中心（PC/移动端共用响应式模板）。"""
        if not self.verify():
            return redirect('/login')

        return render_template(
            self.url_format(self.mobile_check(), 'settings.html'),
            randomArg=self.url_random_arg()
        )

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
