"""Refresh the curated, offline PBR library from official provider APIs.

Requires numpy and Pillow for the GPUOpen arithmetic graph bake. Downloads are
cached outside the repository. Only vetted material IDs below are shipped, with
source URLs, licenses and SHA256 for every map. This is never run by the app.
"""
import hashlib
import io
import json
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image
from materialx_bake import Baker

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'apps/studio/public/materials'
CODE = ROOT / 'apps/studio/src/workspaces'
CACHE = Path(tempfile.gettempdir()) / 'bezier-material-source-cache'
CACHE.mkdir(exist_ok=True)
UA = {'User-Agent': 'Bezier-material-curation/1.0'}

AMBIENT = [
    ('Plastic013A', 'Fine Pebble Plastic', 'Plastic', 5, .4),
    ('Plastic012A', 'Carbon Black Plastic', 'Plastic', 5, .35),
    ('Metal049A', 'Satin Silver', 'Metal', 2, .35),
    ('Metal030', 'Micro-scratched Steel', 'Metal', 2.6, .45),
    ('Cork004', 'Natural Cork', 'Wood', 1, .65),
    ('Leather026', 'Black Leather', 'Leather', 2, .55),
    ('Fabric036', 'Fine Woven Fabric', 'Textile', 3, .75),
    ('Marble012', 'Carrara Marble', 'Stone', .65, .35),
    ('Wood092', 'Warm Hardwood', 'Wood', .8, .35),
]
GPU = [
    ('c12edfda-a5bd-4469-8147-4a6540a0a213', 'Brushed Aluminium', 'Metal', 1, .5),
    ('01ca2bda-f072-4349-8ee0-353ed5f9f555', 'Stainless Steel', 'Metal', 1, .4),
    ('5936d911-6aed-4197-9117-8eea7cf40d65', 'Matte Aluminium', 'Metal', 1, .35),
    ('78c066dd-defa-4d49-9489-f1a1a9a0390c', 'Brushed Brass', 'Metal', 1, .45),
    ('fff5176e-fdf5-4503-aab1-cb2de56b6fe0', 'Brushed Copper', 'Metal', 1, .45),
    ('fef69a7f-0927-4e86-b193-6af21686b9d9', 'Textured Graphite', 'Plastic', 3, .5),
    ('5132e245-e58c-4ee7-8d12-363725f91b0e', 'Rubber', 'Rubber', 3, .55),
    ('ec63ffd7-32c7-4890-a76c-bc7eaad9639c', 'European Beech', 'Wood', 1, .35),
]
POLY = [
    ('american_walnut_veneer', 'American Walnut', 'Wood', 1.15, .45),
    ('ash_veneer', 'Natural Ash', 'Wood', 1.2, .45),
    ('rosewood_veneer1', 'Lacquered Rosewood', 'Wood', 1.05, .4),
    ('plywood', 'Birch Plywood', 'Wood', 1.3, .45),
    ('rock_01', 'Weathered Stone', 'Stone', 1.45, .7),
    ('brushed_concrete', 'Brushed Concrete', 'Stone', 1.25, .65),
    ('brown_leather', 'Vintage Brown Leather', 'Leather', 2.4, .55),
    ('denim_fabric_03', 'Indigo Denim', 'Textile', 4.5, .65),
    ('fine_grained_wood', 'Fine Grained Wood', 'Wood', 1, .4),
    ('leather_white', 'Ivory Leather', 'Leather', 2, .5),
    ('marble_01', 'Pale Marble', 'Stone', 1, .35),
]


def fetch(url):
    key = hashlib.sha256(url.encode()).hexdigest()
    cached = CACHE / key
    if not cached.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as response:
            data = response.read(200 * 1024 * 1024 + 1)
        if len(data) > 200 * 1024 * 1024:
            raise ValueError('A curated package exceeded its download budget')
        cached.write_bytes(data)
    return cached.read_bytes()


def metadata(url):
    return json.loads(fetch(url))


def record(provider, asset, name, folder, source, license, maps, package=None):
    return dict(provider=provider, asset=asset, name=name, source=source, license=license,
                package=package, maps={k: dict(file=f'{folder.name}/{v}',
                    sha256=hashlib.sha256((folder / v).read_bytes()).hexdigest()) for k, v in maps.items()})


def preset(name, category, folder, maps, repeat, normal, source, params=None):
    params = params or {}
    image = Image.open(folder / maps['albedo']).convert('RGB')
    image.thumbnail((160, 160))
    image.save(folder / 'preview.webp', quality=88)
    return dict(name=name, category=category, finish='PBR surface', color='#ffffff',
                roughness=1, metalness=params.get('metalness', 0), transmission=params.get('transmission', 0),
                clearcoat=params.get('clearcoat', 0), grain=1, textureScale=1, source=source,
                preview=f'/materials/{folder.name}/preview.webp',
                anisotropy=params.get('anisotropy', 0),
                anisotropyRotation=params.get('anisotropyRotation', 0) * 6.283185307179586,
                ior=params.get('ior', 1.5),
                surface=dict(kind='texture', repeat=repeat, normalStrength=normal,
                             **{'color' if k == 'albedo' else k: f'/materials/{folder.name}/{v}' for k, v in maps.items()}))


