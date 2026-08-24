import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-neutral-600">Cet événement ou cette page n’existe pas.</p>
      <Link href="/" className="mt-6 inline-block text-sky-700 underline">
        Retour à l’agenda
      </Link>
    </main>
  );
}
