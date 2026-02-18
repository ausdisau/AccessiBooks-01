/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_DFP_NETWORK_CODE?: string;
  readonly VITE_ADSENSE_SLOT_LIBRARY_TOP?: string;
  readonly VITE_ADSENSE_SLOT_LIBRARY_INLINE?: string;
  readonly VITE_ADSENSE_SLOT_PLAYER_SIDEBAR?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
