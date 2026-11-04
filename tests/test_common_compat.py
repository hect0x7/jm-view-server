import os
import sys
import time
import warnings

from jm_view_server import common
from jm_view_server.app import JmServer
from jm_view_server.files import FileManager


def test_internal_common_helpers(tmp_path):
    album_dir = tmp_path / 'v1.0.album'
    album_dir.mkdir()
    img_b = album_dir / '02.jpg'
    img_a = album_dir / '01.png'
    img_b.write_bytes(b'b')
    img_a.write_bytes(b'a')

    fixed_dir = common.fix_filepath(str(album_dir))
    assert fixed_dir.endswith('/')
    assert '\\' not in fixed_dir
    assert '//' not in fixed_dir[2:]

    fixed_file = common.fix_filepath(str(img_a))
    assert not fixed_file.endswith('/')
    assert '\\' not in fixed_file

    assert common.fix_filepath('') == ''
    assert common.file_not_exists(str(album_dir / 'missing.jpg')) is True
    assert common.file_not_exists(str(img_a)) is False

    assert common.of_file_name(str(img_a)) == '01.png'
    assert common.of_file_name(str(img_a), trim_suffix=True) == '01'
    # 父目录名含点号、文件名不含点号时，trim_suffix 不应误截父目录
    no_ext = album_dir / 'readme'
    assert common.of_file_name(str(no_ext), trim_suffix=True) == 'readme'
    assert common.of_file_name(str(album_dir)) == 'v1.0.album'

    nested_file = tmp_path / 'auto_mkdir' / 'sub' / 'x.txt'
    parent_dir = common.of_dir_path(str(nested_file), mkdir=True)
    assert os.path.isdir(parent_dir)

    listed = common.files_of_dir(str(album_dir))
    assert listed == [fixed_dir + '01.png', fixed_dir + '02.jpg']

    ts = 1700000000.0
    expected_ts = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts))
    assert common.format_ts(ts) == expected_ts
    assert len(common.format_ts()) == 19
    assert hasattr(common.current_thread(), 'name')


def test_server_runs_without_external_common_module(tmp_path, monkeypatch):
    # 模拟未安装 commonX 的环境，确保任何顶层 `import common` 都会立即失败
    monkeypatch.setitem(sys.modules, 'common', None)

    album_dir = tmp_path / '测试本子'
    album_dir.mkdir()
    (album_dir / '1.jpg').write_bytes(b'\xff\xd8\xff\xd9')
    (album_dir / '2.jpg').write_bytes(b'\xff\xd8\xff\xd9')

    fm = FileManager(str(tmp_path), str(tmp_path))
    files_data = fm.get_files_data(str(tmp_path))
    assert len(files_data) == 1
    assert files_data[0]['name'] == '测试本子'
    assert files_data[0]['jm_view'] is True

    jm_view_flag, ftype = fm.get_file_type(str(album_dir / '1.jpg'))
    assert (jm_view_flag, ftype) == (True, 'file')

    server = JmServer(str(tmp_path), '')
    server.register_routes()
    client = server.app.test_client()

    for url in (
        '/',
        '/spa',
        '/api/list_files',
        f'/api/album_images?path={album_dir}',
        f'/jm_view?path={album_dir}',
        f'/api/jm_images?path={album_dir}',
        f'/api/download_zip?path={album_dir}',
    ):
        resp = client.get(url)
        assert resp.status_code == 200, (url, resp.status_code)


def test_hook_jm_logging_supports_exception_arg_without_warning(tmp_path, monkeypatch):
    import jmcomic

    monkeypatch.setitem(sys.modules, 'common', None)
    original_logger = jmcomic.JmModuleConfig.EXECUTOR_LOG
    try:
        server = JmServer(str(tmp_path), '', jm_option=object())
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            jmcomic.jm_log('test.info', '开始下载')
            jmcomic.jm_log('test.err', '请求异常', RuntimeError('timeout'))
            jmcomic.jm_log('test.exc_only', ValueError('bad id'))

        assert [w for w in caught if issubclass(w.category, UserWarning)] == []
        msg1 = server.jm_log_msg_queue.get_nowait()
        msg2 = server.jm_log_msg_queue.get_nowait()
        msg3 = server.jm_log_msg_queue.get_nowait()
        assert '【test.info】开始下载\n' in msg1
        assert '【test.err】请求异常: timeout\n' in msg2
        assert '【test.exc_only】bad id\n' in msg3
    finally:
        jmcomic.JmModuleConfig.EXECUTOR_LOG = original_logger
