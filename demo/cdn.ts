/** Available CDN endpoints for WoW model assets. */
export const CDN = {
  /** JollyGrin's GitHub repo served via jsDelivr (free, public). */
  JSDELIVR: 'https://cdn.jsdelivr.net/gh/JollyGrin/wow-model-viewer@main/public',

  /** Chronicle Classic's model CDN (requires CORS proxy in dev). */
  CHRONICLE: 'https://models.chronicleclassic.com',

  /** Local dev server (Vite serves public/ directory). */
  LOCAL: '',
} as const;

/** Default CDN used by demos. Change this to switch all demos at once. */
export const CDN_BASE = CDN.JSDELIVR;
