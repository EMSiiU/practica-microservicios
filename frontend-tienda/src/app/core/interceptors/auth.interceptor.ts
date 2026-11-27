import { HttpInterceptorFn } from '@angular/common/http';

const TOKEN_STORAGE_KEY = 'tutienda_jwt_token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token || req.headers.has('Authorization') || req.url.endsWith('/health')) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
  return next(authReq);
};
