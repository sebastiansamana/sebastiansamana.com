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

    for (let ring = 0; ring < 3; ring += 1) {
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
    const connectIterateStrokes = true;
    const defaultInitialTimelineOffsetMs = 146 * 1000;
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
    const varelismRed = [106, 28, 23];
    const redInk = (shade, alpha) => {
      const lift = clamp(shade / 32, 0, 1);

      return color(
        lerp(varelismRed[0], 156, lift),
        lerp(varelismRed[1], 54, lift),
        lerp(varelismRed[2], 47, lift),
        alpha,
      );
    };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const orbitFromSeed = (params, seed) => {
      const [a, b, c, d, e, f, g, h, i, j, k, l] = params;
      let x = seed[0];
      let y = seed[1];
      const points = [];

      for (let n = 0; n < 680; n += 1) {
        const nextX = a + b * x + c * x * x + d * x * y + e * y + f * y * y;
        const nextY = g + h * x + i * x * x + j * x * y + k * y + l * y * y;
        x = nextX;
        y = nextY;
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 12 || Math.abs(y) > 12) break;
        if (n >= 24) points.push([x, y]);
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
          duration: 16.4,
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
            duration: 16 + random() * 10.4,
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
      const minX = quantile(xs, 0.014);
      const minY = quantile(ys, 0.014);
      const maxX = quantile(xs, 0.986);
      const maxY = quantile(ys, 0.986);
      const center = [(minX + maxX) * 0.5, (minY + maxY) * 0.5];
      const span = Math.max(maxX - minX, maxY - minY, 0.000001);
      const scale = (742 * scaleFactor) / span;

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
          alpha: pathIndex < 8 ? 0.018 : 0.01,
          blur: 0.82,
          shade: 14 + (pathIndex % 4) * 2,
          step: 4,
          threshold: 0.092,
          width: pathIndex < 8 ? 0.68 : 0.42,
        },
        {
          alpha: pathIndex < 8 ? 0.045 : 0.026,
          blur: 0.24,
          shade: 6 + (pathIndex % 4),
          step: 3,
          threshold: 0.106,
          width: pathIndex < 8 ? 0.32 : 0.22,
        },
        {
          alpha: pathIndex < 8 ? 0.105 : 0.06,
          blur: 0.22,
          shade: pathIndex % 2,
          step: 3,
          threshold: 0.122,
          width: pathIndex < 8 ? 0.16 : 0.12,
        },
      ];

      layers.forEach((layer) => {
        let open = false;
        let segmentCount = 0;

        ctx.lineWidth = layer.width;
        ctx.strokeStyle = redInk(layer.shade, layer.alpha * alphaMultiplier);
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
      const pointScale = options.pointScale ?? 1;
      const pointSizeMultiplier = options.pointSizeMultiplier ?? 1;
      const pointAlphaOverride = Number.isFinite(options.pointAlphaOverride)
        ? clamp(options.pointAlphaOverride, 0, 1)
        : null;
      const screens = paths.map((path) => mapPath(path, transform));
      const cellSize = 18;
      const densityColumns = Math.ceil(width / cellSize) + 2;
      const densityRows = Math.ceil(height / cellSize) + 2;
      const density = new Uint16Array(densityColumns * densityRows);
      const densityIndexAt = (point) => {
        const column = clamp(Math.floor(point[0] / cellSize) + 1, 0, densityColumns - 1);
        const row = clamp(Math.floor(point[1] / cellSize) + 1, 0, densityRows - 1);

        return row * densityColumns + column;
      };

      screens.forEach((screen) => {
        screen.forEach((point) => {
          if (point[0] < -24 || point[0] > width + 24 || point[1] < -24 || point[1] > height + 24) return;
          density[densityIndexAt(point)] += 1;
        });
      });

      const localDensity = new Float32Array(density.length);

      for (let row = 0; row < densityRows; row += 1) {
        for (let column = 0; column < densityColumns; column += 1) {
          let total = 0;

          for (let y = -1; y <= 1; y += 1) {
            for (let x = -1; x <= 1; x += 1) {
              const currentColumn = clamp(column + x, 0, densityColumns - 1);
              const currentRow = clamp(row + y, 0, densityRows - 1);
              const weight = x === 0 && y === 0 ? 1 : 0.42;
              total += density[currentRow * densityColumns + currentColumn] * weight;
            }
          }

          localDensity[row * densityColumns + column] = total;
        }
      }

      const localDensityAt = (point) => {
        return localDensity[densityIndexAt(point)];
      };

      const pointBatches = new Map();
      const addCircleToBatch = (point, shade, alpha, radius) => {
        const alphaBucket = clamp(Math.round(alpha * 240), 0, 240);
        if (alphaBucket < 1 || radius <= 0) return;

        const shadeBucket = clamp(Math.round(shade), 0, 255);
        const radiusBucket = Math.max(1, Math.round(radius * 200));
        const key = `${shadeBucket}:${alphaBucket}:${radiusBucket}`;
        let batch = pointBatches.get(key);

        if (!batch) {
          batch = {
            alpha: alphaBucket / 240,
            points: [],
            radius: radiusBucket / 200,
            shade: shadeBucket,
          };
          pointBatches.set(key, batch);
        }

        batch.points.push(point[0], point[1]);
      };

      const flushCircleBatches = () => {
        ctx.shadowBlur = 0;

        pointBatches.forEach((batch) => {
          const { alpha, points, radius, shade } = batch;
          ctx.fillStyle = redInk(shade, alpha);
          ctx.beginPath();

          for (let index = 0; index < points.length; index += 2) {
            ctx.moveTo(points[index] + radius, points[index + 1]);
            ctx.arc(points[index], points[index + 1], radius, 0, Math.PI * 2);
          }

          ctx.fill();
        });
      };

      screens.forEach((screen, pathIndex) => {
        const pointStride = bodyStep;

        if (connectIterateStrokes) strokeCurvedRibbon(ctx, screen, pathIndex, alphaMultiplier);

        for (let i = pathIndex % pointStride; i < screen.length; i += pointStride) {
          const p = screen[i];
          if (p[0] < -10 || p[0] > width + 10 || p[1] < -10 || p[1] > height + 10) continue;
          const curveWeight = curveWeightAt(screen, i, 7);
          const weight = curveWeight ** 1.08;
          const densityRaw = clamp((localDensityAt(p) - 4.4) / 11, 0, 1);
          const densityWeight = smoothstep(densityRaw) ** 1.42;
          if (densityWeight <= 0.006) continue;

          const shade = 1 + 9 * (1 - weight);

          if ((i + pathIndex) % 2 === 0) {
            addCircleToBatch(
              p,
              12,
              pointAlphaOverride ??
                (pathIndex < 8 ? 0.13 : 0.07) * (0.42 + weight) * densityWeight * alphaMultiplier,
              (0.16 + 0.055 * weight) * pointScale * pointSizeMultiplier,
            );
          }

          addCircleToBatch(
            p,
            shade,
            pointAlphaOverride ??
              (pathIndex < 8 ? 0.34 : 0.19) * (0.28 + weight) * densityWeight * alphaMultiplier,
            (0.055 + 0.075 * weight) * pointScale * pointSizeMultiplier,
          );
        }
      });

      flushCircleBatches();
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
        let resizeFrame = 0;
        let resizeTimer = 0;
        let resizePending = false;
        let layoutWidth = 0;
        let layoutHeight = 0;
        let segmentDurationMs = 0;
        let segmentElapsedMs = 0;
        let smoothedTransform = null;
        const targetChooser = createTargetChooser();
        let currentTarget = targetChooser.initial();
        let nextTarget = targetChooser.choose(currentTarget);
        segmentDurationMs = nextTarget.duration * 1000;
        const initialTimelineOffsetMs = Math.max(
          0,
          Number.parseFloat(canvas.dataset.mathInitialOffsetMs || `${defaultInitialTimelineOffsetMs}`),
        );
        const renderScaleCap = clamp(Number.parseFloat(canvas.dataset.mathRenderScaleCap || '3'), 1, 3);
        const pixelRatioCap = clamp(Number.parseFloat(canvas.dataset.mathPixelRatioCap || '2'), 1, 2);
        const desktopPointScale = clamp(Number.parseFloat(canvas.dataset.mathDesktopPointScale || '1'), 0.2, 1);
        const desktopPointMedia = window.matchMedia?.('(min-width: 1024px)') ?? { matches: false };
        const mobileRenderMedia = window.matchMedia?.('(max-width: 640px)') ?? { matches: false };
        const currentPointScale = () => (desktopPointMedia.matches ? desktopPointScale : 1);
        const shouldPauseForPreloader = () =>
          Boolean(canvas.closest('[data-varelism-math-background]')) &&
          document.documentElement.classList.contains('home-preloader-active');

        const configureContext = () => {
          ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        };

        const resizeCanvas = () => {
          const nextLayoutWidth = canvas.offsetWidth || width;
          const nextLayoutHeight = canvas.offsetHeight || height;
          const displayScale = Math.max(nextLayoutWidth / width, nextLayoutHeight / height, 1);
          const effectivePixelRatioCap = mobileRenderMedia.matches ? Math.min(pixelRatioCap, 1) : pixelRatioCap;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, effectivePixelRatioCap);
          const targetScale = Math.round(Math.min(renderScaleCap, displayScale * pixelRatio) * 4) / 4;
          const nextWidth = Math.max(width, Math.round(width * targetScale));
          const nextHeight = Math.max(height, Math.round(height * targetScale));

          layoutWidth = nextLayoutWidth;
          layoutHeight = nextLayoutHeight;

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

          const frameDelta = Math.min(deltaMs, 48);
          const anchorAmount = 1 - Math.exp(-frameDelta / 720);
          const centerAmount = 1 - Math.exp(-frameDelta / 760);
          const scaleAmount = 1 - Math.exp(-frameDelta / 940);
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
              settle(smoothedTransform.center[0], desired.center[0], centerAmount, 0.001),
              settle(smoothedTransform.center[1], desired.center[1], centerAmount, 0.001),
            ],
            scale: settle(smoothedTransform.scale, desired.scale, scaleAmount, 0.36),
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
            drawPaths(ctx, paths, transform, frameNumber, {
              alphaMultiplier: 2.59,
              bodyStep: 1,
              pointScale: currentPointScale(),
              pointAlphaOverride: 1,
              pointSizeMultiplier: 0.68,
            });
          }
        };

        const advanceInitialTimeline = (elapsedMs) => {
          let remainingMs = Math.max(0, elapsedMs);

          while (remainingMs >= segmentDurationMs) {
            remainingMs -= segmentDurationMs;
            currentTarget = nextTarget;
            nextTarget = targetChooser.choose(currentTarget);
            segmentDurationMs = nextTarget.duration * 1000;
          }

          segmentElapsedMs = remainingMs;
          frame = elapsedMs / targetRenderFrameMs;
        };

        const primeCanvas = (snapTransform = true) => {
          const phase = clamp(segmentElapsedMs / Math.max(1, segmentDurationMs), 0, 1);
          renderState(interpolateTargets(currentTarget, nextTarget, phase), frame, targetRenderFrameMs, snapTransform);
        };

        const flushResize = () => {
          resizeFrame = 0;
          if (!resizePending) return;

          resizePending = false;
          if (resizeCanvas()) {
            primeCanvas(false);
          }
        };

        const requestResize = () => {
          const nextLayoutWidth = canvas.offsetWidth || width;
          const nextLayoutHeight = canvas.offsetHeight || height;
          if (nextLayoutWidth === layoutWidth && nextLayoutHeight === layoutHeight) return;

          resizePending = true;
          if (resizeTimer) window.clearTimeout(resizeTimer);

          resizeTimer = window.setTimeout(() => {
            resizeTimer = 0;
            if (resizeFrame) return;
            resizeFrame = window.requestAnimationFrame(flushResize);
          }, 100);
        };

        advanceInitialTimeline(initialTimelineOffsetMs);
        resizeCanvas();
        primeCanvas();

        const onResize = () => requestResize();

        const paint = (timestamp) => {
          const deltaMs = lastPaint ? clamp(timestamp - lastPaint, 0, 48) : targetRenderFrameMs;

          if (shouldPauseForPreloader()) {
            lastPaint = timestamp;
            animationFrame = window.requestAnimationFrame(paint);
            return;
          }

          frame += deltaMs / targetRenderFrameMs;
          segmentElapsedMs += deltaMs;

          while (segmentElapsedMs >= segmentDurationMs) {
            segmentElapsedMs -= segmentDurationMs;
            currentTarget = nextTarget;
            nextTarget = targetChooser.choose(currentTarget);
            segmentDurationMs = nextTarget.duration * 1000;
          }

          const phase = clamp(segmentElapsedMs / Math.max(1, segmentDurationMs), 0, 1);
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
          window.cancelAnimationFrame(resizeFrame);
          window.clearTimeout(resizeTimer);
        }, { once: true });
      });
    };

    setupHeroCanvas();
    if (!runtime.pageLoadListenerAttached) {
      document.addEventListener('astro:page-load', setupHeroCanvas);
      runtime.pageLoadListenerAttached = true;
    }
  })();
