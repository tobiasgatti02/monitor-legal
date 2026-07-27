import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="full-state">
      <SearchX size={30} />
      <h1>Esta sección todavía no está disponible</h1>
      <p>La fundación está preparada; la implementaremos sin interrumpir el monitor PJN.</p>
      <Link className="button button-primary" href="/">
        Volver a Hoy
      </Link>
    </main>
  );
}
