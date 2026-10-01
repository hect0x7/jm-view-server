"""
后端接口验收：打包下载(#5) / 文件管理 rename-mkdir-move(#7) / 批量删除(#10)。
用 conftest.py 的 live_server fixture（提供 live_server.url 和 live_server.root=测试数据根），
用 requests 直接打接口。测试数据：漫画A/images/*5张jpg、漫画B/*3png、cover.jpg、readme.txt、空文件夹。
"""
import io
import gzip
import html
import json
import ntpath
import os
import re
import zipfile
from pathlib import Path
from urllib.parse import quote
from unittest import mock

import requests


def test_settings_page_route(live_server):
    response = requests.get(live_server.url + '/settings')
    assert response.status_code == 200
    assert '<title>设置 · jm-view-server</title>' in response.text
    assert 'id="readerModeSegment"' in response.text


def test_message_page_loads_split_assets(live_server):
    response = requests.get(live_server.url + '/message')
    assert response.status_code == 200
    assert '/static/css/message-page.css' in response.text
    assert '/static/js/message-page.js' in response.text
    assert '/static/js/app-shell.js' in response.text
    assert response.text.index('/static/js/app.js') < response.text.index('/static/js/app-shell.js')
    assert response.text.index('/static/js/app-shell.js') < response.text.index('/static/js/message-page.js')
    assert 'id="messageConfig"' in response.text
    assert '<style>' not in response.text

    message_css = requests.get(live_server.url + '/static/css/message-page.css')
    assert message_css.status_code == 200
    assert '.message-bubble' in message_css.text
    assert 'white-space: pre-wrap' in message_css.text
    assert 'overflow-wrap: anywhere' in message_css.text
    assert requests.get(live_server.url + '/static/js/message-page.js').status_code == 200


def test_index_page_loads_split_assets(live_server):
    response = requests.get(live_server.url + '/')
    assert response.status_code == 200
    assert '/static/css/index-page.css' in response.text
    assert '/static/js/index-page.js' in response.text
    assert '/static/js/app-shell.js' in response.text
    assert response.text.index('/static/js/app.js') < response.text.index('/static/js/app-shell.js')
    assert response.text.index('/static/js/app-shell.js') < response.text.index('/static/js/index-page.js')
    for script_name in ('app.js', 'app-shell.js', 'index.js', 'column-view.js', 'common.js', 'index-page.js'):
        assert f'<script defer src="/static/js/{script_name}?' in response.text
    assert response.text.index('/static/css/index-page.css') < response.text.index('/static/js/app.js')
    assert 'id="browserConfig"' in response.text
    assert 'data-browser-icon=' in response.text
    assert '<style>' not in response.text

    assert requests.get(live_server.url + '/static/css/index-page.css').status_code == 200
    assert requests.get(live_server.url + '/static/js/index-page.js').status_code == 200

def test_large_html_response_uses_gzip_with_matching_content_length(live_server):
    response = requests.get(
        live_server.url + '/', headers={'Accept-Encoding': 'gzip'}, stream=True)
    response.raw.decode_content = False
    compressed = response.raw.read()
    assert response.status_code == 200
    assert response.headers.get('Content-Encoding') == 'gzip'
    assert response.headers.get('Vary') == 'Accept-Encoding'
    assert int(response.headers['Content-Length']) == len(compressed)
    assert b'<!DOCTYPE html>' in gzip.decompress(compressed)[:256]


