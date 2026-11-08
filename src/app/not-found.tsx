import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-display text-6xl text-gold">404</p>
        <p className="mt-3 text-muted">This path leads nowhere. Not even a treasure.</p>
        <Link href="/explore" className="btn btn-primary mt-6">Back to the map</Link>
      </div>
    </div>
  );
}
