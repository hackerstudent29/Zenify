import { useNavigate, useLocation, useParams as useReactRouterParams, useSearchParams as useReactRouterSearchParams } from 'react-router-dom';

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (url: string) => navigate(url),
    replace: (url: string) => navigate(url, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.location.reload(),
    prefetch: () => {},
  };
}

export function usePathname() {
  const location = useLocation();
  return location.pathname;
}

export function useParams() {
  const params = useReactRouterParams();
  // Support Next.js catch-all routes ([...id])
  if (params['*'] !== undefined) {
    return {
      ...params,
      id: params['*'].split('/').filter(Boolean),
    };
  }
  return params;
}

export function useSearchParams() {
  const [searchParams] = useReactRouterSearchParams();
  return searchParams;
}
