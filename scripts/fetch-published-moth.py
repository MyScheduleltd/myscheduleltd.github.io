"""Snapshot the public release, with path validation and per-file hashes."""
import concurrent.futures, hashlib, json, pathlib, urllib.parse, urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
output = root / '.qa/moth/published'
origin = 'https://beauty-boy.vercel.app/'
def download(relative):
    path = pathlib.PurePosixPath(relative)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Unsafe manifest path')
    url = origin + urllib.parse.quote(relative, safe='/')
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read()
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

with urllib.request.urlopen(origin + 'deploy-manifest.json', timeout=60) as response:
    manifest = json.load(response)
files = list(dict.fromkeys(manifest['files'] + ['manifest.json']))
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    hashes = list(pool.map(download, files))
# Confirm the release did not move while its files were being fetched.
with urllib.request.urlopen(origin + 'index.html', timeout=60) as response:
    assert response.read() == (output / 'index.html').read_bytes(), 'Release changed during snapshot'
(output.parent / 'published-snapshot.json').write_text(json.dumps({'origin': origin, 'manifest': manifest, 'files': hashes}, indent=2) + '\n')
print(f'Snapshotted {len(hashes)} published files; {sum(f["bytes"] for f in hashes):,} bytes.')
