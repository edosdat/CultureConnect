'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  MAIL_IDEAS_EVENT,
  MAIL_IDEAS_LABEL,
  readMailIdeasCookie,
  writeMailIdeasCookie,
} from '@/lib/mailConsent';

export default function MailIdeasCheckbox({
  className,
}: {
  className?: string;
}) {
  const { data: session } = useSession();
  const loggedIn = Boolean(session?.user);
  const [opted, setOpted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function applyCookie() {
      if (!cancelled) setOpted(readMailIdeasCookie() === '1');
    }

    if (!loggedIn) {
      applyCookie();
      window.addEventListener(MAIL_IDEAS_EVENT, applyCookie);
      return () => {
        cancelled = true;
        window.removeEventListener(MAIL_IDEAS_EVENT, applyCookie);
      };
    }

    const pending = readMailIdeasCookie();
    const flush =
      pending === '1' || pending === '0'
        ? fetch('/api/mail-consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opted: pending === '1' }),
          })
        : Promise.resolve();

    flush
      .then(() => fetch('/api/mail-consent'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { opted?: unknown } | null) => {
        if (!cancelled) setOpted(Boolean(d?.opted));
      })
      .catch(() => {
        if (!cancelled) applyCookie();
      });

    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setOpted(next);
    writeMailIdeasCookie(next);
    if (loggedIn) {
      void fetch('/api/mail-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opted: next }),
      });
    }
  }

  return (
    <label
      className={
        className ??
        'flex max-w-[12.5rem] items-start gap-1.5 text-left text-[11px] leading-snug text-culture-ink'
      }
    >
      <input
        type="checkbox"
        checked={opted}
        onChange={onChange}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-culture-terracotta"
      />
      <span>{MAIL_IDEAS_LABEL}</span>
    </label>
  );
}
