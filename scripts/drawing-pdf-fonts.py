"""Generate static PDF fonts from the app's OFL-licensed Archivo variable font.

Run with Python and fontTools (including Brotli support). jsPDF cannot embed WOFF2
or variable font instances directly; the screen still uses the original WOFF2.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

fonts = Path(__file__).resolve().parents[1] / 'apps/studio/public/fonts'
for name, weight in [('regular', 400), ('semibold', 600)]:
    source = TTFont(fonts / 'archivo-variable.woff2')
    instance = instantiateVariableFont(source, {'wght': weight, 'wdth': 100}, inplace=True)
    instance.flavor = None
    instance.save(fonts / f'archivo-pdf-{name}.ttf')
