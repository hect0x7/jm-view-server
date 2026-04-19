from urllib.parse import quote
import os
import time
import re

import common


class FileManager:
    def __init__(self, default_path, current_path):
        self.default_path = default_path
        self.current_path = current_path

    @property
    def DRIVERS_LIST(self):
        # 判断如果是windows系统
        if os.name == 'nt':
            from .driver import get_winDriver
            return get_winDriver()
        else:
            return ['/']

    def get_jm_view_images(self, path):
        sortable_images = []
        unsortable_images = []

        for f in self.files_of_dir_safe(path):
            if not self.is_image_file(f):
                continue
            f = quote(f)
            name = common.of_file_name(f)
            try:
                index = int(name[:name.index('.')])
                sortable_images.append({
                    'filename': name,
                    'data_original': f'/view_file?path={f}',
                    'index': index,
                })
            except ValueError:
                unsortable_images.append({
                    'filename': name,
                    'data_original': f'/view_file?path={f}',
                    'index': None,
                })

        sortable_images.sort(key=lambda item: item['index'])
        unsortable_images.sort(key=lambda item: item['filename'])

        return sortable_images + unsortable_images

    @staticmethod
    def is_image_file(filename):
        file_extension = filename.lower().split('.')[-1]
        image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp']
        return file_extension in image_extensions

    @staticmethod
    def files_of_dir_safe(dir_path):
        try:
            return common.files_of_dir(dir_path)
        except OSError:
            return []

    def check_dir_can_open_jm_view(self, dirpath):
        return any(f for f in self.files_of_dir_safe(dirpath) if self.is_image_file(f))

    def build_one_path_info(self, file_path, dtype=''):
        jm_view, the_type = self.get_file_type(file_path)

        name = common.of_file_name(file_path)

        try:
            size = os.path.getsize(file_path)
        except OSError:
            return

        size = dtype if dtype != '' else self.file_size_format(size, the_type)

        try:
            getctime = os.path.getctime(file_path)
            ctime = time.localtime(getctime)
            time_str = time.strftime("%Y-%m-%d %H:%M:%S", ctime)
        except OSError:
            return

        first_img_url = ''
        if jm_view and the_type == 'dir':
            imgs = self.get_jm_view_images(file_path)
            if imgs:
                first_img_url = imgs[0]

        if name.endswith('.lnk'):
            target_path = self.get_target_path(file_path)
            return self.build_one_path_info(target_path, 'Link')

        quoted_path = quote(file_path)
        quoted_name = quote(name)

        return {
            "name": name,
            'path': file_path,
            'quoted_path': quoted_path,
            'href': f'/?path={quoted_path}' if the_type == 'dir' else f'./download_file/{quoted_name}',
            "size": size,
            "ctime": time_str,
            "type": the_type,
            'jm_view': jm_view,
            'first_img_url': first_img_url
        }

    def get_files_data(self, path):
        files = list(filter(bool, map(self.build_one_path_info, self.files_of_dir_safe(path))))
        self.current_path = path
        files = self.sort_files(files)
        return files

    def sort_files(self, files: list):
        def natural_key(item):
            return [int(text) if text.isdigit() else text.lower()
                    for text in re.split(r'(\d+)', item['name'])]

        # Split into groups
        jm_albums = []
        other_dirs = []
        other_files = []

        for f in files:
            if f['jm_view']:
                jm_albums.append(f)
            elif f['type'] == 'dir':
                other_dirs.append(f)
            else:
                other_files.append(f)

        # Sort each group
        jm_albums.sort(key=natural_key)
        other_dirs.sort(key=natural_key)
        other_files.sort(key=natural_key)

        return jm_albums + other_dirs + other_files

    def get_file_type(self, file_path):
        if os.path.isfile(file_path):
            the_type = 'file'
            jm_view = self.check_dir_can_open_jm_view(common.of_dir_path(file_path))
        else:
            the_type = 'dir'
            jm_view = self.check_dir_can_open_jm_view(file_path)
        return jm_view, the_type

    @staticmethod
    def get_target_path(lnk_path: str) -> str:
        try:
            import pylnk3
            lnk = pylnk3.parse(lnk_path)
            return lnk.path.replace("\\", '/').replace("//", '/')  # 获取目标文件/文件夹路径
        except Exception as e:
            return lnk_path

    @staticmethod
    def file_size_format(size, the_type):
        if the_type == 'dir':
            return '<DIR>'
        else:
            if size < 1024:
                return '%i' % size + ' B'
            elif 1024 < size <= 1048576:
                return '%.1f' % float(size / 1024) + ' KB'
            elif 1048576 < size <= 1073741824:
                return '%.1f' % float(size / 1048576) + ' MB'
            elif 1073741824 < size <= 1099511627776:
                return '%.1f' % float(size / 1073741824) + ' GB'

    def get_current_path(self):
        return self.current_path
