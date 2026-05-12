declare global {
  interface Window {
    googletag?: {
      cmd: Array<() => void>;
      defineSlot: (adUnitPath: string, size: number[] | number[][], divId: string) => any;
      pubads: () => any;
      enableServices: () => void;
      display: (divId: string) => void;
      destroySlots: (slots?: any[]) => boolean;
    };
    adsbygoogle?: any[];
  }
}

export interface AdConfig {
  networkCode: string;
  adUnitPath: string;
  sizes: number[][] | number[];
}

export const AD_SLOTS = {
  libraryBanner: {
    id: "accessibooks-library-banner",
    sizes: [[728, 90], [320, 50]],
  },
  playerSidebar: {
    id: "accessibooks-player-sidebar",
    sizes: [[300, 250]],
  },
  inContent: {
    id: "accessibooks-in-content",
    sizes: [[336, 280], [300, 250]],
  },
} as const;

let gptLoaded = false;
let adsenseLoaded = false;

export function loadGPT(): Promise<void> {
  if (gptLoaded) return Promise.resolve();
  
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
    script.async = true;
    script.onload = () => {
      gptLoaded = true;
      if (!window.googletag) {
        (window as any).googletag = { cmd: [] };
      }
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load GPT"));
    document.head.appendChild(script);
  });
}

export function loadAdSense(publisherId: string): Promise<void> {
  if (adsenseLoaded) return Promise.resolve();
  
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      adsenseLoaded = true;
      window.adsbygoogle = window.adsbygoogle || [];
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load AdSense"));
    document.head.appendChild(script);
  });
}

export function defineGPTSlot(
  networkCode: string,
  adUnitName: string,
  sizes: number[][] | number[],
  divId: string
): void {
  if (!window.googletag) return;
  
  window.googletag.cmd.push(() => {
    const slot = window.googletag!.defineSlot(
      `/${networkCode}/${adUnitName}`,
      sizes,
      divId
    );
    if (slot) {
      slot.addService(window.googletag!.pubads());
    }
    window.googletag!.enableServices();
  });
}

export function displayGPTSlot(divId: string): void {
  if (!window.googletag) return;
  
  window.googletag.cmd.push(() => {
    window.googletag!.display(divId);
  });
}

export function destroyAllSlots(): void {
  if (!window.googletag) return;
  
  window.googletag.cmd.push(() => {
    window.googletag!.destroySlots();
  });
}

export function pushAdSenseAd(): void {
  if (window.adsbygoogle) {
    window.adsbygoogle.push({});
  }
}
