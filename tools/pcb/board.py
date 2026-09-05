"""
Board selector.

Every tool in this directory does `import board as B` and expects one
board definition. There are now two, so this module picks which one that
import resolves to:

    python verify.py                              # cellar fan, the default
    PCB_BOARD=board_irrigation python verify.py   # irrigation controller

The default stays `board_cellar_fan` because that board is built and in
service - a mistyped variable name must not silently regenerate
manufacturing data for the wrong project.

Replacing sys.modules[__name__] rather than re-exporting with `import *`
is deliberate: the consumers reach for module-level constants that come
and go as a board grows, and a star import would silently miss any name
starting with an underscore. This way `board` *is* the selected module,
with every attribute it has.

To dump a netlist, run the board file itself - `python board_irrigation.py` -
not this one.
"""

import importlib
import os
import sys

BOARD_MODULE = os.environ.get("PCB_BOARD", "board_cellar_fan")

sys.modules[__name__] = importlib.import_module(BOARD_MODULE)
