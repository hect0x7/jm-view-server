import json
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor

import pytest
from PIL import Image

from jm_view_server.app import JmServer
from jm_view_server.favorites import FavoriteManager


def test_browser_toolbar_stays_outside_address_bar(favorite_server):
    class StructureParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.stack = []
            self.parents = {}

        def handle_starttag(self, tag, attrs):
            if tag != 'div':
                return
            classes = set(dict(attrs).get('class', '').split())
            for name in ('topbar', 'path-section', 'browser-toolbar-actions'):
                if name in classes:
                    self.parents[name] = list(self.stack)
            self.stack.append(classes)

        def handle_endtag(self, tag):
            if tag == 'div':
                self.stack.pop()

    parser = StructureParser()
    parser.feed(favorite_server.app.test_client().get('/').get_data(as_text=True))
    assert parser.parents['topbar'] == parser.parents['path-section']
    assert 'path-section' in parser.parents['browser-toolbar-actions'][-1]
    assert not any('topbar' in classes for classes in parser.parents['browser-toolbar-actions'])


@pytest.mark.parametrize('mode', ['copy', 'copy_clear', 'move'])
def test_export_modes(favorite_server, tmp_path, monkeypatch, mode):
    image = tmp_path / 'source.png'
    Image.new('RGB', (12, 18)).save(image)
    original = image.read_bytes()
    favorite_server.favorite_manager.set_image(str(image), True)
    recycled = []
    def recycle(path):
        recycled.append(path)
        image.rename(tmp_path / 'simulated-trash.png')
    monkeypatch.setattr('jm_view_server.favorites.send2trash', recycle)
    result = favorite_server.app.test_client().post('/api/favorites/copy', json={
        'destination': str(tmp_path / 'target'), 'mode': mode}).json
    assert result['copied'] == 1 and result['failed'] == 0
    assert (tmp_path / 'target' / image.name).read_bytes() == original
    assert image.exists() == (mode != 'move')
    assert len(recycled) == result['moved'] == (mode == 'move')
    assert result['cleared'] == (mode != 'copy')
    assert bool(favorite_server.favorite_manager.list_images()) == (mode == 'copy')


def test_move_failure_and_same_directory_keep_favorites(favorite_server, tmp_path, monkeypatch):
    image = tmp_path / 'source.png'
    Image.new('RGB', (12, 18)).save(image)
    favorite_server.favorite_manager.set_image(str(image), True)
    def fail(path):
        raise OSError('simulated recycle failure')
    monkeypatch.setattr('jm_view_server.favorites.send2trash', fail)
    manager = favorite_server.favorite_manager
    same = manager.copy_images(str(tmp_path), mode='move')
    assert same['skipped'] == 1 and same['copied'] == same['cleared'] == 0
    result = manager.copy_images(str(tmp_path / 'target'), mode='move')
    assert result['copied'] == result['failed'] == 1
    assert result['moved'] == result['cleared'] == 0
    assert image.exists() and (tmp_path / 'target' / image.name).exists()
    assert len(manager.list_images()) == 1


def test_move_preserves_source_changed_during_copy(favorite_server, tmp_path, monkeypatch):
    import shutil
    image = tmp_path / 'source.png'
    Image.new('RGB', (12, 18)).save(image)
    manager = favorite_server.favorite_manager
    manager.set_image(str(image), True)
    real_copy = shutil.copyfileobj
    def copy_then_change(original, output, **kwargs):
        real_copy(original, output, **kwargs)
        with image.open('ab') as changed:
            changed.write(b'new data')
    monkeypatch.setattr('jm_view_server.favorites.shutil.copyfileobj', copy_then_change)
    monkeypatch.setattr('jm_view_server.favorites.send2trash', lambda path: pytest.fail('Changed source recycled'))
    result = manager.copy_images(str(tmp_path / 'target'), mode='move')
    assert result['copied'] == result['failed'] == 1
    assert result['moved'] == result['cleared'] == 0
    assert image.read_bytes().endswith(b'new data') and len(manager.list_images()) == 1


@pytest.fixture
def favorite_server(tmp_path, monkeypatch):
    # Keep message and favorite files away from the real user's home.
    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    server = JmServer(str(tmp_path), '')
    server.favorite_manager = FavoriteManager(tmp_path / 'favorites.json')
    server.register_routes()
    return server


def test_favorite_round_trip_and_reader(favorite_server, tmp_path):
    image = tmp_path / '图片 &amp; 100%20.png'
    Image.new('RGB', (12, 18)).save(image)
    client = favorite_server.app.test_client()
    assert client.put('/api/favorites', json={'path': str(image)}).json == {'favorite': True}
    assert client.put('/api/favorites', json={'path': str(image)}).status_code == 200
    records = client.get('/api/favorites').json['images']
    assert len(records) == 1 and records[0]['path'] == str(image)
    assert FavoriteManager(favorite_server.favorite_manager.data_file).list_images() == records
    assert '看本收藏图' in client.get('/favorites').get_data(as_text=True)
    reader = client.get('/jm_view?favorites=1').get_data(as_text=True)
    assert 'reader-favorites.js' in reader and '/favorites' in reader
    assert '图片' in reader
    assert client.get('/api/thumb', query_string={'path': str(image)}).status_code == 200
    assert client.get('/view_file', query_string={'path': str(image)}).status_code == 200
    image.unlink()
    assert '原图已移动或删除' in client.get('/favorites').get_data(as_text=True)
    assert client.get('/jm_view?favorites=1').location == '/favorites'
    assert client.delete('/api/favorites', json={'path': str(image)}).status_code == 200
    assert client.get('/api/favorites').json['images'] == []


