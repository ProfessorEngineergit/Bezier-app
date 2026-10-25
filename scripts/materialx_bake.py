"""Bake the image/arithmetic subset used by the curated GPUOpen presets.

This is an offline asset tool, not a runtime or a general MaterialX interpreter.
Unsupported nodes fail explicitly. No shader or executable from an archive runs.
Requires numpy and Pillow. Original shader and download provenance are retained.
"""
import io
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image


def srgb_to_linear(v):
    return np.where(v <= .04045, v / 12.92, ((v + .055) / 1.055) ** 2.4)


def linear_to_srgb(v):
    v = np.clip(v, 0, 1)
    return np.where(v <= .0031308, v * 12.92, 1.055 * v ** (1 / 2.4) - .055)


class Baker:
    def __init__(self, archive, size=2048):
        self.archive, self.size = archive, size
        shaders = [p for p in archive.namelist() if p.lower().endswith('.mtlx')]
        if len(shaders) != 1:
            raise ValueError('Expected one MaterialX shader per curated package')
        self.shader = archive.read(shaders[0])
        self.root = ET.fromstring(self.shader)
        self.graphs = {g.get('name'): {n.get('name'): n for n in g}
                       for g in self.root.findall('nodegraph')}
        self.surface = self.root.find('standard_surface')
        if self.surface is None:
            raise ValueError('The curated package must use standard_surface')
        self.cache, self.images = {}, {}
        u, v = np.meshgrid((np.arange(size) + .5) / size, 1 - (np.arange(size) + .5) / size)
        self.uv = np.stack((u, v), axis=-1).astype(np.float32)

    def resolve(self, element, graph):
        if element is None:
            raise ValueError('Missing MaterialX input')
        if element.get('value') is not None:
            return np.array([float(x) for x in element.get('value').replace(',', ' ').split()], dtype=np.float32)
        if element.get('nodegraph'):
            target = element.get('nodegraph')
            return self.node(self.graphs[target][element.get('output')], target)
        if element.get('nodename'):
            return self.node(self.graphs[graph][element.get('nodename')], graph)
        raise ValueError(f'Unresolved MaterialX input: {element.attrib}')

    def node(self, element, graph):
        key = (graph, element.get('name'))
        if key in self.cache:
            return self.cache[key]
        def value(name, default=None):
            child = element.find(f"input[@name='{name}']")
            return self.resolve(child, graph) if child is not None else np.array([default], dtype=np.float32)
        tag = element.tag
        if tag == 'output':
            result = self.resolve(element, graph)
        elif tag == 'constant':
            result = value('value')
        elif tag == 'texcoord':
            result = self.uv
        elif tag == 'image':
            filename = element.find("input[@name='file']")
            path = filename.get('value')
            if path not in self.images:
                image = Image.open(io.BytesIO(self.archive.read(path))).convert('RGBA')
                self.images[path] = np.array(image, dtype=np.float32) / 255
            image = self.images[path]
            uv = value('texcoord') if element.find("input[@name='texcoord']") is not None else self.uv
            h, w = image.shape[:2]
            x, y = (uv[..., 0] % 1) * w - .5, ((1 - uv[..., 1]) % 1) * h - .5
            ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
            fx, fy = (x - ix)[..., None], (y - iy)[..., None]
            result = ((image[iy % h, ix % w] * (1 - fx) + image[iy % h, (ix + 1) % w] * fx) * (1 - fy)
                      + (image[(iy + 1) % h, ix % w] * (1 - fx) + image[(iy + 1) % h, (ix + 1) % w] * fx) * fy)
            channels = {'float': 1, 'color3': 3, 'vector3': 3, 'color4': 4, 'vector4': 4}[element.get('type')]
            result = result[..., :channels]
            if filename.get('colorspace') == 'srgb_texture':
                result = srgb_to_linear(result)
        elif tag == 'extract':
            index = int(value('index')[0])
            result = value('in')[..., index:index + 1]
        elif tag == 'mix':
            t = value('mix')
            result = value('fg') * t + value('bg') * (1 - t)
        elif tag == 'clamp':
            result = np.clip(value('in'), value('low', 0), value('high', 1))
        elif tag in ['multiply', 'add', 'subtract', 'divide', 'max', 'min']:
            ops = {'multiply': np.multiply, 'add': np.add, 'subtract': np.subtract,
                   'divide': np.divide, 'max': np.maximum, 'min': np.minimum}
            result = ops[tag](value('in1'), value('in2'))
        elif tag == 'normalmap':
            result = value('in') * 2 - 1
            result = result.copy()
            result[..., :2] *= value('scale', 1)
            result /= np.maximum(np.linalg.norm(result, axis=-1, keepdims=True), 1e-8)
        else:
            raise ValueError(f'Unsupported MaterialX node: {tag} {element.get("name")}')
        self.cache[key] = result.astype(np.float32)
        return self.cache[key]

    def parameter(self, name, default):
        element = self.surface.find(f"input[@name='{name}']")
        return self.resolve(element, None) if element is not None else np.array(default, dtype=np.float32)

    def save(self, value, target, color=False, normal=False):
        if normal:
            value = value * .5 + .5
        elif color:
            value = linear_to_srgb(value)
        channels = value.shape[-1]
        image = np.broadcast_to(value, (self.size, self.size, channels))
        pixels = np.rint(np.clip(image, 0, 1) * 255).astype(np.uint8)
        Image.fromarray(pixels[..., 0] if channels == 1 else pixels).save(target)

    def bake(self, target):
        target.mkdir(parents=True, exist_ok=True)
        maps = {}
        for name, channel, default in [('base_color', 'albedo', [1, 1, 1]),
                                       ('specular_roughness', 'roughness', [.5]),
                                       ('normal', 'normal', [0, 0, 1]),
                                       ('metalness', 'metalness', [0])]:
            value = self.parameter(name, default)
            if channel == 'metalness' and value.ndim == 1:
                continue
            self.save(value, target / f'{channel}.png', color=channel == 'albedo', normal=channel == 'normal')
            maps[channel] = f'{channel}.png'
        (target / 'SOURCE.mtlx').write_bytes(self.shader)
        return maps, {key: float(self.parameter(name, [default]).flat[0]) for key, name, default in [
            ('metalness', 'metalness', 0), ('anisotropy', 'specular_anisotropy', 0),
            ('anisotropyRotation', 'specular_rotation', 0), ('ior', 'specular_IOR', 1.5),
            ('clearcoat', 'coat', 0), ('transmission', 'transmission', 0)]}
