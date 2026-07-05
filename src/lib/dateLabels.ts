export type ContentLocale = 'en' | 'es';

const monthNames: Record<ContentLocale, string[]> = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  es: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
};

export const formatMonthYear = (
  month: number | undefined,
  year: number | string | undefined,
  locale: ContentLocale = 'en',
) => {
  const monthIndex = month === undefined ? -1 : month - 1;
  const yearLabel = year === undefined ? '' : String(year).trim();

  if (
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex >= monthNames[locale].length ||
    !yearLabel
  ) {
    return undefined;
  }

  return `${monthNames[locale][monthIndex]} ${yearLabel}`;
};