def test_index_renders_mobile_list_thumbnails_and_defers_grid_covers():
    root = Path(__file__).resolve().parents[1]
    index_html = (root / 'src/jm_view_server/templates/index.html').read_text(encoding='utf-8')
    index_js = (root / 'src/jm_view_server/static/js/index-page.js').read_text(encoding='utf-8')
    app_js = (root / 'src/jm_view_server/static/js/app.js').read_text(encoding='utf-8')

    thumbnail_url = '{{ file.first_img_url.data_thumb or file.first_img_url.data_original }}'
    assert index_html.count(thumbnail_url) == 2
    assert '<img {% if loop.index <= 4 %}src{% else %}data-thumb-src{% endif %}=' in index_html
    assert f'data-thumb-src="{thumbnail_url}"' in index_html
    assert 'alt="preview"' not in index_html
    assert index_html.count('decoding="async"') >= 2
    assert '<script defer src="/static/js/index-page.js?' in index_html
    assert index_html.count('/static/js/index-page.js?') == 1
    assert 'class="file-item{% if file.first_img_url' in index_html
    assert 'class="preview-img"' in index_html
    assert 'class="file-icon"' in index_html and 'aria-hidden="true"' in index_html
    for icon_id in ('crumbs-home', 'netIco', 'copyIco', 'backIco', 'homeIco', 'openCurIco',
                    'recentIco', 'mkdirIco', 'selectIco', 'starIco', 'uploadIco', 'filterIco',
                    'segList', 'segGrid', 'segColumn'):
        assert re.search(r'id="' + re.escape(icon_id) + r'"[^>]*>\s*<svg', index_html)
    assert 'M2.1 12.35' in index_html and 'M2.1 12.35' in app_js
    assert '7-10 7-10-7' not in index_html and '7-10 7-10-7' not in app_js
    assert 'function activateViewThumbnails(mode)' in index_js
    assert "'IntersectionObserver' in window" in index_js
    assert "{ rootMargin: '240px 0px' }" in index_js
    assert "mode === 'list' && !!img.closest('.list-view')" in index_js
    assert "mode === 'grid' && !!img.closest('.grid-view')" in index_js
    assert 'desktopListPreviewQuery' not in index_js
    assert "if (el.querySelector('svg')) return;" in index_js
    assert "if (!el.querySelector('svg') && markup)" in index_js
    assert 'if (thumbnailObserver) thumbnailObserver.observe(img);' in index_js
    assert 'activateViewThumbnails(mode);' in index_js

def test_reader_page_loads_split_assets(live_server):
    album = os.path.join(live_server.root, '漫画A', 'images')
    response = requests.get(
        live_server.url + '/jm_view',
        params={'path': album, 'openFromDir': os.path.dirname(album)},
    )
    assert response.status_code == 200
    reader_css_files = ('reader-base.css', 'reader-modes.css', 'reader-toolbar.css', 'reader-contact-sheet.css', 'reader-extras.css')
    reader_js_files = ('reader-core.js', 'reader-preferences.js', 'reader-modes.js', 'reader-contact-sheet.js', 'reader-controls.js')
    for filename in reader_css_files:
        assert f'/static/css/{filename}' in response.text
    for filename in reader_js_files:
        assert f'/static/js/{filename}' in response.text
    assert 'id="readerConfig"' in response.text
    assert response.text.index('/static/js/app.js') < response.text.index('/static/js/reader-core.js')
    css_positions = [response.text.index(f'/static/css/{filename}') for filename in reader_css_files]
    js_positions = [response.text.index(f'/static/js/{filename}') for filename in reader_js_files]
    assert css_positions == sorted(css_positions)
    assert js_positions == sorted(js_positions)
    assert re.search(
        r'id="tOpenFolder"[^>]+aria-label="(?:在访达中打开|在资源管理器中打开|打开当前文件夹)"',
        response.text,
    )
    config_match = re.search(
        r'<script id="readerConfig" type="application/json">(.*?)</script>',
        response.text,
        re.DOTALL,
    )
    assert config_match is not None
    assert json.loads(config_match.group(1))['albumPath'] == os.path.abspath(album)


def test_reader_preserves_literal_html_entity_in_path(live_server):
    album = os.path.join(live_server.root, 'Title &amp; Subtitle')
    os.makedirs(album)
    image_path = os.path.join(album, '107.png')
    Path(image_path).write_bytes(b'fake image data')

    response = requests.get(
        live_server.url + '/jm_view',
        params={'path': image_path, 'openFromDir': album},
    )
    assert response.status_code == 200

    config_match = re.search(
        r'<script id="readerConfig" type="application/json">(.*?)</script>',
        response.text,
        re.DOTALL,
    )
    assert config_match is not None
    reader_config = json.loads(config_match.group(1))
    assert reader_config['albumPath'] == os.path.abspath(album)
    assert reader_config['openFromDir'] == quote(album)

    api_response = requests.get(
        live_server.url + '/api/jm_images', params={'path': album})
    assert api_response.status_code == 200
    assert api_response.json()['full_path'] == os.path.abspath(album)

    note_path = os.path.join(album, 'note.txt')
    Path(note_path).write_bytes(b'literal entity path')
    download_response = requests.get(
        live_server.url + '/download_file/note.txt', params={'dir': album})
    assert download_response.status_code == 200
    assert download_response.content == b'literal entity path'


