"""Shared image favorites stored in the server user's home directory."""
import json
import os
import shutil
import tempfile
import threading
import time
from pathlib import Path
from send2trash import send2trash


class FavoriteManager:
    _locks = {}
    _locks_guard = threading.Lock()

    def __init__(self, data_file=None):
        self.data_file = Path(data_file) if data_file else Path.home() / '.jm_view_server' / 'favorites.json'
        key = os.path.normcase(os.path.abspath(self.data_file))
        with self._locks_guard:
            self._lock = self._locks.setdefault(key, threading.Lock())

    def _load(self):
        try:
            with self.data_file.open(encoding='utf-8') as handle:
                records = json.load(handle)
        except FileNotFoundError:
            return []
        if not isinstance(records, list) or any(
                not isinstance(item, dict) or not isinstance(item.get('path'), str)
                or not isinstance(item.get('created_at'), (int, float)) for item in records):
            raise ValueError('Invalid favorites data')
        return records

    def list_images(self):
        with self._lock:
            return self._load()

    def set_image(self, path, favorite):
        key = os.path.normcase(path)
        with self._lock:
            records = self._load()
            found = any(os.path.normcase(item['path']) == key for item in records)
            if found == favorite:
                return
            if favorite:
                records.insert(0, {'path': path, 'created_at': time.time()})
            else:
                records = [item for item in records if os.path.normcase(item['path']) != key]
            self._save(records)

    def _save(self, records):
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        name = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                             dir=self.data_file.parent, delete=False) as handle:
                name = handle.name
                json.dump(records, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(name, self.data_file)
        finally:
            if name and os.path.exists(name):
                os.unlink(name)

    def copy_images(self, destination, clear=False, mode=None, guard=None):
        """Copy a snapshot of favorites without overwriting existing files."""
        mode = mode or ('copy_clear' if clear else 'copy')
        if mode not in ('copy', 'copy_clear', 'move'):
            raise ValueError('Invalid export mode')
        clear = mode != 'copy'
        records = self.list_images()
        destination = Path(destination)
        destination.mkdir(parents=True, exist_ok=True)
        result = {'copied': 0, 'moved': 0, 'skipped': 0, 'failed': 0, 'renamed': 0, 'issues': []}
        copied_records = set()
        for item in records:
            source = Path(item['path'])
            target = None
            created = False
            completed = False
            try:
                if mode == 'move':
                    if source.parent.resolve() == destination.resolve():
                        result['skipped'] += 1
                        result['issues'].append({'name': source.name, 'reason': '原图已在目标目录，保留原图与收藏'})
                        continue
                    if guard and guard(str(source))[1]:
                        raise PermissionError('Protected source')
                with source.open('rb') as original:
                    source_stat = os.fstat(original.fileno())
                    number = 1
                    while True:
                        name = source.name if number == 1 else f'{source.stem} ({number}){source.suffix}'
                        target = destination / name
                        try:
                            output = target.open('xb')
                            created = True
                            break
                        except FileExistsError:
                            number += 1
                    with output:
                        shutil.copyfileobj(original, output, length=1024 * 1024)
                        output.flush()
                        if output.tell() != source_stat.st_size:
                            raise OSError('Incomplete copy')
                        if mode == 'move':
                            os.fsync(output.fileno())
                shutil.copystat(source, target)
                result['copied'] += 1
                result['renamed'] += number > 1
                completed = True
                if mode == 'move':
                    current_stat = source.stat()
                    if (source_stat.st_dev, source_stat.st_ino, source_stat.st_size, source_stat.st_mtime_ns) != (
                            current_stat.st_dev, current_stat.st_ino, current_stat.st_size, current_stat.st_mtime_ns):
                        raise OSError('Source changed during copy')
                    send2trash(str(source))
                    result['moved'] += 1
                copied_records.add((os.path.normcase(item['path']), item['created_at']))
            except FileNotFoundError:
                result['skipped'] += 1
                result['issues'].append({'name': source.name, 'reason': '原图不存在'})
            except OSError:
                result['failed'] += 1
                result['issues'].append({'name': source.name, 'reason': '副本已保留，但原图移动失败，收藏保留' if completed else '复制失败，请检查读写权限和磁盘空间'})
            finally:
                if created and not completed:
                    # Only remove the new incomplete file, never a pre-existing target.
                    try:
                        target.unlink()
                    except FileNotFoundError:
                        pass
                    except OSError:
                        result['issues'].append({'name': target.name, 'reason': '未完成的副本无法清理，请检查目标文件夹'})
        result.update(cleared=0, cleared_paths=[], clear_error=None)
        if clear and copied_records:
            try:
                with self._lock:
                    current = self._load()
                    removed = [item for item in current
                               if (os.path.normcase(item['path']), item['created_at']) in copied_records]
                    remaining = [item for item in current
                                 if (os.path.normcase(item['path']), item['created_at']) not in copied_records]
                    if removed:
                        self._save(remaining)
                    result['cleared_paths'] = [item['path'] for item in removed]
                    result['cleared'] = len(removed)
            except (OSError, ValueError):
                result['clear_error'] = '原图已复制，但收藏记录未能清空，请检查收藏文件与读写权限'
        return result