def ambient(row):
    id, name, category, repeat, normal = row
    url = 'https://ambientcg.com/api/v2/full_json?' + urllib.parse.urlencode(dict(id=id, include='downloadData'))
    asset = metadata(url)['foundAssets'][0]
    downloads = asset['downloadFolders']['default']['downloadFiletypeCategories']['zip']['downloads']
    package = next(d for d in downloads if d['attribute'] == '2K-JPG')
    folder = PUBLIC / id.lower()
    folder.mkdir(exist_ok=True)
    maps = {}
    with zipfile.ZipFile(io.BytesIO(fetch(package['downloadLink']))) as archive:
        for key, suffix in [('albedo', '_Color.jpg'), ('normal', '_NormalGL.jpg'),
                            ('roughness', '_Roughness.jpg'), ('metalness', '_Metalness.jpg'),
                            ('ao', '_AmbientOcclusion.jpg')]:
            file = next((p for p in archive.namelist() if p.endswith(suffix)), None)
            if file:
                maps[key] = f'{key}.jpg'
                (folder / maps[key]).write_bytes(archive.read(file))
    if not {'albedo', 'normal', 'roughness'}.issubset(maps):
        raise ValueError(f'{id} lacks its required PBR channels')
    parameters = {'metalness': 1 if category == 'Metal' else 0}
    return preset(name, category, folder, maps, repeat, normal, 'ambientCG · CC0', parameters), record(
        'ambientCG', id, name, folder, asset['shortLink'], 'CC0-1.0', maps, package['downloadLink'])


def gpu(row):
    id, name, category, repeat, normal = row
    asset = metadata(f'https://api.matlib.gpuopen.com/api/materials/{id}/')
    if asset['license'] != 'MIT Public Domain':
        raise ValueError(f'The vetted GPUOpen material {id} changed license')
    packages = [metadata(f'https://api.matlib.gpuopen.com/api/packages/{p}/') for p in asset['packages']]
    package = next((p for p in packages if p['label'].lower() == '2k 8b'), None)
    if package is None:
        package = next((p for p in packages if p['label'].lower() == '1k 8b'), packages[0])
    folder = PUBLIC / ('gpu_' + name.lower().replace(' ', '_'))
    with zipfile.ZipFile(io.BytesIO(fetch(package['file_url']))) as archive:
        maps, params = Baker(archive).bake(folder)
    license = metadata('https://api.matlib.gpuopen.com/api/licenses/8/')['description']
    license = license.replace('{YEAR}', package['created_date'][:4]).replace('{AUTHOR}', asset['author'])
    (folder / 'LICENSE.txt').write_text(license)
    return preset(name, category, folder, maps, repeat, normal, 'GPUOpen · MIT', params), record(
        'GPUOpen', id, name, folder, f'https://matlib.gpuopen.com/main/materials/all?material={id}', 'MIT', maps, package['file_url'])


def poly(row):
    id, name, category, repeat, normal = row
    files = metadata(f'https://api.polyhaven.com/files/{id}')
    folder = PUBLIC / id
    folder.mkdir(exist_ok=True)
    maps = {}
    urls = {}
    for key, channel in [('albedo', 'Diffuse'), ('normal', 'nor_gl'), ('roughness', 'Rough'), ('ao', 'AO')]:
        if channel not in files:
            continue
        file = files[channel]['2k']['jpg']
        data = fetch(file['url'])
        if hashlib.md5(data).hexdigest() != file['md5']:
            raise ValueError(f'{id} {key} did not match the provider checksum')
        maps[key] = f'{key}.jpg'
        urls[key] = file['url']
        (folder / maps[key]).write_bytes(data)
    return preset(name, category, folder, maps, repeat, normal, 'Poly Haven · CC0'), record(
        'Poly Haven', id, name, folder, f'https://polyhaven.com/a/{id}', 'CC0-1.0', maps, urls)


def main():
    records = []
    for provider, rows, fn in [('ambient', AMBIENT, ambient), ('gpu', GPU, gpu), ('poly', POLY, poly)]:
        presets = []
        for row in rows:
            material, provenance = fn(row)
            presets.append(material)
            records.append(provenance)
            print(provider, row[1], 'ready', flush=True)
        code = "/** Generated by scripts/curate-visualize-materials.py; local, licensed PBR assets. */\n"
        code += "import type { MaterialPreset } from './material-types.js';\n"
        code += f'export const {provider.upper()}_MATERIALS: readonly MaterialPreset[] = ' + json.dumps(presets, indent=2) + ';\n'
        (CODE / f'{provider}-materials.ts').write_text(code)
    (PUBLIC / 'catalog.json').write_text(json.dumps(records, indent=2) + '\n')
    print('Curated surfaces:', len(records), flush=True)


if __name__ == '__main__':
    main()
