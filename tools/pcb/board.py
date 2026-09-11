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

_impl = importlib.import_module(BOARD_MODULE)

# Every artefact of a board lives in out/<board name>/ and is called
# <board name>-something. The board name is also the ESPHome device name,
# so one string ties the PCB, the manufacturing data, the BOM and the
# firmware together. Derived here rather than in each board file so that
# the two cannot drift apart, and injected onto the selected module so
# the tools reach it as B.OUT_DIR like any other board attribute.
_impl.OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "out", _impl.BOARD_NAME)

sys.modules[__name__] = _impl
