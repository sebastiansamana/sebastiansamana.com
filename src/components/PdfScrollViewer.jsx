import { useEffect, useRef, useState } from 'react';
import './PdfScrollViewer.css';

const renderPixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.75);

function PdfPage({ document, pageNumber, pageAspectRatio, title }) {
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(pageNumber === 1);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const pageElement = pageRef.current;
    if (!pageElement || shouldRender) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldRender(true);
        observer.disconnect();
      },
      { rootMargin: '1200px 0px' },
    );

    observer.observe(pageElement);
    return () => observer.disconnect();
  }, [shouldRender]);

  useEffect(() => {
    const pageElement = pageRef.current;
    const canvas = canvasRef.current;
    if (!document || !pageElement || !canvas || !shouldRender) return undefined;

    let disposed = false;
    let renderTask;
    let renderSequence = 0;

    const render = async () => {
      const sequence = ++renderSequence;

      try {
        const page = await document.getPage(pageNumber);
        if (disposed || sequence !== renderSequence) return;

        const availableWidth = pageElement.getBoundingClientRect().width;
        if (availableWidth <= 0) return;

        if (renderTask) renderTask.cancel();

        const baseViewport = page.getViewport({ scale: 1 });
        const outputScale = renderPixelRatio();
        const viewport = page.getViewport({ scale: (availableWidth / baseViewport.width) * outputScale });

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;

        renderTask = page.render({ canvas, viewport, background: '#ffffff' });
        await renderTask.promise;

        if (!disposed && sequence === renderSequence) {
          setRendered(true);
          setFailed(false);
        }
      } catch (error) {
        if (error?.name === 'RenderingCancelledException' || disposed) return;
        setFailed(true);
      }
    };

    const resizeObserver = new ResizeObserver(() => render());
    resizeObserver.observe(pageElement);
    render();

    return () => {
      disposed = true;
      renderSequence += 1;
      resizeObserver.disconnect();
      if (renderTask) renderTask.cancel();
    };
  }, [document, pageNumber, shouldRender]);

  return (
    <div
      ref={pageRef}
      className={`pdf-scroll-viewer__page${rendered ? ' is-rendered' : ''}`}
      style={{ '--pdf-page-aspect-ratio': pageAspectRatio }}
    >
      <canvas ref={canvasRef} aria-label={`${title}, page ${pageNumber}`} role="img" />
      {!rendered && shouldRender && !failed ? (
        <span className="pdf-scroll-viewer__page-status">Loading page {pageNumber}…</span>
      ) : null}
      {failed ? <span className="pdf-scroll-viewer__page-status">Page {pageNumber} could not be displayed.</span> : null}
    </div>
  );
}

export default function PdfScrollViewer({
  pdfUrl,
  title = 'PDF',
  ariaLabel = 'PDF viewer',
  pageCount = 1,
  pageAspectRatio = 1.414,
}) {
  const [document, setDocument] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loadProgress, setLoadProgress] = useState(null);
  const expectedPageCount = Number.isFinite(pageCount) && pageCount > 0 ? pageCount : 1;
  const safePageAspectRatio = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0 ? pageAspectRatio : 1.414;
  const displayedPageCount = document?.numPages || expectedPageCount;

  useEffect(() => {
    let disposed = false;
    let loadingTask;

    const load = async () => {
      try {
        const pdfjs = await import('pdfjs-dist/webpack.mjs');
        if (disposed) return;

        loadingTask = pdfjs.getDocument({ url: pdfUrl });
        loadingTask.onProgress = ({ loaded, total }) => {
          if (!disposed && total > 0) setLoadProgress(Math.round((loaded / total) * 100));
        };

        const loadedDocument = await loadingTask.promise;
        if (disposed) {
          await loadedDocument.destroy();
          return;
        }

        setDocument(loadedDocument);
      } catch (error) {
        if (!disposed) setLoadError(true);
      }
    };

    load();

    return () => {
      disposed = true;
      if (loadingTask) loadingTask.destroy();
    };
  }, [pdfUrl]);

  return (
    <section className="pdf-scroll-viewer" aria-label={ariaLabel} aria-busy={!document && !loadError}>
      {!document && !loadError ? (
        <p className="pdf-scroll-viewer__document-status" role="status">
          Loading portfolio{loadProgress !== null ? ` ${loadProgress}%` : ''}…
        </p>
      ) : null}

      {loadError ? (
        <p className="pdf-scroll-viewer__fallback">
          The portfolio could not be displayed. <a href={pdfUrl}>Open the PDF</a>
        </p>
      ) : (
        <div className="pdf-scroll-viewer__pages">
          {Array.from({ length: displayedPageCount }, (_, index) => (
            <PdfPage
              key={index + 1}
              document={document}
              pageNumber={index + 1}
              pageAspectRatio={safePageAspectRatio}
              title={title}
            />
          ))}
        </div>
      )}
    </section>
  );
}
