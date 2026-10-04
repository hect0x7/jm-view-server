import os
import threading
from flask import abort, Response, stream_with_context
from flask import jsonify, redirect, render_template, request


class TransferRoutesMixin:
    def upload(self):
        """
        上传文件
        """
        if self.verify():
            if request.method == "POST":
                # 同一个 multipart 字段可重复出现，兼容原有单文件客户端。
                upload_files = [
                    upload_file for upload_file in request.files.getlist('file')
                    if upload_file and upload_file.filename
                ]
                if not upload_files:
                    return jsonify({
                        'status': 'error',
                        'message': '请选择需要上传的文件'
                    }), 400

                from werkzeug.utils import secure_filename
                safe_names = [secure_filename(upload_file.filename)
                              for upload_file in upload_files]
                if any(not safe_name for safe_name in safe_names):
                    return jsonify({
                        'status': 'error',
                        'message': '存在无效文件名，请检查后重试'
                    }), 400
                if len(set(safe_names)) != len(safe_names):
                    return jsonify({
                        'status': 'error',
                        'message': '所选文件处理后存在重名，请分别上传'
                    }), 400

                requested_path = request.form.get('path', '')
                target_dir = os.path.abspath(requested_path or self.file_manager.get_current_path())
                if not os.path.isdir(target_dir):
                    return jsonify({
                        'status': 'error',
                        'message': '上传目标目录不存在'
                    }), 404
                target_paths = [os.path.join(target_dir, safe_name)
                                for safe_name in safe_names]
                for upload_file, target_path in zip(upload_files, target_paths):
                    upload_file.save(target_path)

                # 返回上传成功的消息给前端
                return jsonify({
                    'status': 'ok',
                    'message': ('上传成功' if len(upload_files) == 1
                                else f'成功上传 {len(upload_files)} 个文件'),
                    'filename': upload_files[0].filename,
                    'filenames': [upload_file.filename for upload_file in upload_files],
                    'uploaded_count': len(upload_files),
                    'target_dir': target_dir,
                    'target_path': target_paths[0],
                    'target_paths': target_paths,
                })

            # 如果是 GET 方法：
            device_isMobile = self.mobile_check()
            requested_path = request.args.get('path', '')
            upload_target = os.path.abspath(requested_path or self.file_manager.get_current_path())
            if not os.path.isdir(upload_target):
                return render_template(
                    self.url_format(device_isMobile, "download_error.html"),
                    filename=upload_target,
                    randomArg=self.url_random_arg()), 404
            return render_template(self.url_format(device_isMobile, "upload.html"),
                                   uploadTarget=upload_target,
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
        import subprocess  # nosec B404
        import sys
        # Flask 的 <path:...> 转换器会吃掉前导 '/'，导致 mac/linux 绝对路径
        # （如 /Users/x）到这里变成相对路径 Users/x，os.path.abspath 会基于 cwd
        # 重复拼接。这里补回前导 '/'（Windows 盘符路径如 C:\ 不受影响）。
        if not sys.platform.startswith('win') and not directory.startswith('/'):
            directory = '/' + directory
        path = os.path.normpath(os.path.abspath(directory))
        # 路径不存在（如已被删/移动）时给出明确错误，前端可提示而非静默失败
        if not os.path.exists(path):
            return jsonify({'error': '目标不存在，可能已被移动或删除'}), 404
        # reveal=1（默认）在父目录中“选中”该项（适合列表里定位单个文件/文件夹）；
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
                    subprocess.Popen(f'explorer "{path}"')            # 直接进入
            else:
                # Linux/其它：直接用默认文件管理器打开目录（无“选中”语义时打开所在目录）
                target = path if is_dir else os.path.dirname(path)
                subprocess.Popen(['xdg-open', target])
        except Exception as e:
            return jsonify({'error': f'无法打开文件管理器：{e}'}), 500
        return jsonify({'status': 'ok'})

    # ===== PWA 支持 =====
