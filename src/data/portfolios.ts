export interface Portfolio {
  id: string;
  title: string;
  subtitle?: string;
  pdfUrl: string;
  coverImage?: string;
  coverHoverImage?: string;
  coverImageAlt?: string;
  coverImageWidth?: number;
  coverImageHeight?: number;
  pageCount?: number;
}

export const portfolios: Portfolio[] = [
  {
    id: 'studio-2-2',
    title: 'Studio 2.2',
    pdfUrl: '/pdfs/2.2_G1_Sebastian_Varela_Hitscherich.pdf',
    coverImage: '/images/portfolios/studio-2-2-thumbnail.jpg',
    coverHoverImage: '/images/portfolios/studio-2-2-thumbnail-red-hover.jpg',
    coverImageAlt: 'Studio 2.2 movable module thumbnail',
    coverImageWidth: 1600,
    coverImageHeight: 906,
    pageCount: 39,
  },
];

export const getPortfolioById = (id: string) => portfolios.find((portfolio) => portfolio.id === id);
