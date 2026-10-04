import pytest

from jm_view_server.app import JmServer


@pytest.fixture
def paths(tmp_path, monkeypatch):
    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    shared = tmp_path / 'shared'
    outside = tmp_path / 'outside'
    shared.mkdir()
    outside.mkdir()
    server = JmServer(str(shared), '')
    server.register_routes()
    return server, shared, outside


def test_rename_and_mkdir_outside_shared_root(paths):
    server, _, outside = paths
    client = server.app.test_client()
    source = outside / 'old.txt'
    source.write_text('preserve contents', encoding='utf-8')
    response = client.post('/api/rename', data={'path': str(source), 'new_name': 'new.txt'})
    assert response.status_code == 200
    assert (outside / 'new.txt').read_text(encoding='utf-8') == 'preserve contents'
    assert not source.exists()
    assert client.post('/api/mkdir', data={'parent': str(outside), 'name': 'child'}).status_code == 200
    assert (outside / 'child').is_dir()


@pytest.mark.parametrize('source_outside', [True, False])
def test_move_across_shared_root_boundary(paths, source_outside):
    server, shared, outside = paths
    parent, destination = (outside, shared) if source_outside else (shared, outside)
    source = parent / 'move.txt'
    source.write_bytes(b'file contents')
    response = server.app.test_client().post('/api/move', data={'src': str(source), 'dst_dir': str(destination)})
    assert response.status_code == 200
    assert not source.exists()
    assert (destination / 'move.txt').read_bytes() == b'file contents'


def test_required_access_and_input_checks_still_apply(paths):
    server, shared, outside = paths
    source = outside / 'file.txt'
    source.write_bytes(b'keep')
    client = server.app.test_client()
    assert client.post('/api/rename', data={'path': str(source), 'new_name': '../invalid'}).status_code == 400
    assert client.post('/api/mkdir', data={'parent': str(outside), 'name': '../invalid'}).status_code == 400
    assert client.post('/api/rename', data={'path': str(shared), 'new_name': 'other'}).status_code == 403
    server.password = 'test-password'
    for endpoint, data in (
        ('/api/rename', {'path': str(source), 'new_name': 'other.txt'}),
        ('/api/mkdir', {'parent': str(outside), 'name': 'child'}),
        ('/api/move', {'src': str(source), 'dst_dir': str(shared)}),
    ):
        assert client.post(endpoint, data=data).status_code == 403
    assert client.get('/api/download_zip', query_string={'path': str(outside)}).status_code == 403
    assert source.read_bytes() == b'keep'
