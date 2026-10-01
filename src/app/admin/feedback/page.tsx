import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdminSession } from '@/lib/adminGate';
import { listFeedbackForAdmin } from '@/lib/feedbackStore';
import type { AdminFeedbackNote } from '@/lib/feedbackNote';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Avis — Admin',
  robots: { index: false, follow: false },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

const KIND_LABEL: Record<AdminFeedbackNote['kind'], string> = {
  avis: 'avis',
  idee: 'idée',
  bug: 'bug',
  autre: 'autre',
};

function actorLabel(note: AdminFeedbackNote): string {
  if (note.actor === 'compte') return 'Compte';
  if (note.actor === 'visiteur') return 'Visiteur';
  return 'Anonyme';
}

export default async function AdminFeedbackPage() {
  if (!(await isAdminSession())) notFound();

  let notes: AdminFeedbackNote[] = [];
  let unavailable = false;
  try {
    notes = await listFeedbackForAdmin();
  } catch {
    unavailable = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
        Admin · HOLD
      </p>
      <h1 className="mt-1 font-display text-3xl text-culture-ink">Avis et idées</h1>
      <p className="mt-2 text-sm text-culture-muted">
        90 jours, puis suppression. Purge quotidienne (cron). L’envoi et cette
        page purgent aussi : sans l’un ni l’autre, une ligne périmée peut
        rester jusqu’au prochain passage. Empreinte de compte ou cc_vid, jamais
        les deux. Pas d’e-mail.
      </p>
      <p className="mt-3 text-sm">
        <Link
          href="/admin/analytics"
          className="text-culture-terracotta underline-offset-2 hover:underline"
        >
          Analytics
        </Link>
      </p>

      {unavailable ? (
        <p className="mt-8 text-sm text-culture-ink">Lecture indisponible.</p>
      ) : notes.length === 0 ? (
        <p className="mt-8 text-sm text-culture-muted">Pas encore d’avis.</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-2xl border border-culture-line bg-white px-4 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
                {KIND_LABEL[note.kind]} · {formatWhen(note.createdAt)} · {actorLabel(note)}
                {note.ref ? (
                  <span className="ml-1 font-mono normal-case tracking-normal">
                    {note.ref}
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-culture-ink">{note.body}</p>
              {note.reply ? (
                <p className="mt-2 text-sm text-culture-muted">{note.reply}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
