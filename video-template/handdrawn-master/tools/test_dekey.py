import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from dekey import dekey_image


class DekeyImageTest(unittest.TestCase):
    def test_removes_green_and_despills_soft_edge(self) -> None:
        rgb = np.zeros((20, 20, 3), dtype=np.uint8)
        rgb[:] = [5, 248, 5]
        rgb[5:15, 5:15] = [240, 238, 232]
        rgb[4, 5:15] = [120, 245, 120]

        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.png"
            output = Path(tmp) / "output.png"
            Image.fromarray(rgb, "RGB").save(source)

            ratio = dekey_image(source, output)
            result = np.asarray(Image.open(output).convert("RGBA"))

        self.assertGreater(ratio, 50)
        self.assertLess(ratio, 95)
        self.assertEqual(int(result[0, 0, 3]), 0)
        self.assertEqual(int(result[10, 10, 3]), 255)
        edge = result[4, 8]
        self.assertLessEqual(int(edge[1]), max(int(edge[0]), int(edge[2])) + 2)


if __name__ == "__main__":
    unittest.main()
