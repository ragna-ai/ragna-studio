export interface PageCrumb {
  label: string;
  to?: string;
}

interface PageBreadcrumbState {
  owner: number | null;
  crumbs: PageCrumb[];
}

let nextOwner = 0;

export function usePageBreadcrumbState() {
  return useState<PageBreadcrumbState>('page-breadcrumb', () => ({
    owner: null,
    crumbs: [],
  }));
}

// The page that sets the trail owns it: it is cleared when that page goes away,
// so no crumb leaks to the next page.
export function usePageBreadcrumb(getCrumbs: () => PageCrumb[]) {
  const state = usePageBreadcrumbState();
  const owner = ++nextOwner;

  watchEffect(() => {
    state.value = { owner, crumbs: getCrumbs() };
  });

  onScopeDispose(() => {
    if (state.value.owner === owner) {
      state.value = { owner: null, crumbs: [] };
    }
  });
}
