import { useEffect, useRef, useState } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import { loadGPT, loadAdSense, defineGPTSlot, displayGPTSlot, destroyAllSlots, pushAdSenseAd } from "@/lib/ads";

type AdType = "gpt" | "adsense";

interface GoogleAdProps {
  type?: AdType;
  slotId: string;
  sizes?: number[][] | number[];
  networkCode?: string;
  adUnitName?: string;
  adsenseSlot?: string;
  adsenseClient?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function GoogleAd({
  type = "adsense",
  slotId,
  sizes = [[728, 90], [320, 50]],
  networkCode,
  adUnitName,
  adsenseSlot,
  adsenseClient,
  className = "",
  style,
}: GoogleAdProps) {
  const { isPremium } = useSubscription();
  const adRef = useRef<HTMLDivElement>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);
  const slotRef = useRef<any>(null);

  useEffect(() => {
    if (isPremium || adLoaded) return;

    if (type === "adsense" && (!adsenseClient || !adsenseSlot)) {
      console.warn("AdSense requires both adsenseClient and adsenseSlot");
      return;
    }

    if (type === "gpt" && (!networkCode || !adUnitName)) {
      console.warn("GPT requires both networkCode and adUnitName");
      return;
    }

    const loadAd = async () => {
      try {
        if (type === "gpt" && networkCode && adUnitName) {
          await loadGPT();
          defineGPTSlot(networkCode, adUnitName, sizes, slotId);
          displayGPTSlot(slotId);
          setAdLoaded(true);
        } else if (type === "adsense" && adsenseClient && adsenseSlot) {
          await loadAdSense(adsenseClient);
          pushAdSenseAd();
          setAdLoaded(true);
        }
      } catch (error) {
        console.error("Failed to load ad:", error);
        setAdError(true);
      }
    };

    const timer = setTimeout(loadAd, 100);
    
    return () => {
      clearTimeout(timer);
      if (type === "gpt" && adLoaded) {
        destroyAllSlots();
      }
    };
  }, [type, networkCode, adUnitName, slotId, sizes, adsenseClient, adsenseSlot, isPremium, adLoaded]);

  if (isPremium) {
    return null;
  }

  if (adError) {
    return null;
  }

  if (type === "adsense" && (!adsenseClient || !adsenseSlot)) {
    return null;
  }

  if (type === "gpt" && (!networkCode || !adUnitName)) {
    return null;
  }

  if (type === "gpt") {
    return (
      <div
        id={slotId}
        ref={adRef}
        className={`google-ad-container ${className}`}
        style={style}
        role="complementary"
        aria-label="Advertisement"
      />
    );
  }

  return (
    <div className={`google-ad-container ${className}`} style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: "block", ...style }}
        data-ad-client={adsenseClient}
        data-ad-slot={adsenseSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        role="complementary"
        aria-label="Advertisement"
      />
    </div>
  );
}

interface ResponsiveAdProps {
  position: "library-top" | "library-inline" | "player-sidebar";
  className?: string;
}

export function ResponsiveAd({ position, className = "" }: ResponsiveAdProps) {
  const { isPremium } = useSubscription();

  if (isPremium) {
    return null;
  }

  const adsenseClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const networkCode = import.meta.env.VITE_DFP_NETWORK_CODE;

  if (!adsenseClient && !networkCode) {
    return null;
  }

  const slotConfig = {
    "library-top": {
      slotId: "accessibooks-library-top",
      sizes: [[728, 90], [320, 50]] as number[][],
      adUnitName: "library_top",
      adsenseSlot: import.meta.env.VITE_ADSENSE_SLOT_LIBRARY_TOP,
    },
    "library-inline": {
      slotId: "accessibooks-library-inline",
      sizes: [[336, 280], [300, 250]] as number[][],
      adUnitName: "library_inline",
      adsenseSlot: import.meta.env.VITE_ADSENSE_SLOT_LIBRARY_INLINE,
    },
    "player-sidebar": {
      slotId: "accessibooks-player-sidebar",
      sizes: [[300, 250]] as number[][],
      adUnitName: "player_sidebar",
      adsenseSlot: import.meta.env.VITE_ADSENSE_SLOT_PLAYER_SIDEBAR,
    },
  };

  const config = slotConfig[position];

  if (networkCode) {
    return (
      <GoogleAd
        type="gpt"
        slotId={config.slotId}
        sizes={config.sizes}
        networkCode={networkCode}
        adUnitName={config.adUnitName}
        className={className}
      />
    );
  }

  return (
    <GoogleAd
      type="adsense"
      slotId={config.slotId}
      adsenseClient={adsenseClient}
      adsenseSlot={config.adsenseSlot}
      className={className}
    />
  );
}
