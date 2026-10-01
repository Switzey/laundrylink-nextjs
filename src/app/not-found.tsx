import { Home } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page flex flex-1 items-center justify-center">
      <section className="w-full max-w-lg text-center">
        <p className="eyebrow">Page not found</p>
        <h1 className="mt-2 text-3xl font-bold text-brand-navy">This page is not available.</h1>
        <p className="mt-3 text-zinc-600">The link may be outdated, or the page may have moved.</p>
        <Link className="btn-primary mt-6" href="/">
          <Home aria-hidden="true" size={17} />
          Go home
        </Link>
      </section>
    </div>
  );
}
