import { useEffect, useRef, useState } from 'react';
import './PdfScrollViewer.css';

const withPdfViewOptions = (pdfUrl) => {
  const separator = pdfUrl.includes('#') ? '&' : '#';
  return `${pdfUrl}${separator}toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-width`;
};

export default function PdfScrollViewer({
  pdfUrl,
  title = 'PDF',
  ariaLabel = 'PDF viewer',
  pageCount = 1,
  pageAspectRatio = 1.414,
}) {
  const viewerRef = useRef(null);
  const [documentHeight, setDocumentHeight] = useState(null);
  const source = withPdfViewOptions(pdfUrl);
  const safePageCount = Number.isFinite(pageCount) && pageCount > 0 ? pageCount : 1;
  const safePageAspectRatio = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0 ? pageAspectRatio : 1.414;

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return undefined;

    const measure = () => {
      const { width } = viewer.getBoundingClientRect();
      if (width <= 0) return;

      const pageHeight = width / safePageAspectRatio;
      const nextHeight = Math.ceil(pageHeight * safePageCount);
      setDocumentHeight((previous) => (Math.abs((previous ?? 0) - nextHeight) < 2 ? previous : nextHeight));
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewer);
    window.addEventListener('orientationchange', measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [safePageAspectRatio, safePageCount]);

  return (
    <section
      ref={viewerRef}
      className="pdf-scroll-viewer"
      style={{
        '--pdf-document-height': documentHeight ? `${documentHeight}px` : undefined,
      }}
      aria-label={ariaLabel}
    >
      <object className="pdf-scroll-viewer__frame" data={source} type="application/pdf" aria-label={title}>
        <iframe className="pdf-scroll-viewer__frame" src={source} title={title} />
        <p className="pdf-scroll-viewer__fallback">
          <a href={pdfUrl}>Open PDF</a>
        </p>
      </object>
    </section>
  );
}
