#!/usr/bin/env python3
"""Resize an image by a scale factor.

Usage:
    python test/scripts/resize.py <input_image> <output_dir> <scale>
"""

from pathlib import Path
import argparse
import cv2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Resize an image by scale factor")
    parser.add_argument("input_image", help="Path to input image")
    parser.add_argument("output_dir", help="Directory where resized image will be saved")
    parser.add_argument(
        "scale_factor",
        type=float,
        help="Resize scale (e.g. 0.25 for 1/4, 2 for 2x)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_path = Path(args.input_image)
    output_dir = Path(args.output_dir)
    scale = args.scale_factor

    if scale <= 0:
        raise ValueError("scale_factor must be greater than 0")

    image = cv2.imread(str(input_path))
    if image is None:
        raise FileNotFoundError(f"Failed to read image: {input_path}")

    original_h, original_w = image.shape[:2]
    new_w = max(1, int(round(original_w * scale)))
    new_h = max(1, int(round(original_h * scale)))

    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / input_path.name
    cv2.imwrite(str(output_path), resized)

    print(f"Saved: {output_path}")
    print(f"Original: {original_w}x{original_h} -> Resized: {new_w}x{new_h}")


if __name__ == "__main__":
    main()
