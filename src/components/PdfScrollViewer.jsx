import { useCallback, useEffect, useRef, useState } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './PdfScrollViewer.css';

const QUALITY_SCALE = 1.35;
const MAX_RENDER_EDGE = 8192;
const CACHE_RADIUS = 5;
const PREFETCH_BEFORE = 1;
const PREFETCH_AFTER = 2;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const makeRenderKey = ({ cssWidth, dpr, pageNumber, pdfUrl }) =>
  [pdfUrl, pageNumber, Math.round(cssWidth), dpr.toFixed(2), QUALITY_SCALE].join(':');

export default function PdfScrollViewer({ pdfUrl, initialPage = 1, title = 'PDF', ariaLabel = 'PDF viewer' }) {
  const viewerRef = useRef(null);
  const pdfRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const pageNodesRef = useRef(new Map());
  const renderTasksRef = useRef(new Map());
  const renderTokensRef = useRef(new Map());
  const renderedKeysRef = useRef(new Map());
  const currentPageRef = useRef(Math.max(1, initialPage));
  const pageWidthRef = useRef(0);
  const pageCountRef = useRef(0);
  const reducedMotionRef = useRef(false);

  const [documentMeta, setDocumentMeta] = useState(null);
  const [pageDimensions, setPageDimensions] = useState({});
  const [pageWidth, setPageWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
  const [message, setMessage] = useState('Loading PDF');

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return undefined;

    const measure = () => {
      const rect = viewer.getBoundingClientRect();
      const width = Math.floor(Math.max(280, rect.width));
      const nextWidth = Math.min(width, 1680);

      setPageWidth((previous) => (Math.abs(previous - nextWidth) < 2 ? previous : nextWidth));
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
    pageWidthRef.current = pageWidth;
  }, [pageWidth]);

  useEffect(() => {
    pageCountRef.current = documentMeta?.pageCount ?? 0;
  }, [documentMeta?.pageCount]);

  const registerPage = useCallback((pageNumber, node) => {
    const current = pageNodesRef.current.get(pageNumber) ?? {};

    if (!node) {
      pageNodesRef.current.delete(pageNumber);
      return;
    }

    pageNodesRef.current.set(pageNumber, { ...current, section: node });
  }, []);

  const registerCanvas = useCallback((pageNumber, node) => {
    const current = pageNodesRef.current.get(pageNumber) ?? {};

    if (!node) {
      pageNodesRef.current.set(pageNumber, { ...current, canvas: null });
      return;
    }

    pageNodesRef.current.set(pageNumber, { ...current, canvas: node });
  }, []);

  const clearRenderedPage = useCallback((pageNumber) => {
    const task = renderTasksRef.current.get(pageNumber);
    if (task) {
      task.cancel();
      renderTasksRef.current.delete(pageNumber);
    }

    renderTokensRef.current.delete(pageNumber);
    renderedKeysRef.current.delete(pageNumber);

    const entry = pageNodesRef.current.get(pageNumber);
    if (!entry?.canvas) return;

    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.canvas.removeAttribute('data-rendered');
    entry.section?.classList.remove('is-rendered');
  }, []);

  const updatePageDimension = useCallback((pageNumber, width, height) => {
    setPageDimensions((previous) => {
      const existing = previous[pageNumber];
      if (existing && Math.abs(existing.width - width) < 0.01 && Math.abs(existing.height - height) < 0.01) {
        return previous;
      }

      return {
        ...previous,
        [pageNumber]: { height, width },
      };
    });
  }, []);

  const renderPage = useCallback(
    async (pageNumber) => {
      const pdf = pdfRef.current;
      const entry = pageNodesRef.current.get(pageNumber);
      const cssWidth = pageWidthRef.current;

      if (!pdf || !entry?.canvas || !entry?.section || cssWidth <= 0) return;
      if (pageNumber < 1 || pageNumber > pageCountRef.current) return;

      const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
      const renderKey = makeRenderKey({ cssWidth, dpr, pageNumber, pdfUrl });
      if (renderedKeysRef.current.get(pageNumber) === renderKey) return;

      clearRenderedPage(pageNumber);
      const renderToken = Symbol(`pdf-page-${pageNumber}`);
      renderTokensRef.current.set(pageNumber, renderToken);

      let page;
      let renderTask;

      try {
        page = await pdf.getPage(pageNumber);
        if (renderTokensRef.current.get(pageNumber) !== renderToken) return;

        const baseViewport = page.getViewport({ scale: 1 });
        updatePageDimension(pageNumber, baseViewport.width, baseViewport.height);

        const cssHeight = cssWidth * (baseViewport.height / baseViewport.width);
        const edgeScaleLimit = MAX_RENDER_EDGE / Math.max(cssWidth, cssHeight);
        const renderScale = Math.min(dpr * QUALITY_SCALE, edgeScaleLimit);
        const viewportScale = (cssWidth * renderScale) / baseViewport.width;
        const renderViewport = page.getViewport({ scale: viewportScale });
        const canvas = entry.canvas;
        const context = canvas.getContext('2d', { alpha: false, desynchronized: true });

        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = `${Math.round(cssWidth)}px`;
        canvas.style.height = `${Math.round(cssHeight)}px`;

        if (renderTokensRef.current.get(pageNumber) !== renderToken) return;

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
          canvasContext: context,
          viewport: renderViewport,
        });
        renderTasksRef.current.set(pageNumber, renderTask);

        await renderTask.promise;

        if (renderTasksRef.current.get(pageNumber) !== renderTask || renderTokensRef.current.get(pageNumber) !== renderToken) {
          return;
        }

        renderTasksRef.current.delete(pageNumber);
        renderTokensRef.current.delete(pageNumber);
        renderedKeysRef.current.set(pageNumber, renderKey);
        canvas.dataset.rendered = 'true';
        entry.section.classList.add('is-rendered');
      } catch (error) {
        if (renderTask && renderTasksRef.current.get(pageNumber) === renderTask) {
          renderTasksRef.current.delete(pageNumber);
        }

        if (error?.name !== 'RenderingCancelledException') {
          setMessage(error instanceof Error ? error.message : 'Unable to render PDF page');
        }
      } finally {
        page?.cleanup?.();
      }
    },
    [clearRenderedPage, pdfUrl, updatePageDimension],
  );

  const renderAround = useCallback(
    (pageNumber, shouldEvict = true) => {
      const pageCount = pageCountRef.current;
      if (!pageCount) return;

      const start = Math.max(1, pageNumber - PREFETCH_BEFORE);
      const end = Math.min(pageCount, pageNumber + PREFETCH_AFTER);

      for (let page = start; page <= end; page += 1) {
        renderPage(page);
      }

      if (shouldEvict) {
        for (const renderedPage of Array.from(renderedKeysRef.current.keys())) {
          if (Math.abs(renderedPage - pageNumber) > CACHE_RADIUS) {
            clearRenderedPage(renderedPage);
          }
        }
      }
    },
    [clearRenderedPage, renderPage],
  );

  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setDocumentMeta(null);
      setPageDimensions({});
      setMessage('Loading PDF');
      currentPageRef.current = Math.max(1, initialPage);
      setCurrentPage(currentPageRef.current);

      try {
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        loadingTaskRef.current?.destroy?.();
        pdfRef.current?.destroy?.();

        const loadingTask = pdfjs.getDocument({ url: pdfUrl });
        loadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;

        if (cancelled) {
          await pdf.destroy();
          return;
        }

        const firstPage = await pdf.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        firstPage.cleanup?.();

        pdfRef.current = pdf;
        const initial = clamp(initialPage, 1, pdf.numPages);
        currentPageRef.current = initial;
        setCurrentPage(initial);
        setDocumentMeta({
          defaultHeight: firstViewport.height,
          defaultWidth: firstViewport.width,
          pageCount: pdf.numPages,
        });
        setPageDimensions({
          1: {
            height: firstViewport.height,
            width: firstViewport.width,
          },
        });
        setMessage('');
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Unable to load PDF');
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      loadingTaskRef.current?.destroy?.();
      loadingTaskRef.current = null;

      for (const task of renderTasksRef.current.values()) {
        task.cancel();
      }

      renderTasksRef.current.clear();
      renderTokensRef.current.clear();
      renderedKeysRef.current.clear();
      pdfRef.current?.destroy?.();
      pdfRef.current = null;
    };
  }, [initialPage, pdfUrl]);

  useEffect(() => {
    if (!documentMeta?.pageCount || pageWidth <= 0) return;

    for (const renderedPage of Array.from(renderedKeysRef.current.keys())) {
      clearRenderedPage(renderedPage);
    }

    renderAround(currentPageRef.current);
  }, [clearRenderedPage, documentMeta?.pageCount, pageWidth, renderAround]);

  useEffect(() => {
    if (!documentMeta?.pageCount) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const pageNumber = Number(entry.target.getAttribute('data-page-number'));
          if (!Number.isFinite(pageNumber)) return;

          renderPage(pageNumber);
        });
      },
      {
        root: null,
        rootMargin: '480px 0px',
        threshold: [0.01, 0.35, 0.7],
      },
    );

    pageNodesRef.current.forEach((entry) => {
      if (entry.section) observer.observe(entry.section);
    });

    renderAround(currentPageRef.current);

    return () => observer.disconnect();
  }, [documentMeta?.pageCount, renderAround]);

  useEffect(() => {
    if (!documentMeta?.pageCount) return undefined;

    let frame = 0;

    const updateCurrentPageFromScroll = () => {
      frame = 0;

      const viewportCenter = window.innerHeight / 2;
      let closestPage = currentPageRef.current;
      let closestDistance = Number.POSITIVE_INFINITY;

      pageNodesRef.current.forEach((entry, pageNumber) => {
        if (!entry.section) return;

        const rect = entry.section.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - viewportCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = pageNumber;
        }
      });

      if (closestPage !== currentPageRef.current) {
        currentPageRef.current = closestPage;
        setCurrentPage(closestPage);
        renderAround(closestPage);
      }
    };

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCurrentPageFromScroll);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [documentMeta?.pageCount, renderAround]);

  const scrollToPage = useCallback((pageNumber) => {
    const clampedPage = clamp(pageNumber, 1, pageCountRef.current || 1);
    const entry = pageNodesRef.current.get(clampedPage);

    if (!entry?.section) return;

    entry.section.scrollIntoView({
      block: 'start',
      behavior: reducedMotionRef.current ? 'auto' : 'smooth',
    });
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      scrollToPage(currentPageRef.current + 1);
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      scrollToPage(currentPageRef.current - 1);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      scrollToPage(1);
    }

    if (event.key === 'End') {
      event.preventDefault();
      scrollToPage(pageCountRef.current || 1);
    }
  };

  const pageCount = documentMeta?.pageCount ?? 0;
  const defaultAspect = documentMeta ? `${documentMeta.defaultWidth} / ${documentMeta.defaultHeight}` : '1.414 / 1';
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <section
      ref={viewerRef}
      className="pdf-scroll-viewer"
      style={pageWidth ? { '--pdf-page-width': `${pageWidth}px` } : undefined}
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <header className="pdf-scroll-viewer__bar">
        <h1 className="pdf-scroll-viewer__title">{title}</h1>
        {pageCount ? (
          <p className="pdf-scroll-viewer__status">
            Page {currentPage} / {pageCount}
          </p>
        ) : null}
      </header>

      <div className="pdf-scroll-viewer__pages">
        {pages.map((pageNumber) => {
          const dimensions = pageDimensions[pageNumber];
          const aspect = dimensions ? `${dimensions.width} / ${dimensions.height}` : defaultAspect;

          return (
            <section
              key={pageNumber}
              ref={(node) => registerPage(pageNumber, node)}
              className="pdf-scroll-viewer__page"
              data-page-label={`Page ${pageNumber}`}
              data-page-number={pageNumber}
              style={{ '--pdf-page-aspect': aspect }}
              aria-label={`Page ${pageNumber}`}
            >
              <canvas ref={(node) => registerCanvas(pageNumber, node)} />
            </section>
          );
        })}
      </div>

      {message ? <p className="pdf-scroll-viewer__message">{message}</p> : null}
    </section>
  );
}
