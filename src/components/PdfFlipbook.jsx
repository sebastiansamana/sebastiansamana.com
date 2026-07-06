import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './PdfFlipbook.css';

const pdfWorkerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const CACHE_LIMIT = 8;
const MAX_RENDER_WIDTH = 8192;
const MIN_RENDER_WIDTH = 1600;
const RENDER_QUALITY_MULTIPLIER = 2.35;
const TURN_DURATION_MS = 620;
const QUICK_TURN_DURATION_MS = 240;
const CURL_SEGMENTS_X = 84;
const CURL_SEGMENTS_Y = 28;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
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

function pageCacheKey(pageNumber, bucket) {
  return `${pageNumber}:${bucket}`;
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

  const visiblePageLabel = useMemo(() => {
    if (!pageCount) return 'Loading';

    return `${currentPage} / ${pageCount}`;
  }, [currentPage, pageCount]);

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
    texture.anisotropy = Math.min(4, maxAnisotropy);

    return texture;
  }

  function getTargetRenderWidth() {
    const renderer = rendererRef.current;
    const layout = layoutRef.current;
    const viewport = viewportRef.current;
    if (!viewport) return MIN_RENDER_WIDTH;

    const rect = viewport.getBoundingClientRect();
    const dpr = renderer?.getPixelRatio?.() ?? Math.min(window.devicePixelRatio || 1, 2);
    const pageScreenWidth = layout?.pageScreenWidth || rect.width;
    const maxTextureSize = renderer?.capabilities?.maxTextureSize || MAX_RENDER_WIDTH;

    return Math.round(
      clamp(pageScreenWidth * dpr * RENDER_QUALITY_MULTIPLIER, MIN_RENDER_WIDTH, Math.min(MAX_RENDER_WIDTH, maxTextureSize)),
    );
  }

  function findCachedPage(pageNumber, bucket) {
    let fallback = null;

    pageCacheRef.current.forEach((entry) => {
      if (entry.pageNumber !== pageNumber || !entry.texture) return;
      if (entry.bucket >= bucket * 0.88) {
        fallback = !fallback || entry.bucket < fallback.bucket ? entry : fallback;
      }
    });

    return fallback;
  }

  async function ensurePageRendered(pageNumber) {
    const pdf = pdfRef.current;
    const THREE = threeRef.current;
    if (!pdf || !THREE || pageNumber < 1 || pageNumber > pageCountRef.current) return null;

    const bucket = Math.ceil(getTargetRenderWidth() / 256) * 256;
    const reusableEntry = findCachedPage(pageNumber, bucket);
    if (reusableEntry) {
      reusableEntry.lastUsed = performance.now();
      return reusableEntry;
    }

    const cacheKey = pageCacheKey(pageNumber, bucket);
    const cachedEntry = pageCacheRef.current.get(cacheKey);
    if (cachedEntry?.promise) return cachedEntry.promise;
    if (cachedEntry?.texture) {
      cachedEntry.lastUsed = performance.now();
      return cachedEntry;
    }

    const entry = {
      pageNumber,
      bucket,
      canvas: null,
      texture: null,
      promise: null,
      renderTask: null,
      lastUsed: performance.now(),
    };

    entry.promise = (async () => {
      const page = await pdf.getPage(pageNumber);
      const naturalViewport = page.getViewport({ scale: 1 });
      const scale = bucket / naturalViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

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
    const protectedSet = new Set(protectedPages);
    const entries = Array.from(pageCacheRef.current.entries())
      .filter(([, entry]) => !entry.promise && !protectedSet.has(entry.pageNumber))
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

    while (pageCacheRef.current.size > CACHE_LIMIT && entries.length) {
      const [cacheKey, entry] = entries.shift();
      pageCacheRef.current.delete(cacheKey);
      disposePageEntry(entry);
    }
  }

  function queueVisiblePages(anchorPage = currentPageRef.current) {
    const pages = getPrefetchPages(anchorPage);
    if (!pages.length) return;

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
      .catch(() => {
        setStatus('Unable to render the PDF pages.');
      });
  }

  function getCachedTexture(pageNumber) {
    const bucket = Math.ceil(getTargetRenderWidth() / 256) * 256;
    const entry = findCachedPage(pageNumber, bucket);
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

  function createTurnShadow(sourceGeometry, turn) {
    const THREE = threeRef.current;
    const scene = sceneRef.current;
    const layout = layoutRef.current;
    if (!THREE || !scene || !layout) return;

    const geometry = sourceGeometry.clone();
    const positions = geometry.attributes.position;
    const sign = turn.direction === 'forward' ? 1 : -1;

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const lift = Math.max(0, positions.getZ(index));

      positions.setXYZ(index, x - sign * lift * 0.08, y - lift * 0.035, 0.009);
    }

    positions.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        progress: { value: turn.progress },
        direction: { value: sign },
        cornerSign: { value: turn.corner === 'top' ? 1 : turn.corner === 'bottom' ? -1 : 0 },
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
        varying vec2 vUv;

        void main() {
          float u = direction > 0.0 ? vUv.x : 1.0 - vUv.x;
          float wave = sin(progress * 3.14159265);
          float foldAxis = clamp(progress, 0.02, 0.98);
          float fold = exp(-pow((u - foldAxis) * 8.5, 2.0));
          float liftedSheet = smoothstep(0.08, 0.82, u) * wave;
          float cornerY = cornerSign > 0.0 ? 1.0 : 0.0;
          float cornerWeight = cornerSign == 0.0 ? 0.35 : pow(1.0 - abs(vUv.y - cornerY), 1.65);
          float edgeFalloff = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.96, 1.0, u) * 0.18);
          float alpha = (0.085 * liftedSheet + 0.18 * fold * wave) * edgeFalloff;

          alpha *= mix(0.78, 1.14, cornerWeight);
          gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(alpha, 0.0, 0.24));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    scene.add(mesh);
    sceneObjectsRef.current.push(mesh);
  }

  function createCurlGeometry(turn) {
    const THREE = threeRef.current;
    const layout = layoutRef.current;
    if (!THREE || !layout) return null;

    const geometry = new THREE.PlaneGeometry(
      layout.pageWidth,
      layout.pageHeight,
      CURL_SEGMENTS_X,
      CURL_SEGMENTS_Y,
    );
    const positions = geometry.attributes.position;
    const sign = turn.direction === 'forward' ? 1 : -1;
    const pivotX = turn.direction === 'forward' ? -layout.pageWidth / 2 : layout.pageWidth / 2;
    const progress = clamp(turn.progress, 0, 1);
    const wave = Math.sin(Math.PI * progress);
    const curlStrength = 0.78 * wave;
    const cornerSign = turn.corner === 'top' ? 1 : turn.corner === 'bottom' ? -1 : 0;
    const cornerYNorm = turn.corner === 'top' ? 1 : turn.corner === 'bottom' ? 0 : 0.5;

    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localY = positions.getY(index);
      const yNorm = clamp((localY + layout.pageHeight / 2) / layout.pageHeight, 0, 1);
      const span =
        turn.direction === 'forward'
          ? clamp((localX + layout.pageWidth / 2) / layout.pageWidth, 0, 1)
          : clamp((layout.pageWidth / 2 - localX) / layout.pageWidth, 0, 1);
      const pageDepth = span * layout.pageWidth;
      const cornerWeight =
        cornerSign === 0 ? 0 : Math.pow(clamp(1 - Math.abs(yNorm - cornerYNorm), 0, 1), 1.65);
      const freeEdgeWeight = Math.pow(span, 1.35);
      const diagonalLead = cornerSign === 0 ? 0 : cornerWeight * freeEdgeWeight * wave * 0.18;
      const localProgress = clamp(progress + diagonalLead, 0, 1);
      const crossSheetTwist =
        cornerSign === 0 ? 0 : cornerSign * (yNorm - 0.5) * Math.pow(span, 1.05) * wave * 0.24;
      const curledAngle = Math.PI * localProgress + curlStrength * Math.pow(span, 0.78) + crossSheetTwist;
      const edgeLift = wave * Math.sin(Math.PI * span) * layout.pageWidth * 0.025;
      const cornerLift = cornerWeight * freeEdgeWeight * wave * layout.pageWidth * 0.095;
      const horizontalEdgePull =
        cornerSign === 0
          ? 0
          : -cornerSign * cornerWeight * freeEdgeWeight * wave * layout.pageHeight * 0.115;
      const adjacentEdgeTension =
        cornerSign === 0
          ? 0
          : -cornerSign *
            Math.pow(span, 1.1) *
            Math.pow(clamp(1 - Math.abs(yNorm - cornerYNorm) * 2.4, 0, 1), 1.35) *
            wave *
            layout.pageHeight *
            0.052;
      const x = pivotX + sign * Math.cos(curledAngle) * pageDepth;
      const y = localY + horizontalEdgePull + adjacentEdgeTension;
      const z = 0.014 + Math.max(0, Math.sin(curledAngle) * pageDepth * 0.19) + edgeLift + cornerLift;

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

    createTurnShadow(geometry, turn);

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

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    };

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
      setStatus('Unable to render the PDF pages.');
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
      const canGoNext = getNextPage(1) !== currentPageRef.current;
      const canGoPrevious = getNextPage(-1) !== currentPageRef.current;
      let direction = 0;

      if (localX >= rect.width - edgeZone && canGoNext) {
        direction = 1;
      } else if (localX <= edgeZone && canGoPrevious) {
        direction = -1;
      } else if (localX >= rect.width / 2 && canGoNext) {
        direction = 1;
      } else if (localX < rect.width / 2 && canGoPrevious) {
        direction = -1;
      }

      if (!direction) return;

      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        direction,
        pointerId: event.pointerId,
        rect,
        startX: event.clientX,
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
    drag.turn.progress = clamp(delta / (drag.rect.width * 0.42), 0.02, 0.98);
    renderBook();
  }, []);

  const handlePointerUp = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!drag.turn) return;

    const shouldComplete = drag.turn.progress > 0.24 || Math.abs(drag.lastX - drag.startX) > drag.rect.width * 0.16;

    if (shouldComplete) {
      animateTurn(drag.turn, 1, QUICK_TURN_DURATION_MS, () => finishTurn(drag.turn));
      return;
    }

    animateTurn(drag.turn, 0, QUICK_TURN_DURATION_MS, cancelTurn);
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
    currentPageRef.current = 1;
    setCurrentPage(1);
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
        currentPageRef.current = normalizePage(1, pdf.numPages);
        setCurrentPage(currentPageRef.current);
        resizeRenderer();

        await ensurePageRendered(1);

        setStatus('');
        setIsReady(true);
        renderBook();
        queueVisiblePages();
      } catch (error) {
        if (!isDisposed) {
          console.error('PDF flipbook failed to initialise.', error);
          setStatus('Unable to load the PDF.');
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
      aria-label={title}
      ref={rootRef}
    >
      <header className="pdf-flipbook__header">
        <h1>{title}</h1>
        <p aria-live="polite">{visiblePageLabel}</p>
      </header>

      <div className="pdf-flipbook__stage">
        <div
          className="pdf-flipbook__viewport"
          data-ready={isReady ? 'true' : 'false'}
          data-turning={isTurning ? 'true' : 'false'}
          ref={viewportRef}
          role="img"
          aria-label={`${title}, ${visiblePageLabel}`}
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
