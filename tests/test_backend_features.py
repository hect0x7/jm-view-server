"""
后端接口验收：打包下载(#5) / 文件管理 rename-mkdir-move(#7) / 批量删除(#10)。
用 conftest.py 的 live_server fixture（提供 live_server.url 和 live_server.root=测试数据根），
用 requests 直接打接口。测试数据：漫画A/images/*5张jpg、漫画B/*3png、cover.jpg、readme.txt、空文件夹。
"""
import io
import os
import zipfile

import requests


def test_settings_page_route(live_server):
    response = requests.get(live_server.url + '/settings')
    assert response.status_code == 200
    assert '<title>设置 · jm-view-server</title>' in response.text
    assert 'id="readerModeSegment"' in response.text


def test_reader_page_loads_split_assets(live_server):
    album = os.path.join(live_server.root, '漫画A', 'images')
    response = requests.get(
        live_server.url + '/jm_view',
        params={'path': album, 'openFromDir': os.path.dirname(album)},
    )
    assert response.status_code == 200
    assert '/static/css/reader.css' in response.text
    assert '/static/js/reader.js' in response.text
    assert 'id="readerConfig"' in response.text


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


# ===== 安全护栏（rename/move/delete 穿越到根外被拒） =====

def test_guard_traversal_outside_root(live_server, tmp_path):
    """在 root 外造一个文件，用 .. 穿越去 rename/move/delete，都应被拒，外部文件不动。"""
    outside = tmp_path / 'outside.txt'
    outside.write_text('keep')
    # 用相对穿越路径指向外部文件
    escape = os.path.join(live_server.root, '..', '..',
                          os.path.relpath(str(outside), os.path.dirname(os.path.dirname(live_server.root))))
    # 直接用绝对外部路径也应被 within_root 拦下
    for endpoint, data in [
        ('/api/delete', {'path': str(outside)}),
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
