import os

from jm_view_server.files import FileManager


def test_link_keeps_shortcut_identity_and_exposes_target(tmp_path, monkeypatch):
    target = tmp_path / '目标目录'
    target.mkdir()
    shortcut = tmp_path / '入口.lnk'
    shortcut.write_bytes(b'lnk')

    manager = FileManager(str(tmp_path), str(tmp_path))
    monkeypatch.setattr(manager, 'get_target_path', lambda _: str(target))

    info = manager.build_one_path_info(str(shortcut))

    assert info['name'] == '入口.lnk'
    assert info['is_link'] is True
    assert info['type'] == 'dir'
    assert info['target_path'] == str(target)
    assert info['path'] == str(target)
    assert info['manage_quoted_path'] != info['quoted_path']


def test_broken_link_does_not_recurse(tmp_path, monkeypatch):
    shortcut = tmp_path / '失效入口.lnk'
    shortcut.write_bytes(b'lnk')

    manager = FileManager(str(tmp_path), str(tmp_path))
    monkeypatch.setattr(manager, 'get_target_path', lambda _: None)

    info = manager.build_one_path_info(str(shortcut))

    assert info['is_link'] is True
    assert info['link_broken'] is True
    assert info['target_type'] == 'missing'
    assert info['target_path'] == '无法解析目标'
    assert info['href'] == 'javascript:void(0)'


def test_circular_link_is_reported_as_broken(tmp_path, monkeypatch):
    shortcut = tmp_path / '循环入口.lnk'
    shortcut.write_bytes(b'lnk')

    manager = FileManager(str(tmp_path), str(tmp_path))
    monkeypatch.setattr(manager, 'get_target_path', lambda _: str(shortcut))

    info = manager.build_one_path_info(str(shortcut))

    assert info['link_broken'] is True
    assert info['target_path'] == '检测到循环链接'