def test_favorite_validation_and_auth(favorite_server, tmp_path):
    client = favorite_server.app.test_client()
    for body in ([], {}, {'path': 1}, {'path': 'relative.png'}, {'path': str(tmp_path)},
                 {'path': str(tmp_path / 'missing.png')}, {'path': '\0'}):
        assert client.put('/api/favorites', json=body).status_code == 400
    favorite_server.password = 'test-password'
    for method in ('get', 'put', 'delete'):
        assert getattr(client, method)('/api/favorites').status_code == 401
    assert client.get('/favorites').location == '/login'
    assert client.get('/jm_view?favorites=1').location == '/login'


def test_corrupt_favorites_are_not_overwritten(favorite_server, tmp_path):
    data_file = favorite_server.favorite_manager.data_file
    data_file.write_text('{broken', encoding='utf-8')
    image = tmp_path / '1.png'
    Image.new('RGB', (12, 18)).save(image)
    client = favorite_server.app.test_client()
    assert client.get('/api/favorites').status_code == 500
    assert client.put('/api/favorites', json={'path': str(image)}).status_code == 500
    assert data_file.read_text(encoding='utf-8') == '{broken'


def test_concurrent_managers_preserve_all_records(tmp_path):
    data_file = tmp_path / 'favorites.json'
    managers = [FavoriteManager(data_file) for _ in range(2)]
    paths = [str(tmp_path / f'{index}.png') for index in range(8)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda item: managers[item[0] % 2].set_image(item[1], True), enumerate(paths)))
    assert {item['path'] for item in json.loads(data_file.read_text(encoding='utf-8'))} == set(paths)
    assert list(tmp_path.iterdir()) == [data_file]


def test_failed_write_preserves_records_and_removes_temp_file(tmp_path, monkeypatch):
    manager = FavoriteManager(tmp_path / 'favorites.json')
    manager.set_image(str(tmp_path / '1.png'), True)
    before = manager.data_file.read_bytes()

    def fail_replace(*args):
        raise OSError('simulated write failure')

    monkeypatch.setattr('jm_view_server.favorites.os.replace', fail_replace)
    with pytest.raises(OSError):
        manager.set_image(str(tmp_path / '2.png'), True)
    assert manager.data_file.read_bytes() == before
    assert list(tmp_path.iterdir()) == [manager.data_file]


def test_copy_favorites_preserves_originals_and_existing_files(favorite_server, tmp_path):
    first = tmp_path / 'first' / 'same.png'
    second = tmp_path / 'second' / 'same.png'
    for path, color in ((first, 'red'), (second, 'blue')):
        path.parent.mkdir()
        Image.new('RGB', (12, 18), color).save(path)
        favorite_server.favorite_manager.set_image(str(path), True)
    missing = tmp_path / 'missing.png'
    favorite_server.favorite_manager.set_image(str(missing), True)
    records = favorite_server.favorite_manager.data_file.read_bytes()
    destination = tmp_path / 'copies'
    destination.mkdir()
    existing = destination / 'same.png'
    existing.write_bytes(b'keep existing file')
    response = favorite_server.app.test_client().post('/api/favorites/copy', json={'destination': str(destination)})
    assert response.status_code == 200
    assert (response.json['copied'], response.json['skipped'], response.json['failed'], response.json['renamed']) == (2, 1, 0, 2)
    assert existing.read_bytes() == b'keep existing file'
    assert {path.read_bytes() for path in destination.glob('same (*).png')} == {first.read_bytes(), second.read_bytes()}
    assert favorite_server.favorite_manager.data_file.read_bytes() == records
    # A new destination is created automatically, and copying again preserves prior copies.
    nested = tmp_path / 'new' / 'destination'
    assert favorite_server.app.test_client().post('/api/favorites/copy', json={'destination': str(nested)}).json['copied'] == 2
    assert first.exists() and second.exists()


def test_copy_favorites_validation_and_auth(favorite_server, tmp_path):
    client = favorite_server.app.test_client()
    assert client.post('/api/favorites/copy', json={'destination': str(tmp_path), 'clear': 'yes'}).status_code == 400
    for body in ([], {}, {'destination': 1}, {'destination': ''}, {'destination': 'relative'}, {'destination': '\0'}):
        assert client.post('/api/favorites/copy', json=body).status_code == 400
    target = tmp_path / 'file'
    target.write_text('preserve', encoding='utf-8')
    assert client.post('/api/favorites/copy', json={'destination': str(target)}).status_code == 500
    assert target.read_text(encoding='utf-8') == 'preserve'
    favorite_server.password = 'test-password'
    assert client.post('/api/favorites/copy', json={'destination': str(tmp_path)}).status_code == 401


