export const DEFAULT_LIST_PAGE_SIZE = 25;

export type PaginationPageItem = number | 'ellipsis';

/**
 * Page numbers to show: first, last, the current page and its two neighbours.
 * Every gap collapses into one ellipsis.
 */
export function getPaginationPages(
  currentPage: number,
  totalPages: number,
): PaginationPageItem[] {
  const shown = [1, currentPage - 1, currentPage, currentPage + 1, totalPages]
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .filter((pageNumber, index, all) => all.indexOf(pageNumber) === index)
    .sort((a, b) => a - b);

  return shown.flatMap((pageNumber, index) => {
    const previous = shown[index - 1];
    return previous !== undefined && pageNumber - previous > 1
      ? ['ellipsis' as const, pageNumber]
      : [pageNumber];
  });
}