def test_upload_page_shows_target_directory(live_server):
    response = requests.get(live_server.url + '/upload_file')
    assert response.status_code == 200
    assert 'id="uploadTarget"' in response.text
    assert os.path.abspath(live_server.root) in response.text


def test_upload_response_contains_saved_target(live_server):
    response = requests.post(
        live_server.url + '/upload_file',
        files={'file': ('upload-target.txt', b'upload target test')},
    )
    assert response.status_code == 200
    body = response.json()
    target_path = os.path.join(os.path.abspath(live_server.root), 'upload-target.txt')
    assert body['status'] == 'ok'
    assert body['target_dir'] == os.path.abspath(live_server.root)
    assert body['target_path'] == target_path
    assert os.path.isfile(target_path)


def test_upload_accepts_multiple_files_in_one_request(live_server):
    response = requests.post(
        live_server.url + '/upload_file',
        files=[
            ('file', ('first.txt', b'first file')),
            ('file', ('second.txt', b'second file')),
        ],
    )
    assert response.status_code == 200
    body = response.json()
    expected_paths = [
        os.path.join(os.path.abspath(live_server.root), 'first.txt'),
        os.path.join(os.path.abspath(live_server.root), 'second.txt'),
    ]
    assert body['status'] == 'ok'
    assert body['uploaded_count'] == 2
    assert body['filenames'] == ['first.txt', 'second.txt']
    assert body['target_paths'] == expected_paths
    assert [Path(path).read_bytes() for path in expected_paths] == [b'first file', b'second file']


def test_upload_page_enables_multiple_selection(live_server):
    response = requests.get(live_server.url + '/upload_file')
    assert response.status_code == 200
    assert re.search(r'<input[^>]+id="file"[^>]+multiple', response.text)


def _upload_target_from_html(response):
    match = re.search(r'id="uploadTarget">([^<]+)</div>', response.text)
    assert match is not None
    return html.unescape(match.group(1))


def test_upload_explicit_target_get_post_and_missing_directory(live_server):
    target_dir = os.path.join(live_server.root, '漫画B')
    response = requests.get(
        live_server.url + '/upload_file', params={'path': target_dir})
    assert response.status_code == 200
    assert _upload_target_from_html(response) == os.path.abspath(target_dir)

    response = requests.post(
        live_server.url + '/upload_file',
        data={'path': target_dir},
        files={'file': ('explicit-target.txt', b'explicit upload target')},
    )
    assert response.status_code == 200
    target_path = os.path.join(os.path.abspath(target_dir), 'explicit-target.txt')
    assert response.json()['target_dir'] == os.path.abspath(target_dir)
    assert response.json()['target_path'] == target_path
    assert os.path.isfile(target_path)

    missing_dir = os.path.join(live_server.root, 'missing-upload-target')
    get_missing = requests.get(
        live_server.url + '/upload_file', params={'path': missing_dir})
    assert get_missing.status_code == 404
    post_missing = requests.post(
        live_server.url + '/upload_file',
        data={'path': missing_dir},
        files={'file': ('not-created.txt', b'must not be written')},
    )
    assert post_missing.status_code == 404
    assert post_missing.json()['message'] == '上传目标目录不存在'
    assert not os.path.exists(os.path.join(missing_dir, 'not-created.txt'))


