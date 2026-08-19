import io
import os
import re
import threading
from collections import OrderedDict
from typing import Optional, Tuple

try:
    from PIL import Image, ImageOps
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False


class InMemoryThumbnailCache:
    """
    纯内存 LRU 缩略图缓存管理器：
    - 零磁盘 I/O 写入，服务重启自动释放；
    - 结合 mtime 与 ETag 感知源文件变更；
    - 线程安全，具备最大条目上限限制（默认 1000 张）。
    """

    def __init__(self, max_entries: int = 1000, default_width: int = 300, default_height: int = 400):
        self.max_entries = max_entries
        self.default_width = default_width
        self.default_height = default_height
        self._cache: OrderedDict = OrderedDict()
        self._lock = threading.Lock()

    def get_thumbnail(self, file_path: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[Tuple[bytes, str, float, str]]:
        """
        获取指定图片文件的内存缩略图。
        返回: (bytes_data, mime_type, mtime, etag) 或在生成失败时返回 None。
        """
        if not HAS_PILLOW or not os.path.isfile(file_path):
            return None

        width = max_width or self.default_width
        height = max_height or self.default_height

        try:
            mtime = os.path.getmtime(file_path)
        except OSError:
            return None

        norm_path = os.path.normpath(file_path)
        cache_key = (norm_path, mtime, width, height)

        with self._lock:
            if cache_key in self._cache:
                self._cache.move_to_end(cache_key)
                return self._cache[cache_key]

        # 缓存未命中，进行缩放生成
        try:
            with Image.open(file_path) as img:
                img = ImageOps.exif_transpose(img)

                # 计算等比例缩小
                img.thumbnail((width, height), Image.Resampling.LANCZOS)

                buf = io.BytesIO()
                # 优先保存为现代高效 WebP 格式
                try:
                    img.save(buf, format='WEBP', quality=80, method=4)
                    mime_type = 'image/webp'
                except Exception:
                    # 回退到 JPEG
                    if img.mode not in ('RGB', 'L'):
                        img = img.convert('RGB')
                    img.save(buf, format='JPEG', quality=80)
                    mime_type = 'image/jpeg'

                data = buf.getvalue()
                etag = f'"{abs(hash(cache_key))}_{len(data)}"'
                res = (data, mime_type, mtime, etag)
        except Exception:
            return None

        with self._lock:
            # 存入 LRU 缓存
            if len(self._cache) >= self.max_entries:
                self._cache.popitem(last=False)
            self._cache[cache_key] = res

        return res

    def clear(self):
        with self._lock:
            self._cache.clear()


# 全局单例
thumbnail_cache = InMemoryThumbnailCache()
