import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_THEME_STATE,
  buildReaderCssVars,
  findPreset,
  loadReaderThemeState,
  resolveReaderTheme,
  saveReaderThemeState,
  type CSSVarMap,
  type ReaderControlDensity,
  type ReaderFontFamily,
  type ReaderMotion,
  type ReaderOverrides,
  type ReaderPresetId,
  type ReaderThemeName,
  type ReaderThemeState,
  type ReaderTypography,
  type ResolvedReaderTheme,
} from "./reader-theme";

export interface UseReaderTheme {
  state: ReaderThemeState;
  resolved: ResolvedReaderTheme;
  applyPreset: (id: ReaderPresetId) => void;
  setTheme: (theme: ReaderThemeName) => void;
  setFontFamily: (family: ReaderFontFamily) => void;
  setTypographyValue: <K extends keyof ReaderTypography>(
    key: K,
    value: ReaderTypography[K],
  ) => void;
  setMotion: (motion: ReaderMotion) => void;
  setControlDensity: (density: ReaderControlDensity) => void;
  resetToDefaults: () => void;
  cssVariables: CSSVarMap;
}

type OverrideKey = keyof ReaderOverrides;

export function useReaderTheme(): UseReaderTheme {
  const [state, setState] = useState<ReaderThemeState>(DEFAULT_THEME_STATE);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setState(loadReaderThemeState());
    setHydrated(true);
  }, []);

  // Persist on change (after hydration so we don't overwrite with defaults)
  useEffect(() => {
    if (!hydrated) return;
    saveReaderThemeState(state);
  }, [hydrated, state]);

  const applyPreset = useCallback((id: ReaderPresetId) => {
    // Applying a preset clears all overrides — the user gets the preset's
    // values exactly. Subsequent fine-tuning lands in `overrides` while
    // `basePreset` remains so the UI can still show "Dyslexia Support
    // (customised)".
    setState({ basePreset: id, overrides: {} });
  }, []);

  // Generic override setter that preserves preset identity. If the new
  // value matches the preset's value we drop the override key so the
  // "customised" indicator can disappear when the user reverts manually.
  const setOverride = useCallback(
    <K extends OverrideKey>(key: K, value: NonNullable<ReaderOverrides[K]>) => {
      setState((s) => {
        const preset = findPreset(s.basePreset);
        const presetValue = readPresetValue(preset, key);
        const next: ReaderOverrides = { ...s.overrides };
        if (presetValue !== undefined && valuesEqual(presetValue, value)) {
          delete next[key];
        } else {
          next[key] = value;
        }
        return { basePreset: s.basePreset, overrides: next };
      });
    },
    [],
  );

  const setTheme = useCallback(
    (theme: ReaderThemeName) => setOverride("theme", theme),
    [setOverride],
  );
  const setFontFamily = useCallback(
    (family: ReaderFontFamily) => setOverride("fontFamily", family),
    [setOverride],
  );
  const setMotion = useCallback(
    (motion: ReaderMotion) => setOverride("motion", motion),
    [setOverride],
  );
  const setControlDensity = useCallback(
    (density: ReaderControlDensity) => setOverride("controlDensity", density),
    [setOverride],
  );

  const setTypographyValue = useCallback(
    <K extends keyof ReaderTypography>(key: K, value: ReaderTypography[K]) => {
      // The typography keys are 1:1 with their override keys.
      setOverride(key as OverrideKey, value as never);
    },
    [setOverride],
  );

  const resetToDefaults = useCallback(() => {
    setState(DEFAULT_THEME_STATE);
  }, []);

  const resolved = useMemo(() => resolveReaderTheme(state), [state]);
  const cssVariables = useMemo<CSSVarMap>(
    () => buildReaderCssVars(resolved.typography),
    [resolved.typography],
  );

  return {
    state,
    resolved,
    applyPreset,
    setTheme,
    setFontFamily,
    setTypographyValue,
    setMotion,
    setControlDensity,
    resetToDefaults,
    cssVariables,
  };
}

function readPresetValue(
  preset: ReturnType<typeof findPreset>,
  key: OverrideKey,
): ReaderOverrides[OverrideKey] | undefined {
  switch (key) {
    case "theme":
      return preset.theme;
    case "motion":
      return preset.motion;
    case "controlDensity":
      return preset.controlDensity;
    case "fontFamily":
      return preset.typography.fontFamily;
    case "fontSize":
      return preset.typography.fontSize;
    case "lineHeight":
      return preset.typography.lineHeight;
    case "letterSpacing":
      return preset.typography.letterSpacing;
    case "wordSpacing":
      return preset.typography.wordSpacing;
    default:
      return undefined;
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-6;
  }
  return a === b;
}
