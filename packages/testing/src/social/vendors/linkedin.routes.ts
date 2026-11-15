// packages/testing/src/social/vendors/linkedin.routes.ts
//
// LinkedIn versioned REST API answers for the publish flow: register an image upload, PUT its
// bytes, read its status, create the post. Paths match under /rest and /dms-uploads only, so any
// other LinkedIn path falls through to "no route" and throws.
import {
  vendorEmpty,
  vendorJson,
  vendorRoute,
  type VendorEndpoint,
  type VendorRoute,
} from '../../vendor-http/vendor-route';
import {
  LINKEDIN_POST_ID,
  LINKEDIN_UPLOAD_HOST,
  linkedinImageResource,
  linkedinInitializeUploadResponse,
} from './linkedin.fixture';

const API_HOST = 'api.linkedin.com';
const BASE = '/rest';

export const LINKEDIN_ENDPOINTS = {
  initializeUpload: { method: 'POST', host: API_HOST, path: new RegExp(`^${BASE}/images$`) },
  uploadImage: {
    method: 'PUT',
    host: LINKEDIN_UPLOAD_HOST,
    path: /^\/dms-uploads\/([^/]+)$/,
  },
  imageStatus: { method: 'GET', host: API_HOST, path: new RegExp(`^${BASE}/images/([^/]+)$`) },
  createPost: { method: 'POST', host: API_HOST, path: new RegExp(`^${BASE}/posts$`) },
} satisfies Record<string, VendorEndpoint>;

export const LINKEDIN_ROUTES: readonly VendorRoute[] = [
  vendorRoute(LINKEDIN_ENDPOINTS.initializeUpload, () =>
    vendorJson(linkedinInitializeUploadResponse(crypto.randomUUID().replaceAll('-', ''))),
  ),
  vendorRoute(LINKEDIN_ENDPOINTS.uploadImage, () => vendorEmpty(201)),
  vendorRoute(LINKEDIN_ENDPOINTS.imageStatus, () => vendorJson(linkedinImageResource('AVAILABLE'))),
  vendorRoute(LINKEDIN_ENDPOINTS.createPost, () =>
    vendorEmpty(201, { 'x-restli-id': LINKEDIN_POST_ID }),
  ),
];