def test_list_files_does_not_change_global_upload_target(live_server):
    before = requests.get(live_server.url + '/upload_file')
    assert before.status_code == 200
    initial_target = _upload_target_from_html(before)

    listed_dir = os.path.join(live_server.root, '漫画B')
    response = requests.get(
        live_server.url + '/api/list_files', params={'path': listed_dir})
    assert response.status_code == 200
    assert os.path.normcase(os.path.realpath(response.json()['currentPath'])) == (
        os.path.normcase(os.path.realpath(listed_dir)))

    after = requests.get(live_server.url + '/upload_file')
    assert after.status_code == 200
    assert _upload_target_from_html(after) == initial_target


def _p(root, *parts):
    return os.path.join(root, *parts)


# ===== #5 打包下载 =====

def test_download_zip_small_memory(live_server):
    """小目录内存打包：漫画A 下 5 张图能被 zipfile 正常打开，namelist 含 5 张。"""
    target = _p(live_server.root, '漫画A', 'images')
    resp = requests.get(live_server.url + '/api/download_zip', params={'path': target})
    assert resp.status_code == 200
    assert resp.headers.get('Content-Type', '').startswith('application/zip')
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert len(names) == 5
    assert all(n.endswith('.jpg') for n in names)


def test_download_zip_large_tempfile_branch(live_server):
    """把阈值临时调到 0，强制走“大目录写临时文件”分支，仍应返回可解压的 zip。"""
    from jm_view_server.app import JmServer
    orig = JmServer.ZIP_MEMORY_THRESHOLD
    JmServer.ZIP_MEMORY_THRESHOLD = 0  # 阈值为 0 → total(>0) 必走临时文件分支
    try:
        target = _p(live_server.root, '漫画B')
        resp = requests.get(live_server.url + '/api/download_zip', params={'path': target})
        assert resp.status_code == 200
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        assert len(zf.namelist()) == 3
    finally:
        JmServer.ZIP_MEMORY_THRESHOLD = orig


def test_download_zip_no_images_404(live_server):
    """空文件夹无图片 → 404。"""
    resp = requests.get(live_server.url + '/api/download_zip',
                        params={'path': _p(live_server.root, '空文件夹')})
    assert resp.status_code == 404


def test_download_zip_escape_root_denied(live_server):
    """穿越到根外 → 拒绝。"""
    resp = requests.get(live_server.url + '/api/download_zip',
                        params={'path': _p(live_server.root, '..')})
    assert resp.status_code == 403


# ===== #7 rename =====

def test_rename_ok(live_server):
    src = _p(live_server.root, 'readme.txt')
    resp = requests.post(live_server.url + '/api/rename',
                         data={'path': src, 'new_name': 'renamed.txt'})
    assert resp.status_code == 200
    assert not os.path.exists(src)
    assert os.path.exists(_p(live_server.root, 'renamed.txt'))


def test_rename_invalid_name_rejected(live_server):
    src = _p(live_server.root, 'cover.jpg')
    for bad in ['a/b.jpg', '..', '']:
        resp = requests.post(live_server.url + '/api/rename',
                             data={'path': src, 'new_name': bad})
        assert resp.status_code == 400, bad
    # 文件未变
    assert os.path.exists(src)


# ===== #7 mkdir =====

def test_mkdir_ok(live_server):
    resp = requests.post(live_server.url + '/api/mkdir',
                         data={'parent': live_server.root, 'name': '新建目录'})
    assert resp.status_code == 200
    assert os.path.isdir(_p(live_server.root, '新建目录'))


def test_mkdir_duplicate_and_invalid(live_server):
    # 重名（漫画A 已存在）
    resp = requests.post(live_server.url + '/api/mkdir',
                         data={'parent': live_server.root, 'name': '漫画A'})
    assert resp.status_code == 409
    # 非法名
    resp = requests.post(live_server.url + '/api/mkdir',
                         data={'parent': live_server.root, 'name': '../x'})
    assert resp.status_code == 400


# ===== #7 move =====

def test_move_ok(live_server):
    src = _p(live_server.root, 'cover.jpg')
    dst_dir = _p(live_server.root, '漫画B')
    resp = requests.post(live_server.url + '/api/move',
                         data={'src': src, 'dst_dir': dst_dir})
    assert resp.status_code == 200
    assert not os.path.exists(src)
    assert os.path.exists(_p(dst_dir, 'cover.jpg'))


