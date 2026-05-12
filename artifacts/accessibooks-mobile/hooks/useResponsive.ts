import { useWindowDimensions } from "react-native";

/**
 * Responsive breakpoints for the AccessiBooks mobile app.
 *
 * Phones use the existing single-column layout. Tablets (>= 768pt on the
 * shorter edge, matching the iPad mini baseline) get wider layouts:
 * multi-column grids on Library/Search, side-by-side cover + details on
 * Book Detail, larger covers + carousels on Home, and a centered max-width
 * column on Settings/Player so text doesn't span the full screen.
 */
export type Responsive = {
  width: number;
  height: number;
  isTablet: boolean;
  isLargeTablet: boolean;
  isLandscape: boolean;
  /** Columns to use in book grids (Library, Search results). */
  gridColumns: number;
  /** Cover width to use in horizontal carousels on Home. */
  carouselItemWidth: number;
  /** Maximum content width for centered text columns (Settings, Player). */
  contentMaxWidth: number;
  /** Horizontal page padding. */
  pagePadding: number;
};

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const shorter = Math.min(width, height);
  const isTablet = shorter >= 768;
  const isLargeTablet = shorter >= 1024;
  const isLandscape = width > height;

  let gridColumns = 1;
  if (isLargeTablet) gridColumns = isLandscape ? 5 : 4;
  else if (isTablet) gridColumns = isLandscape ? 4 : 3;

  const carouselItemWidth = isLargeTablet ? 180 : isTablet ? 160 : 132;
  const contentMaxWidth = isLargeTablet ? 760 : isTablet ? 640 : width;
  const pagePadding = isTablet ? 32 : 16;

  return {
    width,
    height,
    isTablet,
    isLargeTablet,
    isLandscape,
    gridColumns,
    carouselItemWidth,
    contentMaxWidth,
    pagePadding,
  };
}
