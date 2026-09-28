'use client';

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { catalogueImageSrc } from '@/lib/catalogueImage';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src: string;
  /** Shown when src is empty or the host rejects the hotlink. */
  fallback?: ReactNode;
};

/**
 * Event photo from catalogue image_url.
 * Always omit Referer — hosts like Flashback Café 403 CultureConnect’s origin.
 * A dead poster (archive.org) is not requested. onError swaps to the
 * fallback immediately. Image success never gates the Ciné rail.
 */
export default function EventImage({
  src,
  fallback = null,
  alt = '',
  ...rest
}: Props) {
  const safe = catalogueImageSrc(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [safe]);
  if (!safe || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safe}
      alt={alt}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