def test_move_to_dangerous_path_denied(live_server):
    """移动到危险/根外路径被拒，源文件不动。"""
    src = _p(live_server.root, 'cover.jpg')
    resp = requests.post(live_server.url + '/api/move',
                         data={'src': src, 'dst_dir': _p(live_server.root, '..')})
    assert resp.status_code == 403
    assert os.path.exists(src)


# ===== 安全护栏（删除可操作已浏览路径，rename/move 仍限制在共享根内） =====

def test_delete_outside_shared_root_allowed(live_server, tmp_path):
    """浏览器可进入共享根外目录时，单删和批删也能删除其中的普通项目。"""
    outside_single = tmp_path / 'outside-single.txt'
    outside_batch = tmp_path / 'outside-batch.txt'
    outside_single.write_text('delete me')
    outside_batch.write_text('delete me too')

    resp = requests.post(live_server.url + '/api/delete',
                         data={'path': str(outside_single)})
    assert resp.status_code == 200
    assert not outside_single.exists()

    resp = requests.post(live_server.url + '/api/batch_delete',
                         data={'paths': str(outside_batch)})
    assert resp.status_code == 200
    assert resp.json()['succeeded'] == [str(outside_batch)]
    assert not outside_batch.exists()


def test_delete_protects_shared_root_drive_root_and_windows_system_dirs(live_server):
    shared_root = requests.post(
        live_server.url + '/api/delete', data={'path': live_server.root})
    assert shared_root.status_code == 403
    assert 'default shared root' in shared_root.json()['error']
    assert os.path.isdir(live_server.root)

    drive_root_path = os.path.abspath(os.sep)
    drive_root = requests.post(
        live_server.url + '/api/delete', data={'path': drive_root_path})
    assert drive_root.status_code == 403
    assert 'drive root' in drive_root.json()['error']

    batch_root = requests.post(
        live_server.url + '/api/batch_delete', data={'paths': live_server.root})
    assert batch_root.status_code == 200
    assert batch_root.json()['succeeded'] == []
    assert 'default shared root' in batch_root.json()['failed'][0]['error']

    from jm_view_server import app as app_module
    from jm_view_server.app import JmServer
    server = JmServer(live_server.root, '')
    with mock.patch.object(app_module.os, 'path', ntpath):
        _, error = server._guard_dangerous_path(r'C:\Windows\System32')
    assert error == (
        'Permission denied: Cannot operate on critical system directories.', 403)


def test_rename_and_move_outside_root_still_denied(live_server, tmp_path):
    """放开删除不影响 rename/move 的共享根边界。"""
    outside = tmp_path / 'outside.txt'
    outside.write_text('keep')
    for endpoint, data in [
        ('/api/rename', {'path': str(outside), 'new_name': 'x.txt'}),
        ('/api/move', {'src': str(outside), 'dst_dir': live_server.root}),
    ]:
        resp = requests.post(live_server.url + endpoint, data=data)
        assert resp.status_code == 403, endpoint
    assert outside.exists()


# ===== #10 batch_delete =====

def test_batch_delete_all_ok(live_server):
    paths = [_p(live_server.root, '漫画B'), _p(live_server.root, 'cover.jpg')]
    resp = requests.post(live_server.url + '/api/batch_delete',
                         data={'paths': '\n'.join(paths)})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body['succeeded']) == 2
    assert body['failed'] == []
    assert not os.path.exists(paths[0])
    assert not os.path.exists(paths[1])


def test_batch_delete_partial(live_server):
    """含一个不存在的路径 → 部分成功，failed 报告不存在项。"""
    good = _p(live_server.root, 'cover.jpg')
    missing = _p(live_server.root, 'nope-does-not-exist')
    resp = requests.post(live_server.url + '/api/batch_delete',
                         data={'paths': good + '\n' + missing})
    assert resp.status_code == 200
    body = resp.json()
    assert good in body['succeeded']
    assert any(f['path'] == missing for f in body['failed'])
    assert not os.path.exists(good)


