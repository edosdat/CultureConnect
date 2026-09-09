'use client';

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src: string;
  /** Shown when src is empty or the host rejects the hotlink. */
  fallback?: ReactNode;
};

/**
 * Event photo from catalogue image_url.
 * Always omit Referer — hosts like Flashback Café 403 CultureConnect’s origin.
 */
export default function EventImage({
  src,
  fallback = null,
  alt = '',
  ...rest
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src.trim() || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
