import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './PdfFlipbook.css';

const pdfWorkerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const CACHE_LIMIT = 6;
const QUALITY_SCALE = 2.4;
const RENDER_MODE = 'pdf-page-texture';
const TURN_DURATION_MS = 620;
const QUICK_TURN_DURATION_MS = 240;
const MIN_CURL_SEGMENTS_X = 72;
const MAX_CURL_SEGMENTS_X = 120;
const MIN_CURL_SEGMENTS_Y = 44;
const MAX_CURL_SEGMENTS_Y = 80;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothstep = (edge0, edge1, value) => {
  const amount = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return amount * amount * (3 - 2 * amount);
};
const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
const easeInOutCubic = (value) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

function uniquePages(pages, pageCount) {
  return Array.from(
    new Set(
      pages.filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount),
    ),
  );
}

function pageCacheKey(spec) {
  return [
    spec.src,
    spec.pageNumber,
    spec.cssWidth,
    spec.cssHeight,
    spec.dpr,
    spec.qualityScale,
    spec.mode,
  ].join(':');
}

function getEditableTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
}

export default function PdfFlipbook({
  src,
  title = 'Portfolio',
  initialPage = 1,
  onPageChange,
  initialPageAspectRatio = 1.414,
  className = '',
}) {
  const rootRef = useRef(null);
  const viewportRef = useRef(null);
  const canvasHostRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const threeRef = useRef(null);
  const pdfRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const pageCacheRef = useRef(new Map());
  const activeRenderTasksRef = useRef(new Set());
  const sceneObjectsRef = useRef([]);
  const layoutRef = useRef(null);
  const currentPageRef = useRef(1);
  const pageCountRef = useRef(0);
  const pageAspectRatioRef = useRef(initialPageAspectRatio);
  const reducedMotionRef = useRef(false);
  const animationFrameRef = useRef(0);
  const turnRef = useRef(null);
  const pendingTurnRef = useRef(false);
  const dragRef = useRef(null);
  const initRunRef = useRef(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageAspectRatio, setPageAspectRatio] = useState(initialPageAspectRatio);
  const [status, setStatus] = useState('Loading PDF');
  const [isReady, setIsReady] = useState(false);
  const [isTurning, setIsTurning] = useState(false);

  const bookAspectRatio = useMemo(() => pageAspectRatio, [pageAspectRatio]);

  const ariaPageLabel = pageCount ? `page ${currentPage} of ${pageCount}` : 'loading';

  function normalizePage(pageNumber, count = pageCountRef.current) {
    if (!count) return 1;

    return clamp(Math.round(pageNumber), 1, count);
  }

  function getVisiblePages(pageNumber, count = pageCountRef.current) {
    return uniquePages([normalizePage(pageNumber, count)], count);
  }

  function getNextPage(direction, fromPage = currentPageRef.current) {
    const count = pageCountRef.current;
    if (!count) return fromPage;

    const normalizedPage = normalizePage(fromPage, count);
    const nextPage = normalizePage(normalizedPage + direction, count);

    return nextPage === normalizedPage ? normalizedPage : nextPage;
  }

  function getPrefetchPages(anchorPage = currentPageRef.current) {
    const count = pageCountRef.current;
    if (!count) return [];

    const normalizedPage = normalizePage(anchorPage, count);
    return uniquePages([normalizedPage - 1, normalizedPage, normalizedPage + 1, normalizedPage + 2], count);
  }

  function commitPage(pageNumber) {
    const nextPage = normalizePage(pageNumber);
    currentPageRef.current = nextPage;
    setCurrentPage(nextPage);
    onPageChange?.(nextPage);
    queueVisiblePages(nextPage);
    renderBook();
  }

  function clearAnimationFrame() {
    if (!animationFrameRef.current) return;
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
  }

  function disposeSceneObjects() {
    const scene = sceneRef.current;
    sceneObjectsRef.current.forEach((object) => {
      scene?.remove(object);
      object.geometry?.dispose?.();

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material?.dispose?.());
    });
    sceneObjectsRef.current = [];
  }

  function disposePageEntry(entry) {
    entry.renderTask?.cancel?.();
    entry.texture?.dispose?.();
    if (entry.canvas) {
      entry.canvas.width = 1;
      entry.canvas.height = 1;
    }
  }

  function disposePageCache() {
    activeRenderTasksRef.current.forEach((task) => task.cancel?.());
    activeRenderTasksRef.current.clear();
    pageCacheRef.current.forEach(disposePageEntry);
    pageCacheRef.current.clear();
  }

  function createTexture(canvas) {
    const THREE = threeRef.current;
    if (!THREE) return null;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    const renderer = rendererRef.current;
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    texture.anisotropy = maxAnisotropy;

    return texture;
  }

  function getRenderSpec(pageNumber) {
    const renderer = rendererRef.current;
    const layout = layoutRef.current;
    if (!renderer || !layout) return null;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.max(1, Math.ceil(layout.pageScreenWidth));
    const cssHeight = Math.max(1, Math.ceil(layout.pageScreenHeight));
    const renderWidth = Math.ceil(cssWidth * dpr * QUALITY_SCALE);
    const renderHeight = Math.ceil(cssHeight * dpr * QUALITY_SCALE);
    const maxTextureSize = renderer.capabilities?.maxTextureSize || 0;

    if (maxTextureSize > 0 && (renderWidth > maxTextureSize || renderHeight > maxTextureSize)) {
      throw new Error(
        `PDF page ${pageNumber} requires a ${renderWidth}x${renderHeight} texture, which exceeds the WebGL maximum texture size of ${maxTextureSize}. Tiled PDF textures are required for this viewport.`,
      );
    }

    return {
      src,
      pageNumber,
      cssWidth,
      cssHeight,
      dpr,
      qualityScale: QUALITY_SCALE,
      renderWidth,
      renderHeight,
      mode: RENDER_MODE,
    };
  }

  async function ensurePageRendered(pageNumber) {
    const pdf = pdfRef.current;
    const THREE = threeRef.current;
    if (!pdf || !THREE || pageNumber < 1 || pageNumber > pageCountRef.current) return null;

    const spec = getRenderSpec(pageNumber);
    if (!spec) return null;

    const cacheKey = pageCacheKey(spec);
    const cachedEntry = pageCacheRef.current.get(cacheKey);
    if (cachedEntry?.promise) return cachedEntry.promise;
    if (cachedEntry?.texture) {
      cachedEntry.lastUsed = performance.now();
      return cachedEntry;
    }

    const entry = {
      pageNumber,
      cacheKey,
      spec,
      canvas: null,
      texture: null,
      promise: null,
      renderTask: null,
      lastUsed: performance.now(),
    };

    entry.promise = (async () => {
      const page = await pdf.getPage(pageNumber);
      const naturalViewport = page.getViewport({ scale: 1 });
      const scale = spec.renderWidth / naturalViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });

      canvas.width = spec.renderWidth;
      canvas.height = spec.renderHeight;

      if (!context) {
        page.cleanup?.();
        throw new Error(`Unable to create canvas for PDF page ${pageNumber}.`);
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        background: '#ffffff',
      });
      entry.renderTask = renderTask;
      activeRenderTasksRef.current.add(renderTask);

      try {
        await renderTask.promise;
      } finally {
        activeRenderTasksRef.current.delete(renderTask);
        entry.renderTask = null;
        page.cleanup?.();
      }

      entry.canvas = canvas;
      entry.texture = createTexture(canvas);
      entry.promise = null;
      entry.lastUsed = performance.now();
      pageCacheRef.current.set(cacheKey, entry);
      trimPageCache();

      return entry;
    })();

    pageCacheRef.current.set(cacheKey, entry);
    return entry.promise;
  }

  function trimPageCache(protectedPages = getPrefetchPages()) {
    const protectedSet = new Set(
      protectedPages
        .map((pageNumber) => {
          try {
            const spec = getRenderSpec(pageNumber);
            return spec ? pageCacheKey(spec) : '';
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    );
    const entries = Array.from(pageCacheRef.current.entries())
      .filter(([cacheKey]) => !protectedSet.has(cacheKey))
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

    while (pageCacheRef.current.size > CACHE_LIMIT && entries.length) {
      const [cacheKey, entry] = entries.shift();
      pageCacheRef.current.delete(cacheKey);
      disposePageEntry(entry);
    }
  }

  function cancelStaleRenderTasks(protectedPages = getPrefetchPages()) {
    const protectedSet = new Set(
      protectedPages
        .map((pageNumber) => {
          try {
            const spec = getRenderSpec(pageNumber);
            return spec ? pageCacheKey(spec) : '';
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    );

    pageCacheRef.current.forEach((entry, cacheKey) => {
      if (!entry.promise || protectedSet.has(cacheKey)) return;

      pageCacheRef.current.delete(cacheKey);
      disposePageEntry(entry);
    });
  }

  function invalidateMismatchedRenderSizes() {
    let currentSpec = null;

    try {
      currentSpec = getRenderSpec(currentPageRef.current);
    } catch {
      return;
    }

    if (!currentSpec) return;

    pageCacheRef.current.forEach((entry, cacheKey) => {
      const spec = entry.spec;
      const matchesCurrentRenderSize =
        spec?.src === currentSpec.src &&
        spec.cssWidth === currentSpec.cssWidth &&
        spec.cssHeight === currentSpec.cssHeight &&
        spec.dpr === currentSpec.dpr &&
        spec.qualityScale === currentSpec.qualityScale &&
        spec.mode === currentSpec.mode;

      if (matchesCurrentRenderSize) return;

      pageCacheRef.current.delete(cacheKey);
      disposePageEntry(entry);
    });
  }

  function queueVisiblePages(anchorPage = currentPageRef.current) {
    const pages = getPrefetchPages(anchorPage);
    if (!pages.length) return;

    cancelStaleRenderTasks(pages);
    const visiblePages = getVisiblePages(anchorPage);
    Promise.all(visiblePages.map((pageNumber) => ensurePageRendered(pageNumber)))
      .then(() => {
        renderBook();
        return pages
          .filter((pageNumber) => !visiblePages.includes(pageNumber))
          .reduce(
            (promise, pageNumber) =>
              promise.then(() => ensurePageRendered(pageNumber).then(() => renderBook()).catch(() => null)),
            Promise.resolve(),
          );
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Unable to render the PDF pages.');
      });
  }

  function getCachedTexture(pageNumber) {
    const spec = getRenderSpec(pageNumber);
    if (!spec) return null;

    const entry = pageCacheRef.current.get(pageCacheKey(spec));
    if (!entry?.texture) return null;

    entry.lastUsed = performance.now();
    return entry.texture;
  }

  function createStaticPage(pageNumber, x = 0) {
    const THREE = threeRef.current;
    const scene = sceneRef.current;
    const layout = layoutRef.current;
    if (!THREE || !scene || !layout) return;

    const geometry = new THREE.PlaneGeometry(layout.pageWidth, layout.pageHeight, 1, 1);
    const texture = getCachedTexture(pageNumber);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture ?? null,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(x, 0, 0);
    mesh.renderOrder = 0;
    scene.add(mesh);
    sceneObjectsRef.current.push(mesh);

    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x1b3743,
      opacity: 0.12,
      transparent: true,
    });
    const edge = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edge.position.copy(mesh.position);
    edge.position.z = 0.004;
    scene.add(edge);
    sceneObjectsRef.current.push(edge);
  }

  function createPageStack() {
    const THREE = threeRef.current;
    const scene = sceneRef.current;
    const layout = layoutRef.current;
    if (!THREE || !scene || !layout) return;

    const halfWidth = layout.pageWidth / 2;
    const halfHeight = layout.pageHeight / 2;

    for (let index = 1; index <= 5; index += 1) {
      const offsetX = index * layout.pageWidth * 0.0032;
      const offsetY = index * layout.pageHeight * 0.0032;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(halfWidth + offsetX, -halfHeight - offsetY, -0.006),
        new THREE.Vector3(halfWidth + offsetX, halfHeight - offsetY, -0.006),
        new THREE.Vector3(-halfWidth + offsetX, -halfHeight - offsetY, -0.006),
        new THREE.Vector3(halfWidth + offsetX, -halfHeight - offsetY, -0.006),
      ]);
      const material = new THREE.LineBasicMaterial({
        color: 0x1b3743,
        opacity: 0.045,
        transparent: true,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(geometry, material);

      lines.renderOrder = -1;
      scene.add(lines);
      sceneObjectsRef.current.push(lines);
    }
  }

  function createTurnShadows(sourceGeometry, turn) {
    const THREE = threeRef.current;
    const scene = sceneRef.current;
    const layout = layoutRef.current;
    if (!THREE || !scene || !layout) return;

    const sign = turn.direction === 'forward' ? 1 : -1;
    const variants = [
      { name: 0, order: 1, spreadX: 0.11, spreadY: 0.052 },
      { name: 1, order: 2, spreadX: 0.035, spreadY: 0.016 },
      { name: 2, order: 3, spreadX: 0.065, spreadY: 0.024 },
    ];

    variants.forEach((variant) => {
      const geometry = sourceGeometry.clone();
      const positions = geometry.attributes.position;

      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const lift = Math.max(0, positions.getZ(index));

        positions.setXYZ(
          index,
          x - sign * lift * variant.spreadX,
          y - lift * variant.spreadY,
          0.006 + variant.name * 0.001,
        );
      }

      positions.needsUpdate = true;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          progress: { value: turn.progress },
          direction: { value: sign },
          cornerSign: { value: turn.corner === 'top' ? 1 : turn.corner === 'bottom' ? -1 : 0 },
          variant: { value: variant.name },
        },
        vertexShader: `
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float progress;
          uniform float direction;
          uniform float cornerSign;
          uniform float variant;
          varying vec2 vUv;

          void main() {
            float u = direction > 0.0 ? vUv.x : 1.0 - vUv.x;
            float wave = sin(progress * 3.14159265);
            float foldAxis = clamp(progress, 0.02, 0.98);
            float fold = exp(-pow((u - foldAxis) * 9.5, 2.0));
            float nearFold = exp(-pow((u - foldAxis) * 20.0, 2.0));
            float liftedSheet = smoothstep(0.04, 0.86, u) * wave;
            float overlap = smoothstep(0.18, 0.98, u) * (1.0 - smoothstep(0.88, 1.0, u) * 0.28);
            float cornerY = cornerSign > 0.0 ? 1.0 : 0.0;
            float cornerWeight = cornerSign == 0.0 ? 0.38 : pow(clamp(1.0 - abs(vUv.y - cornerY), 0.0, 1.0), 1.7);
            float edgeFalloff = smoothstep(0.0, 0.13, u) * (1.0 - smoothstep(0.985, 1.0, u) * 0.16);
            float alpha = 0.0;

            if (variant < 0.5) {
              alpha = (0.055 * liftedSheet + 0.085 * fold * wave) * edgeFalloff;
              alpha *= mix(0.76, 1.12, cornerWeight);
            } else if (variant < 1.5) {
              alpha = nearFold * wave * 0.105;
              alpha *= smoothstep(0.04, 0.2, u) * (1.0 - smoothstep(0.92, 1.0, u) * 0.4);
            } else {
              alpha = overlap * fold * wave * 0.13;
              alpha *= mix(0.72, 1.2, cornerWeight);
            }

            gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(alpha, 0.0, 0.22));
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = variant.order;
      scene.add(mesh);
      sceneObjectsRef.current.push(mesh);
    });
  }

  function createCurlGeometry(turn) {
    const THREE = threeRef.current;
    const layout = layoutRef.current;
    if (!THREE || !layout) return null;

    const segmentsX = Math.round(clamp(layout.pageScreenWidth / 9, MIN_CURL_SEGMENTS_X, MAX_CURL_SEGMENTS_X));
    const segmentsY = Math.round(clamp(layout.pageScreenHeight / 9, MIN_CURL_SEGMENTS_Y, MAX_CURL_SEGMENTS_Y));
    const geometry = new THREE.PlaneGeometry(
      layout.pageWidth,
      layout.pageHeight,
      segmentsX,
      segmentsY,
    );
    const positions = geometry.attributes.position;
    const sign = turn.direction === 'forward' ? 1 : -1;
    const pivotX = turn.direction === 'forward' ? -layout.pageWidth / 2 : layout.pageWidth / 2;
    const progress = clamp(turn.progress, 0, 1);
    const wave = Math.sin(Math.PI * progress);
    const cornerSign = turn.corner === 'top' ? 1 : turn.corner === 'bottom' ? -1 : 0;
    const cornerYNorm = turn.corner === 'top' ? 1 : turn.corner === 'bottom' ? 0 : 0.5;
    const pointerYNorm = clamp(turn.pointerRatio ?? cornerYNorm, 0, 1);
    const verticalPull = clamp(turn.verticalPull ?? 0, -0.42, 0.42);
    const baseFold = clamp(1 - progress * 0.94, 0.035, 0.98);

    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localY = positions.getY(index);
      const yNorm = clamp((localY + layout.pageHeight / 2) / layout.pageHeight, 0, 1);
      const span =
        turn.direction === 'forward'
          ? clamp((localX + layout.pageWidth / 2) / layout.pageWidth, 0, 1)
          : clamp((layout.pageWidth / 2 - localX) / layout.pageWidth, 0, 1);
      const cornerWeight =
        cornerSign === 0 ? 0 : Math.pow(clamp(1 - Math.abs(yNorm - cornerYNorm), 0, 1), 1.65);
      const pointerWeight = Math.pow(clamp(1 - Math.abs(yNorm - pointerYNorm) * 1.9, 0, 1), 1.45);
      const freeEdgeWeight = Math.pow(span, 1.35);
      const diagonalLead =
        cornerSign === 0
          ? pointerWeight * freeEdgeWeight * wave * 0.035
          : Math.max(cornerWeight, pointerWeight * 0.56) * freeEdgeWeight * wave * 0.16;
      const fold = clamp(baseFold - diagonalLead, 0.025, 0.985);
      const transition = 0.115 + wave * 0.035;
      const curlInfluence = smoothstep(fold - transition, fold + transition, span);
      const maxDistance = Math.max(layout.pageWidth * 0.035, (1 - fold) * layout.pageWidth);
      const distancePastFold = Math.max(0, span - fold) * layout.pageWidth;
      const distanceRatio = clamp(distancePastFold / maxDistance, 0, 1);
      const crossSheetTwist =
        cornerSign === 0
          ? (pointerYNorm - 0.5) * Math.pow(span, 1.05) * wave * 0.08
          : cornerSign * (yNorm - 0.5) * Math.pow(span, 1.05) * wave * 0.26;
      const foldX = pivotX + sign * fold * layout.pageWidth;
      const angleMax = Math.PI * (0.86 + progress * 0.62) + crossSheetTwist;
      const angle = distanceRatio * angleMax;
      const curledX = foldX + sign * Math.cos(angle) * distancePastFold;
      const curledZ = Math.max(0, Math.sin(angle)) * distancePastFold * 0.25;
      const edgeLift = wave * Math.sin(Math.PI * span) * layout.pageWidth * 0.02;
      const cornerLift = cornerWeight * freeEdgeWeight * wave * layout.pageWidth * 0.095;
      const horizontalEdgePull =
        cornerSign === 0
          ? verticalPull * pointerWeight * freeEdgeWeight * wave * layout.pageHeight * 0.16
          : (-cornerSign * cornerWeight * wave * 0.112 + verticalPull * Math.max(cornerWeight, pointerWeight * 0.5) * 0.62) *
            freeEdgeWeight *
            layout.pageHeight;
      const adjacentEdgeTension =
        cornerSign === 0
          ? 0
          : -cornerSign *
            Math.pow(span, 1.1) *
            Math.pow(clamp(1 - Math.abs(yNorm - cornerYNorm) * 2.4, 0, 1), 1.35) *
            wave *
            layout.pageHeight *
            0.052;
      const curledY = localY + horizontalEdgePull + adjacentEdgeTension;
      const x = localX + (curledX - localX) * curlInfluence;
      const y = localY + (curledY - localY) * curlInfluence;
      const z = (curledZ + edgeLift + cornerLift) * curlInfluence + 0.014 * curlInfluence;

      positions.setXYZ(index, x, y, z);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }

  function mirrorGeometryUv(geometry) {
    const uvs = geometry.attributes.uv;
    if (!uvs) return geometry;

    for (let index = 0; index < uvs.count; index += 1) {
      uvs.setX(index, 1 - uvs.getX(index));
    }

    uvs.needsUpdate = true;
    return geometry;
  }

  function createTurnMaterial(texture, side) {
    const THREE = threeRef.current;
    if (!THREE) return null;

    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      side,
      toneMapped: false,
    });
  }

  function createTurnPage(turn) {
    const THREE = threeRef.current;
    const scene = sceneRef.current;
    const layout = layoutRef.current;
    if (!THREE || !scene || !layout) return;

    const frontTexture = getCachedTexture(turn.frontPage);
    const backTexture = getCachedTexture(turn.backPage);
    if (!frontTexture || !backTexture) return;

    const geometry = createCurlGeometry(turn);
    if (!geometry) return;

    createTurnShadows(geometry, turn);

    const frontMaterial = createTurnMaterial(frontTexture, THREE.FrontSide);
    const backMaterial = createTurnMaterial(backTexture, THREE.BackSide);
    if (!frontMaterial || !backMaterial) return;

    const frontMesh = new THREE.Mesh(geometry, frontMaterial);
    const backMesh = new THREE.Mesh(mirrorGeometryUv(geometry.clone()), backMaterial);
    frontMesh.renderOrder = 4;
    backMesh.renderOrder = 5;
    scene.add(frontMesh, backMesh);
    sceneObjectsRef.current.push(frontMesh, backMesh);
  }

  function renderBook() {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const layout = layoutRef.current;
    if (!renderer || !scene || !camera || !layout) return;

    disposeSceneObjects();

    const turn = turnRef.current;
    const basePage = turn ? turn.toPage : currentPageRef.current;
    const pages = getVisiblePages(basePage, pageCountRef.current);

    createPageStack();

    pages.forEach((pageNumber) => {
      createStaticPage(pageNumber);
    });

    if (turn) {
      createTurnPage(turn);
    }

    renderer.render(scene, camera);
  }

  function resizeRenderer() {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const viewport = viewportRef.current;
    if (!renderer || !camera || !viewport) return;

    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.width, rect.height, false);

    const aspect = pageAspectRatioRef.current || initialPageAspectRatio;
    const pageWidth = aspect;
    const pageHeight = 1;
    const bookWidth = pageWidth;
    const bookHeight = pageHeight;
    const canvasAspect = rect.width / rect.height;
    const padding = 1.12;
    let worldHeight = bookHeight * padding;
    let worldWidth = worldHeight * canvasAspect;

    if (worldWidth < bookWidth * padding) {
      worldWidth = bookWidth * padding;
      worldHeight = worldWidth / canvasAspect;
    }

    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = worldHeight / 2;
    camera.bottom = -worldHeight / 2;
    camera.near = -10;
    camera.far = 10;
    camera.position.set(0, 0, 4);
    camera.updateProjectionMatrix();

    layoutRef.current = {
      pageWidth,
      pageHeight,
      bookWidth,
      bookHeight,
      worldWidth,
      worldHeight,
      pageScreenWidth: rect.width * (pageWidth / worldWidth),
      pageScreenHeight: rect.height * (pageHeight / worldHeight),
    };

    invalidateMismatchedRenderSizes();
    queueVisiblePages();
    renderBook();
  }

  function syncResponsiveMode() {
    const viewport = viewportRef.current;
    const root = rootRef.current;
    if (!viewport || !root) return;

    resizeRenderer();
  }

  async function prepareTurn(direction, toPage, options = {}) {
    const fromPage = currentPageRef.current;
    const count = pageCountRef.current;
    if (!count || fromPage === toPage || turnRef.current || pendingTurnRef.current) return null;

    const frontPage = fromPage;
    const backPage = toPage;
    const requiredPages = uniquePages([frontPage, backPage], count);

    pendingTurnRef.current = true;
    setIsTurning(true);
    setStatus('Rendering pages');

    try {
      await Promise.all(requiredPages.map((pageNumber) => ensurePageRendered(pageNumber)));
    } catch (error) {
      console.error('PDF flipbook failed to prepare a turn.', error);
      setStatus(error instanceof Error ? error.message : 'Unable to render the PDF pages.');
      setIsTurning(false);
      pendingTurnRef.current = false;
      return null;
    }

    const turn = {
      direction,
      fromPage,
      toPage,
      frontPage,
      backPage,
      corner: options.corner ?? 'center',
      grabRatio: options.grabRatio ?? 0.5,
      pointerRatio: options.grabRatio ?? 0.5,
      verticalPull: 0,
      progress: 0,
    };

    turnRef.current = turn;
    pendingTurnRef.current = false;
    setStatus('');
    renderBook();

    return turn;
  }

  function finishTurn(turn) {
    turnRef.current = null;
    setIsTurning(false);
    commitPage(turn.toPage);
  }

  function cancelTurn() {
    turnRef.current = null;
    setIsTurning(false);
    renderBook();
  }

  function settleTurn(turn, duration = QUICK_TURN_DURATION_MS) {
    const shouldComplete = turn.progress >= 0.5;

    if (shouldComplete) {
      animateTurn(turn, 1, duration, () => finishTurn(turn));
      return;
    }

    animateTurn(turn, 0, duration, cancelTurn);
  }

  function animateTurn(turn, targetProgress, duration = TURN_DURATION_MS, onComplete = () => {}) {
    clearAnimationFrame();
    const startProgress = turn.progress;
    const startTime = performance.now();
    const motionDuration = reducedMotionRef.current ? 0 : duration;

    const step = (now) => {
      const elapsed = motionDuration === 0 ? 1 : clamp((now - startTime) / motionDuration, 0, 1);
      const eased = targetProgress === 1 ? easeOutCubic(elapsed) : easeInOutCubic(elapsed);
      turn.progress = startProgress + (targetProgress - startProgress) * eased;
      renderBook();

      if (elapsed < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      animationFrameRef.current = 0;
      onComplete();
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
  }

  const goToDirection = useCallback(async (direction) => {
    if (turnRef.current || pendingTurnRef.current || !pageCountRef.current) return;

    const toPage = getNextPage(direction);
    if (toPage === currentPageRef.current) return;

    if (reducedMotionRef.current) {
      commitPage(toPage);
      return;
    }

    const turn = await prepareTurn(direction > 0 ? 'forward' : 'backward', toPage);
    if (!turn) return;

    animateTurn(turn, 1, TURN_DURATION_MS, () => finishTurn(turn));
  }, []);

  const goPrevious = useCallback(() => {
    goToDirection(-1);
  }, [goToDirection]);

  const goNext = useCallback(() => {
    goToDirection(1);
  }, [goToDirection]);

  const handlePointerDown = useCallback(
    async (event) => {
      if (event.button !== 0 || turnRef.current || !pageCountRef.current) return;

      const viewport = viewportRef.current;
      if (!viewport || pendingTurnRef.current) return;

      const rect = viewport.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const grabRatio = clamp(localY / rect.height, 0, 1);
      const corner = grabRatio < 0.28 ? 'top' : grabRatio > 0.72 ? 'bottom' : 'center';
      const edgeZone = Math.max(56, rect.width * 0.18);
      const isNaturalSwipe = event.pointerType === 'touch' || event.pointerType === 'pen';
      const canGoNext = getNextPage(1) !== currentPageRef.current;
      const canGoPrevious = getNextPage(-1) !== currentPageRef.current;
      let direction = 0;

      if (localX >= rect.width - edgeZone && canGoNext) {
        direction = 1;
      } else if (localX <= edgeZone && canGoPrevious) {
        direction = -1;
      } else if (isNaturalSwipe && localX >= rect.width / 2 && canGoNext) {
        direction = 1;
      } else if (isNaturalSwipe && localX < rect.width / 2 && canGoPrevious) {
        direction = -1;
      }

      if (!direction) return;

      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        direction,
        pointerId: event.pointerId,
        rect,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        corner,
        grabRatio,
        isReady: false,
        turn: null,
      };

      const toPage = getNextPage(direction);
      const turn = await prepareTurn(direction > 0 ? 'forward' : 'backward', toPage, {
        corner,
        grabRatio,
      });
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !turn) {
        if (!turn) dragRef.current = null;
        return;
      }

      drag.turn = turn;
      drag.isReady = true;
      const moved = Math.abs(drag.lastX - drag.startX);
      turn.progress = clamp(moved / (drag.rect.width * 0.42), 0.02, 0.96);
      renderBook();
    },
    [],
  );

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (!drag.isReady || !drag.turn) return;

    event.preventDefault();
    const delta = drag.direction > 0 ? drag.startX - event.clientX : event.clientX - drag.startX;
    drag.turn.grabRatio = clamp((event.clientY - drag.rect.top) / drag.rect.height, 0, 1);
    drag.turn.pointerRatio = drag.turn.grabRatio;
    drag.turn.verticalPull = clamp((event.clientY - drag.startY) / drag.rect.height, -0.42, 0.42);
    drag.turn.progress = clamp(delta / (drag.rect.width * 0.42), 0.02, 0.98);
    renderBook();
  }, []);

  const handlePointerUp = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!drag.turn) return;

    settleTurn(drag.turn);
  }, []);

  const handlePointerCancel = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (drag.turn) {
      animateTurn(drag.turn, 0, QUICK_TURN_DURATION_MS, cancelTurn);
    }
  }, []);

  useEffect(() => {
    let isDisposed = false;
    const runId = initRunRef.current + 1;
    initRunRef.current = runId;
    currentPageRef.current = Math.max(1, Math.round(initialPage));
    setCurrentPage(currentPageRef.current);
    setStatus('Loading PDF');
    setIsReady(false);

    async function start() {
      try {
        const [THREE, pdfjs] = await Promise.all([import('three'), import('pdfjs-dist')]);
        if (isDisposed || initRunRef.current !== runId) return;

        threeRef.current = THREE;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
        renderer.setClearColor(0xffffff, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = 'pdf-flipbook__canvas';
        renderer.domElement.setAttribute('aria-hidden', 'true');

        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;
        canvasHostRef.current?.replaceChildren(renderer.domElement);

        syncResponsiveMode();

        const loadingTask = pdfjs.getDocument({
          url: src,
          rangeChunkSize: 65536,
          disableAutoFetch: false,
          disableStream: false,
        });
        loadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (isDisposed || initRunRef.current !== runId) {
          await pdf.destroy?.();
          return;
        }

        pdfRef.current = pdf;
        pageCountRef.current = pdf.numPages;
        setPageCount(pdf.numPages);

        const firstPage = await pdf.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        const nextAspectRatio = firstViewport.width / firstViewport.height || initialPageAspectRatio;
        firstPage.cleanup?.();

        pageAspectRatioRef.current = nextAspectRatio;
        setPageAspectRatio(nextAspectRatio);
        currentPageRef.current = normalizePage(initialPage, pdf.numPages);
        setCurrentPage(currentPageRef.current);
        resizeRenderer();

        await ensurePageRendered(currentPageRef.current);

        setStatus('');
        setIsReady(true);
        renderBook();
        queueVisiblePages();
      } catch (error) {
        if (!isDisposed) {
          console.error('PDF flipbook failed to initialise.', error);
          setStatus(error instanceof Error ? error.message : 'Unable to load the PDF.');
        }
      }
    }

    start();

    return () => {
      isDisposed = true;
      clearAnimationFrame();
      pendingTurnRef.current = false;
      turnRef.current = null;
      dragRef.current = null;
      disposeSceneObjects();
      disposePageCache();
      rendererRef.current?.dispose?.();
      rendererRef.current?.domElement?.remove?.();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      pdfRef.current?.destroy?.();
      pdfRef.current = null;
      loadingTaskRef.current?.destroy?.();
      loadingTaskRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      reducedMotionRef.current = motionQuery.matches;
    };

    syncMotionPreference();
    motionQuery.addEventListener('change', syncMotionPreference);

    return () => {
      motionQuery.removeEventListener('change', syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const observer = new ResizeObserver(syncResponsiveMode);
    observer.observe(root);
    window.addEventListener('orientationchange', syncResponsiveMode);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', syncResponsiveMode);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || getEditableTarget(event.target)) {
        return;
      }

      if (event.key === 'Escape' && turnRef.current) {
        event.preventDefault();
        settleTurn(turnRef.current);
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goNext();
      }

      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [goNext, goPrevious]);

  return (
    <section
      className={`pdf-flipbook ${className}`}
      style={{ '--pdf-flipbook-aspect': bookAspectRatio }}
      aria-label={`${title} PDF flipbook, ${ariaPageLabel}. Use left and right arrow keys or drag page corners to turn pages.`}
      ref={rootRef}
      tabIndex={0}
    >
      <header className="pdf-flipbook__header">
        <h1>{title}</h1>
      </header>

      <div className="pdf-flipbook__stage">
        <div
          className="pdf-flipbook__viewport"
          data-ready={isReady ? 'true' : 'false'}
          data-turning={isTurning ? 'true' : 'false'}
          ref={viewportRef}
          role="img"
          aria-label={`${title}, ${ariaPageLabel}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div className="pdf-flipbook__canvas-host" ref={canvasHostRef} />
          {status ? <p className="pdf-flipbook__status">{status}</p> : null}
        </div>
      </div>
    </section>
  );
}
