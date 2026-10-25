"""Reproduce the neutral offline 2K studio pack; verify provider and local checksums."""
import hashlib
import json
from pathlib import Path
import urllib.request

OUTPUT = Path(__file__).resolve().parents[1] / 'apps/studio/public/environments'
ASSETS = [('studio-neutral.hdr', 'studio_small_08'),
          ('studio-warm.hdr', 'studio_small_09'), ('studio-cool.hdr', 'studio_small_08')]


def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Bezier-studio-curation/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries = []
    cached = {}
    for filename, asset in ASSETS:
        metadata = json.loads(download(f'https://api.polyhaven.com/files/{asset}'))
        record = metadata['hdri']['2k']['hdr']
        if asset not in cached:
            data = download(record['url'])
            if hashlib.md5(data).hexdigest() != record['md5']:
                raise ValueError(f'Provider checksum failed: {asset}')
            cached[asset] = data
        data = cached[asset]
        (OUTPUT / filename).write_bytes(data)
        entries.append(dict(file=filename, asset=asset, source=f'https://polyhaven.com/a/{asset}',
                            url=record['url'], license='CC0-1.0', sha256=hashlib.sha256(data).hexdigest()))
    (OUTPUT / 'catalog.json').write_text(json.dumps(entries, indent=2) + '\n')


if __name__ == '__main__':
    main()
