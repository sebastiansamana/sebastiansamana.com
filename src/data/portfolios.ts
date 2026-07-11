export interface Portfolio {
  id: string;
  title: string;
  subtitle?: string;
  pdfUrl: string;
  pdfPreviewImage?: string;
  pdfPreviewImageWidth?: number;
  pdfPreviewImageHeight?: number;
  coverImage?: string;
  coverHoverImage?: string;
  coverImageAlt?: string;
  coverImageWidth?: number;
  coverImageHeight?: number;
  pageCount: number;
  pageAspectRatios?: number[];
}

const studio22PageCount = 39;
const studio22StandardPageRatio = 1686.61 / 1190.55;
const studio22TallPageRatio = 1686.61 / 1303.94;
const studio22TallPages = new Set([5, 8, 9, 11, 15, 17, 18, 21, 24, 26, 27, 28]);
const studio22PageAspectRatios = Array.from({ length: studio22PageCount }, (_, index) =>
  studio22TallPages.has(index + 1) ? studio22TallPageRatio : studio22StandardPageRatio,
);

export const portfolios: Portfolio[] = [
  {
    id: 'studio-2-2',
    title: 'Studio 2.2',
    pdfUrl: '/pdfs/studio-2-2.pdf',
    pdfPreviewImage: '/images/portfolios/2-2-g1-sebastian-varela-hitscherich-cover.png',
    pdfPreviewImageWidth: 1200,
    pdfPreviewImageHeight: 847,
    coverImage: '/images/portfolios/studio-2-2-thumbnail.jpg',
    coverHoverImage: '/images/portfolios/studio-2-2-thumbnail-red-hover.jpg',
    coverImageAlt: 'Studio 2.2 movable module thumbnail',
    coverImageWidth: 1600,
    coverImageHeight: 906,
    pageCount: studio22PageCount,
    pageAspectRatios: studio22PageAspectRatios,
  },
];

export const getPortfolioById = (id: string) => portfolios.find((portfolio) => portfolio.id === id);
