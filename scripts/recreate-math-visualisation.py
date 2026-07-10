"""Recreate the first seven seconds of the polynomial-map visualisation.

The source video was made by searching 12-dimensional coefficient vectors for
bounded/drawable quadratic maps, then interpolating between selected maps. The
original selected keyframes are not available in this repo, so this script uses
a deterministic replacement sequence found with the same style of manual
search: random bounded candidates, visual inspection, then interpolation.

The rendered output is a clean hero composition: no title, formula, debug text,
or MX/MY coefficient overlay. The current export uses inverted colours.

Dependencies:
    python -m pip install numpy opencv-python-headless
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Iterable

try:
    import cv2
    import numpy as np
except ModuleNotFoundError as exc:  # pragma: no cover - friendly runtime error
    raise SystemExit(
        "Missing dependency. Install with:\n"
        "  python -m pip install numpy opencv-python-headless"
    ) from exc


WIDTH = 992
HEIGHT = 1772
FPS = 30
SECONDS = 7.0
SEEDS = [
    (0.037, -0.021),
    (0.092, 0.026),
    (-0.028, 0.065),
    (-0.72, 0.18),
    (-0.665, 0.235),
    (0.68, -0.34),
    (0.594, -0.278),
    (-0.38, -0.58),
    (-0.466, -0.498),
    (0.42, 0.64),
    (0.516, 0.706),
    (-1.05, 0.82),
    (1.10, -0.82),
]

# Each keyframe stores:
# (time in seconds, [a,b,c,d,e,f,g,h,i,j,k,l], screen anchor, visual scale)
#
# The coefficient sets below are read from the visible MX/MY debug text in the
# first seven seconds of the provided reference video. They are rounded to four
# decimals because that is all the source overlay exposes.
KEYFRAMES = [
    (
        0.00,
        [
            -1.0355,
            -0.1780,
            0.0077,
            -0.8110,
            -1.3629,
            0.2218,
            0.3540,
            -0.4487,
            -0.0891,
            -0.8791,
            -0.3912,
            -1.5470,
        ],
        (310.0, 1065.0),
        0.62,
    ),
    (
        0.78,
        [
            -0.9175,
            -0.1933,
            0.0939,
            -0.7674,
            -1.1117,
            0.0338,
            0.1939,
            -0.1721,
            0.1187,
            -0.6935,
            -0.4051,
            -1.4562,
        ],
        (430.0, 1100.0),
        0.66,
    ),
    (
        1.12,
        [
            -0.8456,
            -0.2026,
            0.1464,
            -0.7409,
            -0.9505,
            -0.0809,
            0.0963,
            -0.0033,
            0.2455,
            -0.5802,
            -0.4135,
            -1.4008,
        ],
        (440.0, 1090.0),
        0.66,
    ),
    (
        1.38,
        [
            -0.7742,
            -0.2118,
            0.1986,
            -0.7145,
            -0.8065,
            -0.1947,
            -0.0006,
            0.1641,
            0.3713,
            -0.4679,
            -0.4219,
            -1.3458,
        ],
        (442.0, 1042.0),
        0.52,
    ),
    (
        3.72,
        [
            -0.3578,
            -0.2656,
            0.5027,
            -0.5607,
            0.0802,
            -0.8585,
            -0.5658,
            1.1406,
            1.1052,
            0.1875,
            -0.4708,
            -1.0252,
        ],
        (498.0, 1050.0),
        1.15,
    ),
    (
        4.10,
        [
            -0.3470,
            -0.2667,
            0.5098,
            -0.5562,
            0.1024,
            -0.8749,
            -0.5795,
            1.1637,
            1.1225,
            0.2035,
            -0.4722,
            -1.0170,
        ],
        (498.0, 1048.0),
        1.18,
    ),
    (
        4.37,
        [
            -0.3476,
            -0.2670,
            0.5101,
            -0.5569,
            0.1019,
            -0.8748,
            -0.5796,
            1.1645,
            1.1231,
            0.2035,
            -0.4720,
            -1.0174,
        ],
        (498.0, 1048.0),
        1.18,
    ),
    (
        5.05,
        [
            -0.3056,
            -0.2470,
            0.4857,
            -0.4999,
            0.1328,
            -0.8842,
            -0.5678,
            1.1017,
            1.0794,
            0.1948,
            -0.4049,
            -0.9886,
        ],
        (705.0, 960.0),
        0.44,
    ),
    (
        6.82,
        [
            0.0768,
            -0.0651,
            0.2631,
            0.0201,
            0.4143,
            -0.9696,
            -0.4597,
            0.5288,
            0.6807,
            0.1144,
            -0.6024,
            -0.7263,
        ],
        (245.0, 675.0),
        0.22,
    ),
]


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def interpolate_state(seconds: float) -> tuple[np.ndarray, tuple[float, float], float, int]:
    for idx in range(len(KEYFRAMES) - 1):
        t0, p0, c0, s0 = KEYFRAMES[idx]
        t1, p1, c1, s1 = KEYFRAMES[idx + 1]
        if t0 <= seconds <= t1:
            u = smoothstep((seconds - t0) / max(1e-6, t1 - t0))
            params = np.array([lerp(a, b, u) for a, b in zip(p0, p1)], dtype=np.float64)
            anchor = (lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u))
            scale = lerp(s0, s1, u)
            return params, anchor, scale, idx

    last = KEYFRAMES[-1]
    return np.array(last[1], dtype=np.float64), last[2], last[3], len(KEYFRAMES) - 1


def orbit_from_seed(
    params: np.ndarray,
    seed: tuple[float, float],
    steps: int = 880,
    burn: int = 78,
) -> np.ndarray:
    a, b, c, d, e, f, g, h, i, j, k, l = params
    x, y = seed
    points: list[tuple[float, float]] = []

    for n in range(steps):
        x, y = (
            a + b * x + c * x * x + d * x * y + e * y + f * y * y,
            g + h * x + i * x * x + j * x * y + k * y + l * y * y,
        )
        if not math.isfinite(x) or not math.isfinite(y) or abs(x) > 12 or abs(y) > 12:
            break
        if n >= burn:
            points.append((x, y))

    if len(points) < 12:
        return np.empty((0, 2), dtype=np.float32)
    return np.asarray(points, dtype=np.float32)


def orbits(params: np.ndarray) -> list[np.ndarray]:
    paths = [orbit_from_seed(params, seed) for seed in SEEDS]
    return [path for path in paths if len(path) > 0]


def screen_transform(
    paths: list[np.ndarray],
    anchor: tuple[float, float],
    size_factor: float,
) -> tuple[np.ndarray, float]:
    points = np.vstack(paths)
    lo = points.min(axis=0)
    hi = points.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    center = (lo + hi) * 0.5
    target = 440.0 * size_factor
    scale = target / float(max(span[0], span[1]))
    return center, scale


def map_to_screen(
    points: np.ndarray,
    center: np.ndarray,
    scale: float,
    anchor: tuple[float, float],
) -> np.ndarray:
    pix = (points - center) * scale + np.asarray(anchor, dtype=np.float32)
    pix[:, 1] = anchor[1] - (points[:, 1] - center[1]) * scale
    return pix


def to_screen_paths(
    paths: list[np.ndarray],
    anchor: tuple[float, float],
    size_factor: float,
) -> list[np.ndarray]:
    if not paths:
        return []

    center, scale = screen_transform(paths, anchor, size_factor)
    screen_paths: list[np.ndarray] = []
    for path in paths:
        screen_paths.append(map_to_screen(path, center, scale, anchor))
    return screen_paths


def add_glow_line(
    layer: np.ndarray,
    p0: tuple[int, int],
    p1: tuple[int, int],
    color: tuple[int, int, int],
    strength: float,
) -> None:
    if strength <= 0:
        return
    glow = tuple(int(c * strength * 0.14) for c in color)
    core = tuple(int(c * strength * 0.78) for c in color)
    cv2.line(layer, p0, p1, glow, 4, cv2.LINE_AA)
    cv2.line(layer, p0, p1, core, 1, cv2.LINE_AA)


def add_glow_point(
    layer: np.ndarray,
    point: tuple[int, int],
    color: tuple[int, int, int],
    strength: float,
    radius: int = 1,
) -> None:
    if strength <= 0:
        return
    glow_radius = max(radius + 1, int(round(2 + strength * 3.0)))
    glow = tuple(int(c * strength * 0.12) for c in color)
    core = tuple(int(c * strength * 0.62) for c in color)
    cv2.circle(layer, point, glow_radius, glow, -1, cv2.LINE_AA)
    cv2.circle(layer, point, radius, core, -1, cv2.LINE_AA)


def continuity_limit(screen: np.ndarray, cap: float) -> float:
    if len(screen) < 3:
        return cap

    deltas = np.linalg.norm(np.diff(screen, axis=0), axis=1)
    usable = deltas[np.isfinite(deltas) & (deltas > 0.05)]
    if len(usable) == 0:
        return cap

    local = float(np.percentile(usable, 64)) * 1.38
    return max(4.5, min(cap, local))


def render_orbit_layer(
    params: np.ndarray,
    anchor: tuple[float, float],
    size_factor: float,
    frame_index: int,
    segment_index: int,
    width: int,
    height: int,
) -> np.ndarray:
    layer = np.zeros((height, width, 3), dtype=np.float32)
    density = np.zeros_like(layer)
    paths = orbits(params)
    if not paths:
        return layer

    screen_paths = to_screen_paths(paths, anchor, size_factor)
    purple = np.array((185, 24, 205), dtype=np.float32)
    orange = np.array((42, 115, 255), dtype=np.float32)

    for path_index, raw_screen in enumerate(screen_paths):
        screen = raw_screen
        valid = (
            (screen[:, 0] >= -20)
            & (screen[:, 0] < width + 20)
            & (screen[:, 1] >= -20)
            & (screen[:, 1] < height + 20)
        )
        short_jump_limit = continuity_limit(screen, 14.0)

        # This density pass supplies the translucent body, but it is not allowed
        # to survive as fog. A contrast pass later suppresses weak haze.
        point_stride = 5 if path_index > 10 else 4
        for idx in range((path_index * 2) % point_stride, len(screen), point_stride):
            if not valid[idx]:
                continue
            t = idx / max(1, len(screen) - 1)
            color_arr = purple * (1.0 - t) + orange * t
            color = tuple(int(v * 0.13) for v in color_arr)
            x, y = np.round(screen[idx]).astype(int)
            cv2.circle(density, (int(x), int(y)), 1, color, -1, cv2.LINE_AA)

        line_stride = 2 if len(screen) > 520 or path_index > 6 else 1
        for idx in range(1 + (path_index % line_stride), len(screen), line_stride):
            if not (valid[idx] and valid[idx - 1]):
                continue
            t = idx / max(1, len(screen) - 1)
            pulse = 0.82 + 0.18 * math.sin(frame_index * 0.15 + idx * 0.011)
            color_arr = purple * (1.0 - t) + orange * t
            color = tuple(int(v) for v in color_arr)
            if t > 0.72:
                color = (
                    min(255, color[0] + 25),
                    min(255, color[1] + 85),
                    min(255, color[2] + 15),
                )
            p0 = tuple(np.round(screen[idx - 1]).astype(int))
            p1 = tuple(np.round(screen[idx]).astype(int))
            jump = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            if jump <= short_jump_limit:
                add_glow_line(layer, p0, p1, color, 0.28 * pulse)
            elif jump <= short_jump_limit * 1.45 and idx % 3 == 0:
                add_glow_point(layer, p1, color, 0.22 * pulse)

    blurred_density = cv2.GaussianBlur(density, (0, 0), 2.4)
    soft_glow = cv2.GaussianBlur(layer, (0, 0), 1.25)
    layer = layer * 0.98 + soft_glow * 0.28 + blurred_density * 2.2
    return layer


def initial_walkers() -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(1207)
    base: list[tuple[float, float]] = []
    for seed in SEEDS:
        sx, sy = seed
        base.append((sx, sy))
        for radius in (0.045, 0.095, 0.16):
            for angle in (0.0, 2.0943951024, 4.1887902048):
                base.append((sx + math.cos(angle) * radius, sy + math.sin(angle) * radius))

    while len(base) < 84:
        r = rng.uniform(0.08, 1.05)
        a = rng.uniform(0.0, math.tau)
        base.append((math.cos(a) * r, math.sin(a) * r))

    bases = np.asarray(base[:84], dtype=np.float32)
    states = bases + rng.normal(0.0, 0.018, bases.shape).astype(np.float32)
    return states, bases


def step_walkers(states: np.ndarray, params: np.ndarray) -> np.ndarray:
    a, b, c, d, e, f, g, h, i, j, k, l = params
    x = states[:, 0]
    y = states[:, 1]
    return np.column_stack(
        (
            a + b * x + c * x * x + d * x * y + e * y + f * y * y,
            g + h * x + i * x * x + j * x * y + k * y + l * y * y,
        )
    ).astype(np.float32)


def reseed_walkers(
    states: np.ndarray,
    bases: np.ndarray,
    mask: np.ndarray,
    rng: np.random.Generator,
) -> None:
    if not np.any(mask):
        return
    states[mask] = bases[mask] + rng.normal(0.0, 0.035, (int(mask.sum()), 2)).astype(np.float32)


def draw_walker_layer(
    states: np.ndarray,
    bases: np.ndarray,
    params: np.ndarray,
    anchor: tuple[float, float],
    size_factor: float,
    frame_index: int,
    width: int,
    height: int,
    rng: np.random.Generator,
) -> np.ndarray:
    reference_paths = orbits(params)
    layer = np.zeros((height, width, 3), dtype=np.float32)
    if not reference_paths:
        return layer

    center, scale = screen_transform(reference_paths, anchor, size_factor)
    purple = np.array((180, 24, 210), dtype=np.float32)
    rose = np.array((80, 80, 240), dtype=np.float32)
    gold = np.array((32, 182, 255), dtype=np.float32)

    microsteps = 18
    for substep in range(microsteps):
        previous = states.copy()
        proposed = step_walkers(states, params)
        invalid = (
            ~np.isfinite(proposed).all(axis=1)
            | (np.abs(proposed[:, 0]) > 9.0)
            | (np.abs(proposed[:, 1]) > 9.0)
        )
        reseed_walkers(states, bases, invalid, rng)
        proposed[invalid] = states[invalid]

        prev_screen = map_to_screen(previous, center, scale, anchor)
        next_screen = map_to_screen(proposed, center, scale, anchor)
        head = substep / max(1, microsteps - 1)

        for walker_index, (p0f, p1f) in enumerate(zip(prev_screen, next_screen)):
            if invalid[walker_index]:
                continue
            p0 = tuple(np.round(p0f).astype(int))
            p1 = tuple(np.round(p1f).astype(int))
            if not (
                -40 <= p0[0] <= width + 40
                and -40 <= p0[1] <= height + 40
                and -40 <= p1[0] <= width + 40
                and -40 <= p1[1] <= height + 40
            ):
                continue

            jump = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            if jump <= 3.0 or jump > 72.0:
                # Long jumps become occasional sparks, not straight lines.
                if jump > 72.0 and walker_index % 19 == 0 and substep == microsteps - 1:
                    cv2.circle(layer, p1, 1, (205, 230, 235), -1, cv2.LINE_AA)
                continue

            color_mix = min(1.0, 0.22 + head * 0.95)
            warm = rose * (1.0 - color_mix) + gold * color_mix
            color_arr = purple * (1.0 - head) + warm * head
            if walker_index % 7 == 0:
                color_arr = color_arr * 0.85 + gold * 0.15
            color = tuple(int(v) for v in color_arr)
            strength = 0.18 + 0.24 * head
            add_glow_line(layer, p0, p1, color, strength)

        states[:] = proposed

    soft_glow = cv2.GaussianBlur(layer, (0, 0), 1.25)
    return layer * 0.92 + soft_glow * 0.42


def draw_sweeping_orbit_layer(
    params: np.ndarray,
    anchor: tuple[float, float],
    size_factor: float,
    frame_index: int,
    segment_index: int,
    width: int,
    height: int,
) -> np.ndarray:
    paths = orbits(params)
    layer = np.zeros((height, width, 3), dtype=np.float32)
    if not paths:
        return layer

    screen_paths = to_screen_paths(paths, anchor, size_factor)
    purple = np.array((175, 22, 205), dtype=np.float32)
    rose = np.array((82, 72, 238), dtype=np.float32)
    gold = np.array((28, 168, 255), dtype=np.float32)

    for path_index, screen in enumerate(screen_paths):
        if len(screen) < 80:
            continue
        valid = (
            (screen[:, 0] >= -40)
            & (screen[:, 0] <= width + 40)
            & (screen[:, 1] >= -40)
            & (screen[:, 1] <= height + 40)
        )
        short_jump_limit = continuity_limit(screen, 12.5)

        head_count = 2 if path_index < 8 else 1
        for head_index in range(head_count):
            speed = 4 + (path_index % 4) * 2 + head_index * 3
            head = (
                frame_index * speed
                + path_index * 131
                + head_index * (len(screen) // max(2, head_count + 1))
                + segment_index * 43
            ) % len(screen)
            tail_length = min(len(screen) - 2, 118 + 16 * (path_index % 3) + 12 * head_index)

            for tail_step in range(tail_length, 0, -1):
                i0 = (head - tail_step) % len(screen)
                i1 = (head - tail_step + 1) % len(screen)
                if not (valid[i0] and valid[i1]):
                    continue
                p0 = tuple(np.round(screen[i0]).astype(int))
                p1 = tuple(np.round(screen[i1]).astype(int))
                jump = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
                if jump <= 2.0:
                    continue

                life = 1.0 - tail_step / tail_length
                warm = rose * (1.0 - life) + gold * life
                color_arr = purple * (1.0 - life) + warm * life
                color = tuple(int(v) for v in color_arr)
                strength = 0.025 + (life**1.55) * 0.20
                if jump <= short_jump_limit:
                    add_glow_line(layer, p0, p1, color, strength)
                elif jump <= short_jump_limit * 1.35:
                    add_glow_point(layer, p1, color, strength * 0.9)

    soft_glow = cv2.GaussianBlur(layer, (0, 0), 1.05)
    return layer * 0.98 + soft_glow * 0.30


def ensure_writer(path: Path, fps: int, width: int, height: int) -> cv2.VideoWriter:
    path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        raise RuntimeError(f"Could not open video writer for {path}")
    return writer


def finish_frame(frame: np.ndarray, invert_colors: bool) -> np.ndarray:
    frame = np.clip(frame, 0, 255).astype(np.uint8)
    if not invert_colors:
        return frame

    inverted = cv2.bitwise_not(frame)

    # Work in "ink on white" space: faint fog is weak ink, while curves and
    # contours are strong ink. The power curve removes low-density haze without
    # erasing the translucent body.
    ink = (255.0 - inverted.astype(np.float32)) / 255.0
    ink = np.power(np.clip(ink, 0.0, 1.0), 1.34) * 1.24
    ink = np.clip(ink, 0.0, 1.0)

    blur = cv2.GaussianBlur(ink, (0, 0), 1.15)
    ink = np.clip(ink * 1.38 - blur * 0.30, 0.0, 1.0)

    return np.clip(255.0 - ink * 255.0, 0, 255).astype(np.uint8)


def write_video(
    output: Path,
    poster: Path,
    width: int,
    height: int,
    fps: int,
    seconds: float,
    invert_colors: bool,
) -> None:
    total_frames = int(round(fps * seconds))
    writer = ensure_writer(output, fps, width, height)
    trail = np.zeros((height, width, 3), dtype=np.float32)
    poster_frame: np.ndarray | None = None
    for frame_index in range(total_frames):
        t = frame_index / fps
        params, anchor, size_factor, segment_index = interpolate_state(t)

        decay = 0.958
        if 1.45 < t < 3.45:
            decay = 0.925
        if 5.0 < t:
            decay = 0.93
        trail *= decay

        body_layer = render_orbit_layer(
            params,
            anchor,
            size_factor,
            frame_index,
            segment_index,
            width,
            height,
        )
        trace_layer = draw_sweeping_orbit_layer(
            params,
            anchor,
            size_factor,
            frame_index,
            segment_index,
            width,
            height,
        )
        trail += body_layer * (0.56 if t < 1.5 else 0.68)
        trail += trace_layer * (0.22 if t < 1.5 else 0.28)

        frame = finish_frame(trail, invert_colors)
        writer.write(frame)

        if frame_index == min(total_frames - 1, int(round(4.2 * fps))):
            poster_frame = frame.copy()

    writer.release()

    if poster_frame is None:
        poster_frame = frame
    poster.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(poster), poster_frame)


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/videos/math-visualisation-recreation.mp4"),
    )
    parser.add_argument(
        "--poster",
        type=Path,
        default=Path("public/videos/math-visualisation-recreation-poster.png"),
    )
    parser.add_argument("--width", type=int, default=WIDTH)
    parser.add_argument("--height", type=int, default=HEIGHT)
    parser.add_argument("--fps", type=int, default=FPS)
    parser.add_argument("--seconds", type=float, default=SECONDS)
    parser.add_argument(
        "--normal-colors",
        action="store_true",
        help="Render without the inverted-colour treatment.",
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    write_video(
        args.output,
        args.poster,
        args.width,
        args.height,
        args.fps,
        args.seconds,
        invert_colors=not args.normal_colors,
    )
    print(f"Wrote {args.output}")
    print(f"Wrote {args.poster}")


if __name__ == "__main__":
    main()
