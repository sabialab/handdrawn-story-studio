#!/usr/bin/env python3
"""Turn a near-green chroma plate into an RGBA PNG with edge despill."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def _smoothstep(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, 0.0, 1.0)
    return clipped * clipped * (3.0 - 2.0 * clipped)


def dekey_image(source: Path, output: Path) -> float:
    image = Image.open(source).convert("RGB")
    rgb = np.asarray(image, dtype=np.float32)

    border = np.concatenate(
        [rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]],
        axis=0,
    )
    key = np.median(border, axis=0)
    distance = np.linalg.norm(rgb - key, axis=2)

    transparent_distance = 18.0
    opaque_distance = 90.0
    alpha = _smoothstep(
        (distance - transparent_distance)
        / (opaque_distance - transparent_distance)
    )

    red = rgb[..., 0]
    green = rgb[..., 1]
    blue = rgb[..., 2]
    neutral_ceiling = np.maximum(red, blue) + 2.0
    spill = np.clip((green - neutral_ceiling) / 80.0, 0.0, 1.0)
    green = green * (1.0 - spill) + neutral_ceiling * spill

    cleaned = np.stack([red, green, blue], axis=2)
    cleaned[alpha <= 0.001] = 0
    rgba = np.dstack(
        [
            np.clip(cleaned, 0, 255).astype(np.uint8),
            np.round(alpha * 255).astype(np.uint8),
        ]
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(output)

    transparent_ratio = float(np.mean(rgba[..., 3] == 0) * 100.0)
    print(
        f"{source.name}: 透明像素占比 {transparent_ratio:.2f}% "
        f"(估计绿幕 RGB {key.astype(np.uint8).tolist()})"
    )
    if transparent_ratio < 5.0 or transparent_ratio > 95.0:
        print(
            f"警报: {source.name} 透明像素占比超出 5%–95%，"
            "可能抠穿或未抠到"
        )
    return transparent_ratio


def main() -> None:
    parser = argparse.ArgumentParser(
        description="将绿幕 PNG 转为带去绿边的 RGBA 透明 PNG"
    )
    parser.add_argument("input", type=Path, help="输入绿幕 PNG")
    parser.add_argument("output", type=Path, help="输出 RGBA PNG")
    args = parser.parse_args()
    dekey_image(args.input, args.output)


if __name__ == "__main__":
    main()