@pytest.mark.parametrize('clear', [False, True])
def test_copy_failure_cleans_partial_file_and_continues(favorite_server, tmp_path, monkeypatch, clear):
    first = tmp_path / '1.png'
    second = tmp_path / '2.png'
    for path in (first, second):
        Image.new('RGB', (12, 18)).save(path)
        favorite_server.favorite_manager.set_image(str(path), True)
    import shutil
    original_copy = shutil.copyfileobj

    def fail_first(source, target, **kwargs):
        if source.name == str(first):
            target.write(b'incomplete')
            raise OSError('simulated copy failure')
        original_copy(source, target, **kwargs)

    monkeypatch.setattr('jm_view_server.favorites.shutil.copyfileobj', fail_first)
    destination = tmp_path / 'copies'
    result = favorite_server.favorite_manager.copy_images(destination, clear=clear)
    assert (result['copied'], result['failed']) == (1, 1)
    assert not (destination / '1.png').exists()
    assert (destination / '2.png').read_bytes() == second.read_bytes()
    remaining = {item['path'] for item in favorite_server.favorite_manager.list_images()}
    assert remaining == ({str(first)} if clear else {str(first), str(second)})


def test_metadata_and_shared_export_entry(favorite_server, tmp_path):
    from urllib.parse import quote
    image = tmp_path / '收藏 &amp; 100%20.png'
    Image.new('RGB', (12, 18)).save(image)
    favorite_server.favorite_manager.set_image(str(image), True)
    client = favorite_server.app.test_client()
    html = client.get('/favorites').get_data(as_text=True)
    assert '收藏时间' in html and '文件修改' in html and 'data-favorite-time=' in html
    assert 'data-favorite-icon="folder"' in html
    assert f'/?path={quote(str(tmp_path), safe="/")}' in html
    assert 'favorites-export.js' in html and 'favoritesExportDialog' in html
    index = client.get('/').get_data(as_text=True)
    assert 'data-open-favorites-export' in index
    assert '<script defer src="/static/js/favorites-export.js?' in index
    assert 'useCurrentExportDirectory' in index and 'favorites-export.css' in index
    assert index.count('id="copyFavoritesForm"') == 1


@pytest.mark.parametrize('include_missing', [False, True])
def test_move_favorites_copies_then_clears_successful_records(favorite_server, tmp_path, include_missing):
    image = tmp_path / '1.png'
    Image.new('RGB', (12, 18)).save(image)
    missing = tmp_path / 'missing.png'
    for path in ([image, missing] if include_missing else [image]):
        favorite_server.favorite_manager.set_image(str(path), True)
    destination = tmp_path / 'copies'
    response = favorite_server.app.test_client().post('/api/favorites/copy', json={'destination': str(destination), 'clear': True})
    assert response.status_code == 200
    assert (response.json['copied'], response.json['skipped'], response.json['cleared']) == (1, int(include_missing), 1)
    assert (destination / '1.png').read_bytes() == image.read_bytes()
    assert [item['path'] for item in favorite_server.favorite_manager.list_images()] == ([str(missing)] if include_missing else [])
    assert response.json['cleared_paths'] == [str(image)]


def test_move_favorites_preserves_concurrent_new_and_refavorited_records(favorite_server, tmp_path, monkeypatch):
    import shutil
    manager = favorite_server.favorite_manager
    image = tmp_path / '1.png'
    Image.new('RGB', (12, 18)).save(image)
    manager.set_image(str(image), True)
    new_path = str(tmp_path / 'new.png')
    original_copy = shutil.copyfileobj

    def add_favorites_during_copy(source, target, **kwargs):
        manager.set_image(str(image), False)
        manager.set_image(str(image), True)
        manager.set_image(new_path, True)
        original_copy(source, target, **kwargs)

    monkeypatch.setattr('jm_view_server.favorites.shutil.copyfileobj', add_favorites_during_copy)
    result = manager.copy_images(tmp_path / 'copies', clear=True)
    assert result['copied'] == 1 and result['cleared'] == 0
    assert {item['path'] for item in manager.list_images()} == {str(image), new_path}


def test_move_favorites_reports_clear_failure_without_losing_records(favorite_server, tmp_path, monkeypatch):
    manager = favorite_server.favorite_manager
    image = tmp_path / '1.png'
    Image.new('RGB', (12, 18)).save(image)
    manager.set_image(str(image), True)
    before = manager.data_file.read_bytes()

    def fail_save(records):
        raise OSError('simulated storage failure')

    monkeypatch.setattr(manager, '_save', fail_save)
    result = manager.copy_images(tmp_path / 'copies', clear=True)
    assert result['copied'] == 1 and result['cleared'] == 0
    assert result['clear_error']
    assert manager.data_file.read_bytes() == before
    assert (tmp_path / 'copies' / '1.png').read_bytes() == image.read_bytes()
