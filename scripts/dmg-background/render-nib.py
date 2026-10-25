# Renders Nib for the installer window: he looks and points towards the
# Applications folder. He holds nothing; the Bezier icon in the window is the
# real one Finder draws.
#
#   NIB_BUILD=/path/to/nib-v2/source/build_nib.py \
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P render-nib.py -- out=art/nib.png res=1600 samples=160
#
# Nib is built by Nib's own Blender script, which lives with the design files
# and not in this repository (the character model for the app is the glTF in
# apps/studio/public/nib). Rather than copy 880 lines of modelling, this driver
# runs that script with a different pose, camera and a transparent film, so the
# render can be laid on any background. The result is committed (art/nib.png);
# rendering again is only needed when the pose changes.

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default):
    for a in ARGV:
        if a.startswith(name + '='):
            return a.split('=', 1)[1]
    return default


BUILD = os.environ.get('NIB_BUILD', '/Users/bahriannovotny/Desktop/Nib-Uebergabe/nib-v2/source/build_nib.py')
OUT = os.path.abspath(opt('out', os.path.join(HERE, 'art', 'nib.png')))
R = math.radians

# Nib's left arm (+X, the right of the picture) reaches out and slightly up to
# the Applications folder; the other hangs relaxed, as in his default pose.
POSE = """POSE = {
    'root_rot': (0, 0, R(%(root)s)),
    'neck': (R(-4), R(%(tilt)s), R(%(look)s)),
    'L': dict(shoulder=(R(0), R(%(ls)s), 0), elbow=(R(-6), R(%(le)s), 0), wrist=(0, R(-6), 0), curl=4),
    'R': dict(shoulder=(R(6), R(13), 0), elbow=(R(-16), R(5), 0), wrist=(0, R(-8), 0), curl=18),
}
"""


def patched_source():
    src = open(BUILD, encoding='utf-8').read()
    a = src.index('POSE = {')
    b = src.index('\n}\n', a) + 3
    pose = POSE % dict(root=opt('root', '-8'), tilt=opt('tilt', '-4'), look=opt('look', '14'),
                ls=opt('ls', '-108'), le=opt('le', '-4'))
    src = src[:a] + pose + src[b:]
    src = src.replace("'hero':  (", "'dmg':   (%s, %s, %s, 11.0, 'Auge R'),\n    'hero':  (" % (
        opt('cam', '(-0.10, -1.55, 0.25)'), opt('tgt', '(0.0, 0.0, 0.165)'), opt('lens', '120.0')), 1)
    src = src.replace('\nbuild(); setup_render()', '\nbuild(); EXTRAS(); setup_render(); FILM()', 1)
    return src


def extras():
    import bpy
    # The cyclorama stays only to catch Nib's contact shadow; everything else of
    # the studio is transparent in the render.
    bpy.data.objects['Hohlkehle'].is_shadow_catcher = True

    # The studio lights mirror in the visor as a bright diagonal and in the eye
    # lenses as large white blobs. For a small picture on a dark ground the face
    # should be calm: an index of refraction near 1 takes the reflection out of
    # the glass (what is behind it still shows), and a little roughness leaves
    # the lenses at most a soft, small catch light.
    def tune(name, ior, rough=None):
        for n in bpy.data.materials[name].node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['IOR'].default_value = ior
                if rough is not None:
                    n.inputs['Roughness'].default_value = rough
    tune('Rauchglas', 1.0, 0.0)
    tune('Linse vergütet', float(opt('lens_ior', '1.12')), 0.06)
    tune('Linse hinten', 1.15, 0.06)


def film():
    import bpy
    s = bpy.context.scene
    s.render.film_transparent = True
    s.render.image_settings.color_mode = 'RGBA'
    s.render.filepath = OUT
    s.render.resolution_x = int(opt('res', 1600))
    s.render.resolution_y = int(opt('resh', opt('res', 1600)))
    s.cycles.samples = int(opt('samples', 160))
    s.view_settings.look = 'AgX - Medium High Contrast'


sys.argv = [sys.argv[0], '--', 'view=dmg', 'save=0', 'res=' + opt('res', '1600'), 'samples=' + opt('samples', '160')]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
exec(compile(patched_source(), BUILD, 'exec'), {'__file__': BUILD, '__name__': '__main__', 'EXTRAS': extras, 'FILM': film})
