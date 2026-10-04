import json
import shutil
from pathlib import Path

import pytest

from jm_view_server.app import JmServer


@pytest.fixture
def recycling(tmp_path, monkeypatch):
    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    shared = tmp_path / 'shared'
    shared.mkdir()
    trash = tmp_path / 'trash'
    trash.mkdir()
    calls = []

    def recycle(path):
        calls.append(path)
        shutil.move(path, str(trash / Path(path).name))

    monkeypatch.setattr('jm_view_server.routes.files.send2trash', recycle)
    server = JmServer(str(shared), '')
    server.register_routes()
    return server, tmp_path, shared, trash, calls


@pytest.mark.parametrize('directory', [False, True])
def test_single_recycles_outside_shared_root(recycling, directory):
    server, root, _, trash, calls = recycling
    item = root / '中文 & item'
    if directory:
        item.mkdir()
        content = item / 'child.txt'
    else:
        content = item
    content.write_bytes(b'recoverable content')
    response = server.app.test_client().post('/api/delete', data={'path': str(item)})
    assert response.status_code == 200
    assert response.json == {'status': 'ok'}
    assert calls == [str(item)]
    assert not item.exists()
    recovered = trash / item.name / 'child.txt' if directory else trash / item.name
    assert recovered.read_bytes() == b'recoverable content'


def test_recycling_failure_preserves_original(recycling, monkeypatch):
    server, root, _, _, _ = recycling
    item = root / 'keep.txt'
    item.write_bytes(b'keep')

    def fail(path):
        raise OSError('recycle bin unavailable')

    monkeypatch.setattr('jm_view_server.routes.files.send2trash', fail)
    response = server.app.test_client().post('/api/delete', data={'path': str(item)})
    assert response.status_code == 500
    assert '移入回收站失败' in response.json['error']
    assert item.read_bytes() == b'keep'


@pytest.mark.parametrize('as_json', [False, True])
def test_batch_reports_each_result_and_continues(recycling, monkeypatch, as_json):
    server, root, shared, trash, _ = recycling
    items = [root / name for name in ('first.txt', 'denied.txt', 'last.txt')]
    for item in items:
        item.write_bytes(item.name.encode())

    def recycle(path):
        if path == str(items[1]):
            raise PermissionError('denied')
        shutil.move(path, str(trash / Path(path).name))

    monkeypatch.setattr('jm_view_server.routes.files.send2trash', recycle)
    paths = [str(items[0]), str(items[1]), str(shared), str(root / 'missing'), str(items[2])]
    response = server.app.test_client().post('/api/batch_delete', data={
        'paths': json.dumps(paths) if as_json else '\n'.join(paths),
    })
    assert response.status_code == 200
    assert response.json['succeeded'] == [str(items[0]), str(items[2])]
    assert [entry['path'] for entry in response.json['failed']] == paths[1:4]
    assert '移入回收站失败' in response.json['failed'][0]['error']
    assert items[1].read_bytes() == b'denied.txt'
    assert shared.is_dir()
    for item in (items[0], items[2]):
        assert (trash / item.name).read_bytes() == item.name.encode()


def test_access_and_path_guards_precede_recycling(recycling):
    server, root, shared, _, calls = recycling
    client = server.app.test_client()
    assert client.post('/api/delete').status_code == 400
    assert client.post('/api/delete', data={'path': str(root / 'missing')}).status_code == 404
    for path in (str(shared), str(Path(root.anchor))):
        assert client.post('/api/delete', data={'path': path}).status_code == 403
    server.password = 'test-password'
    assert client.post('/api/delete', data={'path': str(shared)}).status_code == 403
    assert client.post('/api/batch_delete', data={'paths': str(shared)}).status_code == 403
    assert calls == []


def test_symbolic_link_recycles_link_not_target(recycling):
    server, root, _, trash, calls = recycling
    target = root / 'target.txt'
    target.write_bytes(b'keep target')
    link = root / 'link.txt'
    try:
        link.symlink_to(target)
    except OSError:
        pytest.skip('Symbolic links unavailable for this account')
    response = server.app.test_client().post('/api/delete', data={'path': str(link)})
    assert response.status_code == 200
    assert calls == [str(link)]
    assert (trash / link.name).is_symlink()
    assert target.read_bytes() == b'keep target'
