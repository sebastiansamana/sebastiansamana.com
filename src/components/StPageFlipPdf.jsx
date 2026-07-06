import { useEffect, useRef, useState } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './StPageFlipPdf.css';

const QUALITY_SCALE = 1.45;
const MAX_RENDER_EDGE = 4096;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const makeRenderKey = ({ dpr, height, pageNumber, pdfUrl, width }) =>
  [pdfUrl, pageNumber, Math.round(width), Math.round(height), dpr.toFixed(2), QUALITY_SCALE].join(':');

const toPngBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Unable to create a lossless PNG page image.'));
    }, 'image/png');
  });

export default function StPageFlipPdf({ pdfUrl, initialPage = 1, ariaLabel = 'Portfolio PDF flipbook' }) {
  const viewerRef = useRef(null);
  const mountRef = useRef(null);
  const pdfRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const pageFlipRef = useRef(null);
  const imagesRef = useRef(new Map());
  const renderTasksRef = useRef(new Map());
  const pageUrlsRef = useRef(new Map());
  const pageKeysRef = useRef(new Map());
  const generationRef = useRef(0);
  const currentPageRef = useRef(Math.max(1, initialPage));
  const reducedMotionRef = useRef(false);

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pageMeta, setPageMeta] = useState(null);
  const [pageSize, setPageSize] = useState(null);
  const [status, setStatus] = useState('Loading PDF');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return undefined;

    const measure = () => {
      const rect = viewer.getBoundingClientRect();
      setViewport({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewer);
    window.addEventListener('orientationchange', measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setReady(false);
      setStatus('Loading PDF');
      generationRef.current += 1;

      try {
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        loadingTaskRef.current?.destroy?.();
        const loadingTask = pdfjs.getDocument({ url: pdfUrl });
        loadingTaskRef.current = loadingTask;

        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        const firstPage = await pdf.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1 });
        firstPage.cleanup?.();

        pdfRef.current = pdf;
        currentPageRef.current = clamp(initialPage, 1, pdf.numPages);
        setPageMeta({
          baseHeight: baseViewport.height,
          baseWidth: baseViewport.width,
          pageCount: pdf.numPages,
        });
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Unable to load PDF');
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      loadingTaskRef.current?.destroy?.();
      loadingTaskRef.current = null;
      pdfRef.current?.destroy?.();
      pdfRef.current = null;
    };
  }, [initialPage, pdfUrl]);

  useEffect(() => {
    if (!pageMeta || viewport.width <= 0 || viewport.height <= 0) return;

    const aspect = pageMeta.baseWidth / pageMeta.baseHeight;
    const availableWidth = Math.max(280, viewport.width);
    const availableHeight = Math.max(360, viewport.height);
    const widthFromHeight = availableHeight * aspect;
    const width = Math.floor(Math.min(availableWidth, widthFromHeight));
    const height = Math.floor(width / aspect);

    setPageSize((previous) => {
      if (previous && Math.abs(previous.width - width) < 2 && Math.abs(previous.height - height) < 2) {
        return previous;
      }

      return { width, height };
    });
  }, [pageMeta, viewport.height, viewport.width]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const mount = mountRef.current;
    if (!pdf || !mount || !pageMeta || !pageSize) return undefined;

    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setReady(false);
    setStatus('Rendering PDF');

    const cancelRenderTasks = (keepPages = null) => {
      for (const [pageNumber, task] of renderTasksRef.current.entries()) {
        if (keepPages?.has(pageNumber)) continue;
        task.cancel();
        renderTasksRef.current.delete(pageNumber);
      }
    };

    const revokePageUrl = (pageNumber) => {
      const pageUrl = pageUrlsRef.current.get(pageNumber);
      if (pageUrl) URL.revokeObjectURL(pageUrl);
      pageUrlsRef.current.delete(pageNumber);
      pageKeysRef.current.delete(pageNumber);

      const image = imagesRef.current.get(pageNumber);
      if (image) {
        image.removeAttribute('src');
        image.classList.remove('is-rendered');
      }
    };

    const clearBook = () => {
      cancelRenderTasks();

      for (const pageNumber of Array.from(pageUrlsRef.current.keys())) {
        revokePageUrl(pageNumber);
      }

      imagesRef.current.clear();

      if (pageFlipRef.current) {
        try {
          pageFlipRef.current.destroy();
        } catch {
          mount.innerHTML = '';
        }
      } else {
        mount.innerHTML = '';
      }

      pageFlipRef.current = null;
    };

    const renderPage = async (pageNumber) => {
      if (pageNumber < 1 || pageNumber > pageMeta.pageCount || renderTasksRef.current.has(pageNumber)) {
        return;
      }

      const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      const longestEdgeScale = MAX_RENDER_EDGE / Math.max(pageSize.width, pageSize.height);
      const renderScale = Math.min(dpr * QUALITY_SCALE, longestEdgeScale);
      const renderKey = makeRenderKey({
        dpr,
        height: pageSize.height,
        pageNumber,
        pdfUrl,
        width: pageSize.width,
      });

      if (pageKeysRef.current.get(pageNumber) === renderKey) return;

      let canvas;
      let page;

      try {
        page = await pdf.getPage(pageNumber);
        if (cancelled || generationRef.current !== generation) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const viewportScale = (pageSize.width * renderScale) / baseViewport.width;
        const renderViewport = page.getViewport({ scale: viewportScale });
        canvas = document.createElement('canvas');
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);

        const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: context,
          viewport: renderViewport,
        });

        renderTasksRef.current.set(pageNumber, renderTask);
        await renderTask.promise;
        renderTasksRef.current.delete(pageNumber);

        if (cancelled || generationRef.current !== generation) return;

        const blob = await toPngBlob(canvas);
        const url = URL.createObjectURL(blob);

        if (cancelled || generationRef.current !== generation) {
          URL.revokeObjectURL(url);
          return;
        }

        const oldUrl = pageUrlsRef.current.get(pageNumber);
        if (oldUrl) URL.revokeObjectURL(oldUrl);

        pageUrlsRef.current.set(pageNumber, url);
        pageKeysRef.current.set(pageNumber, renderKey);

        const image = imagesRef.current.get(pageNumber);
        if (image) {
          image.src = url;
          image.classList.add('is-rendered');
        }
      } catch (error) {
        renderTasksRef.current.delete(pageNumber);
        if (error?.name !== 'RenderingCancelledException' && !cancelled) {
          setStatus(error instanceof Error ? error.message : 'Unable to render PDF page');
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page?.cleanup?.();
      }
    };

    const renderAround = (pageNumber) => {
      const wantedPages = new Set();
      const first = Math.max(1, pageNumber - 1);
      const last = Math.min(pageMeta.pageCount, pageNumber + 3);

      for (let page = first; page <= last; page += 1) {
        wantedPages.add(page);
      }

      cancelRenderTasks(wantedPages);

      for (const pageNumberToRevoke of Array.from(pageUrlsRef.current.keys())) {
        if (!wantedPages.has(pageNumberToRevoke)) revokePageUrl(pageNumberToRevoke);
      }

      for (const page of wantedPages) {
        renderPage(page);
      }
    };

    clearBook();

    const root = document.createElement('div');
    root.className = 'st-pdf-pageflip-root';
    root.style.width = `${pageSize.width}px`;
    root.style.height = `${pageSize.height}px`;
    mount.appendChild(root);

    const pageElements = Array.from({ length: pageMeta.pageCount }, (_, index) => {
      const pageNumber = index + 1;
      const page = document.createElement('div');
      page.className = 'st-pdf-page';
      page.dataset.pageNumber = String(pageNumber);

      const image = document.createElement('img');
      image.className = 'st-pdf-page__image';
      image.alt = `Portfolio page ${pageNumber}`;
      image.decoding = 'async';
      image.draggable = false;

      page.appendChild(image);
      imagesRef.current.set(pageNumber, image);

      return page;
    });

    const initPageFlip = async () => {
      try {
        const { PageFlip } = await import('page-flip');
        if (cancelled || generationRef.current !== generation) return;

        const pageFlip = new PageFlip(root, {
          width: pageSize.width,
          height: pageSize.height,
          size: 'fixed',
          minWidth: pageSize.width,
          maxWidth: pageSize.width,
          minHeight: pageSize.height,
          maxHeight: pageSize.height,
          autoSize: false,
          usePortrait: true,
          drawShadow: true,
          maxShadowOpacity: 0.28,
          flippingTime: reducedMotionRef.current ? 1 : 720,
          startPage: currentPageRef.current - 1,
          showCover: false,
          mobileScrollSupport: false,
          disableFlipByClick: true,
          showPageCorners: false,
          swipeDistance: 24,
        });

        const originalUserStop = pageFlip.userStop.bind(pageFlip);
        // StPageFlip still treats corner clicks as flips; this viewer requires actual drag movement.
        pageFlip.userStop = (point, isSwipe = false) => {
          if (pageFlip.isUserTouch && !pageFlip.isUserMove && !isSwipe) {
            pageFlip.isUserTouch = false;
            return;
          }

          originalUserStop(point, isSwipe);
        };

        pageFlipRef.current = pageFlip;

        pageFlip.on('flip', (event) => {
          const pageNumber = Number(event.data) + 1;
          currentPageRef.current = clamp(pageNumber, 1, pageMeta.pageCount);
          renderAround(currentPageRef.current);
        });

        pageFlip.loadFromHTML(pageElements);
        root.focus?.();
        await renderPage(currentPageRef.current);
        if (cancelled || generationRef.current !== generation) return;
        renderAround(currentPageRef.current);
        setReady(true);
        setStatus('');
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Unable to initialise page flip');
        }
      }
    };

    initPageFlip();

    return () => {
      cancelled = true;
      clearBook();
    };
  }, [pageMeta, pageSize, pdfUrl]);

  const handleKeyDown = (event) => {
    const pageFlip = pageFlipRef.current;
    if (!pageFlip) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const before = pageFlip.getCurrentPageIndex();
      pageFlip.flipNext('bottom');
      window.setTimeout(
        () => {
          if (pageFlipRef.current !== pageFlip) return;
          if (pageFlip.getCurrentPageIndex() === before && before < pageFlip.getPageCount() - 1) {
            pageFlip.turnToNextPage();
          }
        },
        reducedMotionRef.current ? 20 : 840,
      );
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const before = pageFlip.getCurrentPageIndex();
      pageFlip.flipPrev('bottom');
      window.setTimeout(
        () => {
          if (pageFlipRef.current !== pageFlip) return;
          if (pageFlip.getCurrentPageIndex() === before && before > 0) {
            pageFlip.turnToPrevPage();
          }
        },
        reducedMotionRef.current ? 20 : 840,
      );
    }
  };

  return (
    <div
      ref={viewerRef}
      className="st-pdf-viewer"
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={mountRef}
        className={`st-pdf-viewer__mount${ready ? ' is-ready' : ''}`}
        style={pageSize ? { height: `${pageSize.height}px`, width: `${pageSize.width}px` } : undefined}
      />
      {status ? <p className="st-pdf-viewer__status">{status}</p> : null}
    </div>
  );
}
