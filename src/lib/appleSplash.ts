import screens from './appleSplashScreens.json';

export type AppleSplashOrientation = 'portrait' | 'landscape';

export type AppleSplashSpec = {
  label: string;
  /** Portrait logical CSS pixels. iOS does not swap these in landscape. */
  deviceWidth: number;
  deviceHeight: number;
  dpr: number;
  orientation: AppleSplashOrientation;
};

export const APPLE_SPLASH_SCREENS = screens as AppleSplashSpec[];

/** Pixel size of the PNG. Landscape swaps the portrait pixel axes. */
export function appleSplashPixels(spec: AppleSplashSpec): {
  width: number;
  height: number;
} {
  const portraitW = spec.deviceWidth * spec.dpr;
  const portraitH = spec.deviceHeight * spec.dpr;
  if (spec.orientation === 'landscape') {
    return { width: portraitH, height: portraitW };
  }
  return { width: portraitW, height: portraitH };
}

/**
 * Apple picks the startup image by media query, not by `sizes`.
 * `device-width` / `device-height` stay the portrait logical size.
 */
export function appleSplashMedia(spec: AppleSplashSpec): string {
  return [
    'screen',
    `(device-width: ${spec.deviceWidth}px)`,
    `(device-height: ${spec.deviceHeight}px)`,
    `(-webkit-device-pixel-ratio: ${spec.dpr})`,
    `(orientation: ${spec.orientation})`,
  ].join(' and ');
}

export function appleSplashHref(spec: AppleSplashSpec): string {
  const { width, height } = appleSplashPixels(spec);
  return `/splash/apple-${width}x${height}.png`;
}