def test_open_directory_with_spaces_and_special_chars(live_server, tmp_path):
    """测试包含空格、特殊括号、日文等复杂目录名时的打开目录命令构造"""
    complex_dir = tmp_path / "きょくちょ" / "[きょくちょ局 (きょくちょ)] メイド教育1.1"
    complex_dir.mkdir(parents=True)

    with mock.patch('subprocess.Popen') as mock_popen, mock.patch('sys.platform', 'win32'):
        # 1. 默认 reveal=1 (在资源管理器中选中)
        resp = requests.get(live_server.url + f'/open/{complex_dir.as_posix()}')
        assert resp.status_code == 200
        assert resp.json()['status'] == 'ok'
        mock_popen.assert_called_once()
        called_arg = mock_popen.call_args[0][0]
        expected_norm = os.path.normpath(str(complex_dir))
        assert called_arg == f'explorer /select,"{expected_norm}"'

    with mock.patch('subprocess.Popen') as mock_popen, mock.patch('sys.platform', 'win32'):
        # 2. reveal=0 (直接进入目录)
        resp = requests.get(live_server.url + f'/open/{complex_dir.as_posix()}?reveal=0')
        assert resp.status_code == 200
        assert resp.json()['status'] == 'ok'
        mock_popen.assert_called_once()
        called_arg = mock_popen.call_args[0][0]
        expected_norm = os.path.normpath(str(complex_dir))
        assert called_arg == f'explorer "{expected_norm}"'


def test_get_jm_view_images_natural_sorting(live_server, tmp_path):
    """验证看本模式图片自然排序：未补零、前缀、中间插页(20-1.jpg)均正确排序"""
    from jm_view_server.files import FileManager
    fm = FileManager(str(tmp_path), '')

    album_dir = tmp_path / "test_album"
    album_dir.mkdir()

    # 创建一组具有各种边界特性的图片文件
    files_to_create = [
        '10.png', '1.png', '2.png', '20.png', '100.png',
        '19.jpg', '20-1.jpg', '20-2.jpg', '21.jpg',
        'MJK-01.png', 'MJK-02.png', 'MJK-10.png'
    ]
    for fname in files_to_create:
        (album_dir / fname).write_bytes(b'dummy')

    images = fm.get_jm_view_images(str(album_dir))
    filenames = [img['filename'] for img in images]

    # 1. 验证 1, 2, 10, 20, 100 不会变成 1, 10, 2
    assert filenames.index('1.png') < filenames.index('2.png') < filenames.index('10.png') < filenames.index('20.png') < filenames.index('100.png')

    # 2. 验证 20-1, 20-2 插页紧随 20 并位于 21 之前
    assert filenames.index('19.jpg') < filenames.index('20-1.jpg') < filenames.index('20-2.jpg') < filenames.index('21.jpg')

    # 3. 验证带前缀的汉化组编号按数字自然排序
    assert filenames.index('MJK-01.png') < filenames.index('MJK-02.png') < filenames.index('MJK-10.png')


def test_thumbnail_endpoint_and_cache(live_server):
    """测试 /api/thumb 纯内存缩略图生成、ETag 协商缓存与 404 拦截"""
    img_path = os.path.join(live_server.root, 'cover.jpg')
    assert os.path.exists(img_path)

    # 1. 首次请求生成缩略图
    resp = requests.get(live_server.url + '/api/thumb', params={'path': img_path})
    assert resp.status_code == 200
    assert resp.headers.get('Content-Type') in ('image/webp', 'image/jpeg')
    assert 'Cache-Control' in resp.headers
    etag = resp.headers.get('ETag')
    assert etag is not None
    assert len(resp.content) > 0

    # 2. 带 ETag 协商缓存，验证 304 Not Modified
    resp_cached = requests.get(
        live_server.url + '/api/thumb',
        params={'path': img_path},
        headers={'If-None-Match': etag}
    )
    assert resp_cached.status_code == 304

    # 3. 请求不存在的文件返回 404
    resp_404 = requests.get(
        live_server.url + '/api/thumb',
        params={'path': os.path.join(live_server.root, 'non-existent.jpg')}
    )
    assert resp_404.status_code == 404
