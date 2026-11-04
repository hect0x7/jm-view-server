import os
import time
from threading import current_thread
from typing import List, Optional

__all__ = [
    'current_thread',
    'file_not_exists',
    'files_of_dir',
    'fix_filepath',
    'format_ts',
    'of_dir_path',
    'of_file_name',
]


def fix_filepath(filepath: str, *_args, **_kwargs) -> str:
    """
    unix-style filepath
    """
    filepath = filepath.replace('\\', '/').replace('//', '/')
    if filepath and os.path.isdir(filepath):
        return filepath if filepath.endswith('/') else filepath + '/'
    return filepath


def file_not_exists(filepath: str) -> bool:
    return not os.path.exists(filepath)


def path_last_separator_index(filepath: str) -> int:
    return max(filepath.rfind('/'), filepath.rfind('\\'))


def of_file_name(filepath: str, trim_suffix: bool = False) -> str:
    if trim_suffix is True:
        dot_idx = filepath.rfind('.')
        if dot_idx > path_last_separator_index(filepath):
            filepath = filepath[:dot_idx]

    return filepath[path_last_separator_index(filepath) + 1:]


def of_dir_path(filepath: str, mkdir: bool = False) -> str:
    dirpath = os.path.dirname(filepath)
    if mkdir is True and dirpath and not os.path.exists(dirpath):
        os.makedirs(dirpath, exist_ok=True)
    return dirpath


def files_of_dir(abs_dir_path: str) -> List[str]:
    abs_dir_path = fix_filepath(os.path.abspath(abs_dir_path))
    return [f'{abs_dir_path}{f_or_d}' for f_or_d in sorted(os.listdir(abs_dir_path))]


def format_ts(ts: Optional[float] = None, f_time: str = '%Y-%m-%d %H:%M:%S') -> str:
    return time.strftime(f_time, time.localtime(ts))
