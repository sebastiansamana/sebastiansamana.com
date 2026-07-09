(() => {
    const runtime = (window.__varelismMathVisualisationCanvas ||= {
      pageLoadListenerAttached: false,
    });
    const seeds = [
      [0.037, -0.021],
      [0.092, 0.026],
      [-0.028, 0.065],
      [-0.72, 0.18],
      [-0.665, 0.235],
      [0.68, -0.34],
      [0.594, -0.278],
      [-0.38, -0.58],
      [-0.466, -0.498],
      [0.42, 0.64],
      [0.516, 0.706],
      [-1.05, 0.82],
      [1.1, -0.82],
      [-0.18, -0.16],
      [0.18, 0.16],
      [-0.24, 0.22],
      [0.24, -0.22],
      [-0.92, -0.26],
      [0.92, 0.26],
      [-0.16, 0.92],
      [0.16, -0.92],
    ];

    for (let ring = 0; ring < 1; ring += 1) {
      const radius = 0.14 + ring * 0.22;
      const count = 8 + ring * 5;

      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + ring * 0.37;
        seeds.push([
          Math.cos(angle) * radius + Math.sin(angle * 2.1) * 0.035,
          Math.sin(angle) * radius * 0.78 + Math.cos(angle * 1.7) * 0.03,
        ]);
      }
    }

    const keyframes = [
      [
        0,
        [-1.0355, -0.178, 0.0077, -0.811, -1.3629, 0.2218, 0.354, -0.4487, -0.0891, -0.8791, -0.3912, -1.547],
        [310, 1065],
        0.62,
      ],
      [
        0.78,
        [-0.9175, -0.1933, 0.0939, -0.7674, -1.1117, 0.0338, 0.1939, -0.1721, 0.1187, -0.6935, -0.4051, -1.4562],
        [430, 1100],
        0.66,
      ],
      [
        1.12,
        [-0.8456, -0.2026, 0.1464, -0.7409, -0.9505, -0.0809, 0.0963, -0.0033, 0.2455, -0.5802, -0.4135, -1.4008],
        [440, 1090],
        0.66,
      ],
      [
        1.38,
        [-0.7742, -0.2118, 0.1986, -0.7145, -0.8065, -0.1947, -0.0006, 0.1641, 0.3713, -0.4679, -0.4219, -1.3458],
        [442, 1042],
        0.52,
      ],
      [
        3.72,
        [-0.3578, -0.2656, 0.5027, -0.5607, 0.0802, -0.8585, -0.5658, 1.1406, 1.1052, 0.1875, -0.4708, -1.0252],
        [498, 1050],
        1.15,
      ],
      [
        4.1,
        [-0.347, -0.2667, 0.5098, -0.5562, 0.1024, -0.8749, -0.5795, 1.1637, 1.1225, 0.2035, -0.4722, -1.017],
        [498, 1048],
        1.18,
      ],
      [
        4.37,
        [-0.3476, -0.267, 0.5101, -0.5569, 0.1019, -0.8748, -0.5796, 1.1645, 1.1231, 0.2035, -0.472, -1.0174],
        [498, 1048],
        1.18,
      ],
      [
        5.05,
        [-0.3056, -0.247, 0.4857, -0.4999, 0.1328, -0.8842, -0.5678, 1.1017, 1.0794, 0.1948, -0.4049, -0.9886],
        [705, 960],
        0.44,
      ],
      [
        6.82,
        [0.0768, -0.0651, 0.2631, 0.0201, 0.4143, -0.9696, -0.4597, 0.5288, 0.6807, 0.1144, -0.6024, -0.7263],
        [245, 675],
        0.22,
      ],
    ];

    const width = 992;
    const height = 1772;
    const centerAnchor = [width * 0.5, height * 0.5];
    const connectIterateStrokes = false;
    const targetRenderFrameMs = 1000 / 60;
    const sourceStates = [6, 7, 5].map((index) => {
      const [, params, anchor, scaleFactor] = keyframes[index];

      return {
        anchor,
        params,
        scaleFactor,
      };
    });
    const smoothstep = (value) => {
      const t = Math.min(1, Math.max(0, value));
      return t * t * (3 - 2 * t);
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    const color = (r, g, b, alpha) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const orbitFromSeed = (params, seed) => {
      const [a, b, c, d, e, f, g, h, i, j, k, l] = params;
      let x = seed[0];
      let y = seed[1];
      const points = [];

      for (let n = 0; n < 520; n += 1) {
        const nextX = a + b * x + c * x * x + d * x * y + e * y + f * y * y;
        const nextY = g + h * x + i * x * x + j * x * y + k * y + l * y * y;
        x = nextX;
        y = nextY;
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 12 || Math.abs(y) > 12) break;
        if (n >= 18) points.push([x, y]);
      }

      return points.length > 12 ? points : [];
    };

    const getPaths = (params) => seeds.map((seed) => orbitFromSeed(params, seed)).filter((path) => path.length);

    const measurePaths = (paths) => {
      let count = 0;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      paths.forEach((path) => {
        count += path.length;
        path.forEach(([x, y]) => {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        });
      });

      const spanX = maxX - minX;
      const spanY = maxY - minY;
      const span = Math.max(spanX, spanY);
      const ratio = Math.max(spanX, spanY) / Math.max(0.0001, Math.min(spanX, spanY));

      return { count, ratio, span };
    };

    const isDrawable = ({ count, ratio, span }) =>
      count > 680 && span > 0.035 && span < 8.5 && ratio < 18;

    const interpolateTargets = (from, to, phase) => {
      const u = smoothstep(phase);

      return {
        anchor: [lerp(from.anchor[0], to.anchor[0], u), lerp(from.anchor[1], to.anchor[1], u)],
        params: from.params.map((value, index) => lerp(value, to.params[index], u)),
        phase,
        scaleFactor: lerp(from.scaleFactor, to.scaleFactor, u),
      };
    };

    const createTargetChooser = () => {
      let seed = 729137;
      let serial = 0;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const pickSource = () => sourceStates[Math.floor(random() * sourceStates.length)];
      const sourceTarget = (index = 0) => {
        const source = sourceStates[index % sourceStates.length];
        return {
          anchor: [...centerAnchor],
          duration: 6.4,
          params: [...source.params],
          scaleFactor: 1.08,
          serial,
        };
      };

      const choose = (previous) => {
        for (let attempt = 0; attempt < 70; attempt += 1) {
          const a = pickSource();
          const b = pickSource();
          const mix = 0.12 + random() * 0.76;
          const jitter = 0.025 + random() * 0.09;
          const params = a.params.map((value, index) => {
            const coefficientWeight = index % 6 === 0 ? 0.45 : 1;
            const drift = (random() * 2 - 1) * jitter * coefficientWeight;
            const slowWave = Math.sin((serial + 1) * 0.73 + index * 1.91) * 0.026;
            const candidate = lerp(value, b.params[index], mix) + drift + slowWave;

            return clamp(candidate, -1.72, 1.72);
          });

          const softenedParams =
            previous && attempt < 42
              ? params.map((value, index) => lerp(previous.params[index], value, 0.72 + random() * 0.16))
              : params;
          const paths = getPaths(softenedParams);

          if (!isDrawable(measurePaths(paths))) continue;

          serial += 1;
          return {
            anchor: [...centerAnchor],
            duration: 6.2 + random() * 4.2,
            params: softenedParams,
            scaleFactor: 0.88 + random() * 0.42,
            serial,
          };
        }

        serial += 1;
        return sourceTarget(serial);
      };

      return {
        choose,
        initial: () => sourceTarget(0),
      };
    };

    const screenTransform = (paths, anchor, scaleFactor) => {
      let total = 0;
      const xs = [];
      const ys = [];

      paths.forEach((path) => {
        total += path.length;
      });

      const sampleStride = Math.max(1, Math.floor(total / 5200));

      paths.forEach((path) => {
        for (let i = 0; i < path.length; i += sampleStride) {
          const [x, y] = path[i];
          xs.push(x);
          ys.push(y);
        }
      });

      xs.sort((a, b) => a - b);
      ys.sort((a, b) => a - b);

      const quantile = (values, ratio) =>
        values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * ratio)))];
      const minX = quantile(xs, 0.008);
      const minY = quantile(ys, 0.008);
      const maxX = quantile(xs, 0.992);
      const maxY = quantile(ys, 0.992);
      const center = [(minX + maxX) * 0.5, (minY + maxY) * 0.5];
      const span = Math.max(maxX - minX, maxY - minY, 0.000001);
      const scale = (760 * scaleFactor) / span;

      return { center, scale, anchor };
    };

    const mapPath = (path, transform) =>
      path.map(([x, y]) => [
        (x - transform.center[0]) * transform.scale + transform.anchor[0],
        transform.anchor[1] - (y - transform.center[1]) * transform.scale,
      ]);

    const continuityLimit = (screen, cap) => {
      const deltas = [];
      for (let i = 1; i < screen.length; i += 1) {
        const dx = screen[i][0] - screen[i - 1][0];
        const dy = screen[i][1] - screen[i - 1][1];
        const distance = Math.hypot(dx, dy);
        if (Number.isFinite(distance) && distance > 0.05) deltas.push(distance);
      }
      if (!deltas.length) return cap;
      deltas.sort((a, b) => a - b);
      const sample = deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.64))];
      return Math.max(4.5, Math.min(cap, sample * 1.38));
    };

    const stampCircle = (ctx, point, rgba, radius, blur = 0) => {
      ctx.fillStyle = rgba;
      if (blur > 0) {
        ctx.shadowBlur = blur;
        ctx.shadowColor = rgba;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const wrapIndex = (index, length) => ((index % length) + length) % length;

    const curvatureAt = (screen, index, span = 5) => {
      if (screen.length < span * 2 + 1) return 0;

      const previous = screen[wrapIndex(index - span, screen.length)];
      const current = screen[wrapIndex(index, screen.length)];
      const next = screen[wrapIndex(index + span, screen.length)];
      if (!previous || !current || !next) return 0;

      const angleA = Math.atan2(current[1] - previous[1], current[0] - previous[0]);
      const angleB = Math.atan2(next[1] - current[1], next[0] - current[0]);
      let delta = Math.abs(angleB - angleA);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;

      const chord = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
      const arc =
        Math.hypot(current[0] - previous[0], current[1] - previous[1]) +
        Math.hypot(next[0] - current[0], next[1] - current[1]);
      const roundness = clamp(((arc - chord) / Math.max(arc, 0.01)) * 18, 0, 1);

      return delta * (0.62 + roundness * 0.78);
    };

    const curveWeightAt = (screen, index, span = 6) =>
      clamp((curvatureAt(screen, index, span) - 0.006) / 0.11, 0, 1);

    const localStepAt = (screen, index) => {
      const current = screen[wrapIndex(index, screen.length)];
      const previous = screen[wrapIndex(index - 1, screen.length)];
      const next = screen[wrapIndex(index + 1, screen.length)];

      return Math.max(
        Math.hypot(current[0] - previous[0], current[1] - previous[1]),
        Math.hypot(next[0] - current[0], next[1] - current[1]),
      );
    };

    const continuityWeightAt = (screen, index, limit) => {
      const step = localStepAt(screen, index);
      const longJumpLimit = Math.min(limit, 6.2);
      if (!Number.isFinite(step) || step > longJumpLimit) return 0;

      const lower = clamp((step - 0.006) / 0.34, 0.45, 1);
      const upper = clamp((longJumpLimit - step) / Math.max(0.8, longJumpLimit * 0.38), 0, 1);

      return lower * upper;
    };

    const strokeCurvedRibbon = (ctx, screen, pathIndex, alphaMultiplier) => {
      const limit = Math.min(continuityLimit(screen, 16), 18);
      const layers = [
        {
          alpha: pathIndex < 8 ? 0.165 : 0.088,
          blur: 1.85,
          shade: 28 + (pathIndex % 4) * 3,
          step: 4,
          threshold: 0.082,
          width: pathIndex < 8 ? 2.35 : 1.45,
        },
        {
          alpha: pathIndex < 8 ? 0.13 : 0.072,
          blur: 0.75,
          shade: 14 + (pathIndex % 4) * 2,
          step: 3,
          threshold: 0.096,
          width: pathIndex < 8 ? 0.92 : 0.56,
        },
        {
          alpha: pathIndex < 8 ? 0.36 : 0.19,
          blur: 0.22,
          shade: 2 + (pathIndex % 3),
          step: 3,
          threshold: 0.112,
          width: pathIndex < 8 ? 0.62 : 0.4,
        },
      ];

      layers.forEach((layer) => {
        let open = false;
        let segmentCount = 0;

        ctx.lineWidth = layer.width;
        ctx.strokeStyle = color(layer.shade, layer.shade, layer.shade, layer.alpha * alphaMultiplier);
        ctx.shadowBlur = layer.blur;
        ctx.shadowColor = ctx.strokeStyle;

        for (let index = layer.step; index < screen.length; index += layer.step) {
          const start = screen[index - layer.step];
          const control = screen[index - Math.max(1, Math.floor(layer.step * 0.5))];
          const end = screen[index];
          const jumpA = Math.hypot(control[0] - start[0], control[1] - start[1]);
          const jumpB = Math.hypot(end[0] - control[0], end[1] - control[1]);
          const curveWeight = curveWeightAt(screen, index - 1, 7);

          if (
            !Number.isFinite(jumpA) ||
            !Number.isFinite(jumpB) ||
            jumpA > limit ||
            jumpB > limit ||
            curveWeight < layer.threshold
          ) {
            if (open && segmentCount > 2) ctx.stroke();
            open = false;
            segmentCount = 0;
            continue;
          }

          const midX = (control[0] + end[0]) * 0.5;
          const midY = (control[1] + end[1]) * 0.5;

          if (!open) {
            ctx.beginPath();
            ctx.moveTo(start[0], start[1]);
            open = true;
          }

          ctx.quadraticCurveTo(control[0], control[1], midX, midY);
          segmentCount += 1;

          if (segmentCount >= 80) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(midX, midY);
            segmentCount = 0;
          }
        }

        if (open && segmentCount > 2) ctx.stroke();
      });
    };

    const drawPaths = (ctx, paths, transform, frame, options = {}) => {
      const alphaMultiplier = options.alphaMultiplier ?? 1;
      const bodyStep = options.bodyStep ?? 1;
      const screens = paths.map((path) => mapPath(path, transform));
      const cellSize = 18;
      const densityColumns = Math.ceil(width / cellSize) + 2;
      const densityRows = Math.ceil(height / cellSize) + 2;
      const density = new Uint16Array(densityColumns * densityRows);
      const densityCell = (point) => [
        clamp(Math.floor(point[0] / cellSize) + 1, 0, densityColumns - 1),
        clamp(Math.floor(point[1] / cellSize) + 1, 0, densityRows - 1),
      ];

      screens.forEach((screen) => {
        screen.forEach((point) => {
          if (point[0] < -24 || point[0] > width + 24 || point[1] < -24 || point[1] > height + 24) return;
          const [column, row] = densityCell(point);
          density[row * densityColumns + column] += 1;
        });
      });

      const localDensityAt = (point) => {
        const [column, row] = densityCell(point);
        let total = 0;

        for (let y = -1; y <= 1; y += 1) {
          for (let x = -1; x <= 1; x += 1) {
            const currentColumn = clamp(column + x, 0, densityColumns - 1);
            const currentRow = clamp(row + y, 0, densityRows - 1);
            const weight = x === 0 && y === 0 ? 1 : 0.42;
            total += density[currentRow * densityColumns + currentColumn] * weight;
          }
        }

        return total;
      };

      screens.forEach((screen, pathIndex) => {
        const pointStride = bodyStep;

        if (connectIterateStrokes) strokeCurvedRibbon(ctx, screen, pathIndex, alphaMultiplier);

        for (let i = pathIndex % pointStride; i < screen.length; i += pointStride) {
          const p = screen[i];
          if (p[0] < -10 || p[0] > width + 10 || p[1] < -10 || p[1] > height + 10) continue;
          const curveWeight = curveWeightAt(screen, i, 7);
          const weight = curveWeight ** 1.08;
          const densityWeight = smoothstep(clamp((localDensityAt(p) - 4.8) / 13.6, 0, 1));
          if (densityWeight <= 0.025) continue;

          const shade = 2 + 20 * (1 - weight);

          if ((i + pathIndex) % 2 === 0) {
            stampCircle(
              ctx,
              p,
              color(
                42,
                42,
                42,
                (pathIndex < 8 ? 0.13 : 0.07) * (0.42 + weight) * densityWeight * alphaMultiplier,
              ),
              0.36 + 0.12 * weight,
              0,
            );
          }

          stampCircle(
            ctx,
            p,
            color(
              shade,
              shade,
              shade,
              (pathIndex < 8 ? 0.34 : 0.19) * (0.28 + weight) * densityWeight * alphaMultiplier,
            ),
            0.15 + 0.17 * weight,
            0,
          );
        }
      });

      ctx.shadowBlur = 0;
    };

    const setupHeroCanvas = () => {
      document.querySelectorAll('[data-math-hero-canvas]').forEach((canvas) => {
        if (!(canvas instanceof HTMLCanvasElement) || canvas.dataset.mathHeroReady === 'true') return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        canvas.dataset.mathHeroReady = 'true';
        let renderScale = 1;
        let frame = 0;
        let lastPaint = 0;
        let animationFrame = 0;
        let segmentDurationMs = 0;
        let segmentStart = 0;
        let smoothedTransform = null;
        const targetChooser = createTargetChooser();
        let currentTarget = targetChooser.initial();
        let nextTarget = targetChooser.choose(currentTarget);
        segmentDurationMs = nextTarget.duration * 1000;
        const renderScaleCap = clamp(Number.parseFloat(canvas.dataset.mathRenderScaleCap || '3'), 1, 3);
        const pixelRatioCap = clamp(Number.parseFloat(canvas.dataset.mathPixelRatioCap || '2'), 1, 2);

        const configureContext = () => {
          ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        };

        const resizeCanvas = () => {
          const rect = canvas.getBoundingClientRect();
          const displayScale = Math.max(rect.width / width, rect.height / height, 1);
          const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
          const targetScale = Math.round(Math.min(renderScaleCap, displayScale * pixelRatio) * 4) / 4;
          const nextWidth = Math.max(width, Math.round(width * targetScale));
          const nextHeight = Math.max(height, Math.round(height * targetScale));

          if (canvas.width === nextWidth && canvas.height === nextHeight && renderScale === targetScale) {
            return false;
          }

          renderScale = targetScale;
          canvas.width = nextWidth;
          canvas.height = nextHeight;
          configureContext();
          return true;
        };

        const clearCanvas = () => {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        };

        const stabilizeTransform = (desired, deltaMs, snap = false) => {
          if (!smoothedTransform || snap) {
            smoothedTransform = {
              anchor: [...desired.anchor],
              center: [...desired.center],
              scale: desired.scale,
            };

            return smoothedTransform;
          }

          const frameDelta = Math.min(deltaMs, 80);
          const anchorAmount = 1 - Math.exp(-frameDelta / 420);
          const centerAmount = 1 - Math.exp(-frameDelta / 440);
          const scaleAmount = 1 - Math.exp(-frameDelta / 560);
          const settle = (current, target, amount, deadband = 0) => {
            const diff = target - current;
            if (Math.abs(diff) <= deadband) return current;
            return current + diff * amount;
          };

          smoothedTransform = {
            anchor: [
              settle(smoothedTransform.anchor[0], desired.anchor[0], anchorAmount, 0.08),
              settle(smoothedTransform.anchor[1], desired.anchor[1], anchorAmount, 0.08),
            ],
            center: [
              settle(smoothedTransform.center[0], desired.center[0], centerAmount, 0.0004),
              settle(smoothedTransform.center[1], desired.center[1], centerAmount, 0.0004),
            ],
            scale: settle(smoothedTransform.scale, desired.scale, scaleAmount, 0.18),
          };

          return smoothedTransform;
        };

        const renderState = (state, frameNumber, deltaMs = targetRenderFrameMs, snapTransform = false) => {
          const paths = getPaths(state.params);

          clearCanvas();

          if (paths.length) {
            const transform = stabilizeTransform(
              screenTransform(paths, state.anchor, state.scaleFactor),
              deltaMs,
              snapTransform,
            );
            drawPaths(ctx, paths, transform, frameNumber, { alphaMultiplier: 1.48, bodyStep: 1 });
          }
        };

        const primeCanvas = () => {
          renderState(interpolateTargets(currentTarget, nextTarget, 0), 0, targetRenderFrameMs, true);
        };

        resizeCanvas();
        primeCanvas();

        const onResize = () => {
          if (resizeCanvas()) {
            primeCanvas();
          }
        };

        const paint = (timestamp) => {
          if (!segmentStart) segmentStart = timestamp;

          const deltaMs = lastPaint ? Math.min(80, timestamp - lastPaint) : targetRenderFrameMs;

          if (resizeCanvas()) {
            primeCanvas();
          }

          frame += deltaMs / targetRenderFrameMs;

          while (timestamp - segmentStart >= segmentDurationMs) {
            currentTarget = nextTarget;
            nextTarget = targetChooser.choose(currentTarget);
            segmentStart += segmentDurationMs;
            segmentDurationMs = nextTarget.duration * 1000;
          }

          const phase = clamp((timestamp - segmentStart) / Math.max(1, segmentDurationMs), 0, 1);
          const state = interpolateTargets(currentTarget, nextTarget, phase);

          renderState(state, frame, deltaMs);

          lastPaint = timestamp;

          animationFrame = window.requestAnimationFrame(paint);
        };

        window.addEventListener('resize', onResize);
        window.visualViewport?.addEventListener('resize', onResize);
        animationFrame = window.requestAnimationFrame(paint);

        document.addEventListener('astro:before-swap', () => {
          window.removeEventListener('resize', onResize);
          window.visualViewport?.removeEventListener('resize', onResize);
          window.cancelAnimationFrame(animationFrame);
        }, { once: true });
      });
    };

    setupHeroCanvas();
    if (!runtime.pageLoadListenerAttached) {
      document.addEventListener('astro:page-load', setupHeroCanvas);
      runtime.pageLoadListenerAttached = true;
    }
  })();
