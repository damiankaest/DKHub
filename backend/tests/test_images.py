import main
from fastapi.testclient import TestClient


def test_image_upload_and_catalog_reference(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'CATALOG', tmp_path / 'apps.json')
    monkeypatch.setattr(main, 'IMAGE_DIR', tmp_path / 'images')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    client = TestClient(main.app)
    headers = {'Origin':'http://testserver', 'X-DKHub-Admin':'secret', 'Content-Type':'image/png'}
    png = b'\x89PNG\r\n\x1a\n' + b'test bytes'
    assert client.post('/api/admin/images', headers={**headers, 'X-DKHub-Admin':'wrong'}, content=png).status_code == 403
    assert client.post('/api/admin/images', headers={**headers, 'Origin':'http://other'}, content=png).status_code == 403
    assert client.post('/api/admin/images', headers=headers, content=b'<svg/>').status_code == 415
    assert client.post('/api/admin/images', headers=headers, content=png + b'x' * (2 * 1024 * 1024)).status_code == 413
    response = client.post('/api/admin/images', headers=headers, content=png)
    assert response.status_code == 201
    url = response.json()['image']
    assert client.get(url).content == png
    assert client.get(url).headers['x-content-type-options'] == 'nosniff'
    json_headers = {**headers, 'Content-Type':'application/json'}
    app = client.post('/api/apps', headers=json_headers, json={'name':'Music', 'url':'https://example.com', 'image':url}).json()
    assert app['image'] == url
    updated = client.put('/api/apps/' + app['id'], headers=json_headers, json={'name':'Music', 'url':'https://example.com'}).json()
    assert updated['image'] == url
    removed = client.put('/api/apps/' + app['id'], headers=json_headers, json={'name':'Music', 'url':'https://example.com', 'image':''}).json()
    assert removed['image'] == ''
    assert client.post('/api/apps', headers=json_headers, json={'name':'Bad', 'url':'https://example.com', 'image':'https://example.com/test.png'}).status_code == 422
