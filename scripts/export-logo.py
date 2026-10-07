"""Export Chrome manifest icons from logo.svg using librsvg and GdkPixbuf (Linux)."""
import ctypes as c
import ctypes.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rsvg = c.CDLL(ctypes.util.find_library('rsvg-2'))
pixbuf = c.CDLL(ctypes.util.find_library('gdk_pixbuf-2.0'))
gobject = c.CDLL(ctypes.util.find_library('gobject-2.0'))
rsvg.rsvg_handle_new_from_file.argtypes = [c.c_char_p, c.c_void_p]
rsvg.rsvg_handle_new_from_file.restype = c.c_void_p
rsvg.rsvg_handle_get_pixbuf.argtypes = [c.c_void_p]
rsvg.rsvg_handle_get_pixbuf.restype = c.c_void_p
pixbuf.gdk_pixbuf_scale_simple.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int]
pixbuf.gdk_pixbuf_scale_simple.restype = c.c_void_p
pixbuf.gdk_pixbuf_savev.argtypes = [c.c_void_p, c.c_char_p, c.c_char_p, c.c_void_p, c.c_void_p, c.c_void_p]
pixbuf.gdk_pixbuf_savev.restype = c.c_int
gobject.g_object_unref.argtypes = [c.c_void_p]
handle = rsvg.rsvg_handle_new_from_file(str(ROOT / 'public/icons/logo.svg').encode(), None)
if not handle:
    raise RuntimeError('Failed to load the SVG logo')
image = rsvg.rsvg_handle_get_pixbuf(handle)
if not image:
    raise RuntimeError('Failed to render the SVG logo')
try:
    for size in (16, 32, 48, 128):
        scaled = pixbuf.gdk_pixbuf_scale_simple(image, size, size, 3)
        if not scaled:
            raise RuntimeError('Failed to scale the logo')
        try:
            path = ROOT / f'public/icons/logo-{size}.png'
            if not pixbuf.gdk_pixbuf_savev(scaled, str(path).encode(), b'png', None, None, None):
                raise RuntimeError('Failed to save the PNG logo')
        finally:
            gobject.g_object_unref(scaled)
finally:
    gobject.g_object_unref(image)
    gobject.g_object_unref(handle)
