# The macOS .dmg as dmgbuild writes it. tauri lays out the window through Finder and skips that when
# CI=true, so a release built on a runner had no background and no icon positions. dmgbuild writes the
# same window without Finder. Sizes and positions come from tauri.conf.json.
#
#   dmgbuild -s scripts/dmg-background/window.py -D app=<Bezier.app> Bezier <out.dmg>   (from the root)

import json
import os.path

src_tauri = "apps/desktop/src-tauri"
with open(os.path.join(src_tauri, "tauri.conf.json")) as conf:
    dmg = json.load(conf)["bundle"]["macOS"]["dmg"]

app = defines["app"]
name = os.path.basename(app)
at = lambda spot: (spot["x"], spot["y"])

files = [app]
symlinks = {"Applications": "/Applications"}
format = "UDZO"
icon = os.path.join(src_tauri, "icons/icon.icns")
background = os.path.join(src_tauri, dmg["background"])
window_rect = ((200, 120), (dmg["windowSize"]["width"], dmg["windowSize"]["height"]))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
show_icon_preview = False
icon_size = 128
text_size = 13
icon_locations = {name: at(dmg["appPosition"]), "Applications": at(dmg["applicationFolderPosition"])}
