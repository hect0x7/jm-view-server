import os
from urllib.parse import quote

import common
from flask import abort, jsonify, redirect, render_template, request, Response

from ..driver import get_lan_ip


class FileRoutesMixin:
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

        files_data = self.file_manager.get_files_data(path, update_current=False)
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
        """[New] API: 批量删除。body: paths（换行分隔或 JSON 数组）。逐个应用危险路径护栏后删除。"""
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
