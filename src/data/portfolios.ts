export interface Portfolio {
  id: string;
  title: string;
  subtitle?: string;
  pdfUrl: string;
  coverImage?: string;
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
    coverImage: '/images/portfolios/2-2-g1-sebastian-varela-hitscherich-cover.png',
    coverImageAlt: 'Cover page of Studio 2.2',
    coverImageWidth: 1200,
    coverImageHeight: 847,
    pageCount: 39,
  },
];

export const getPortfolioById = (id: string) => portfolios.find((portfolio) => portfolio.id === id);
