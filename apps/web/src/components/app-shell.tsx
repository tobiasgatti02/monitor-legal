"use client";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Gavel,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UserSearch,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
const navigation = [
  { label: "Hoy", href: "/", icon: LayoutDashboard },
  { label: "Asistente jurídico", href: "/agente", icon: Sparkles },
  { label: "Causas", href: "/causas", icon: BriefcaseBusiness },
  { label: "Novedades", href: "/novedades", icon: Bell },
  { label: "Tareas y agenda", href: "/tareas", icon: CalendarDays },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Leads", href: "/leads", icon: UserSearch },
  { label: "Biblioteca", href: "/documentos", icon: FileText },
  { label: "Honorarios", href: "/honorarios", icon: CircleDollarSign },
  { label: "Equipo", href: "/equipo", icon: Scale },
  { label: "Integraciones", href: "/integraciones", icon: Gavel },
  { label: "Auditoría", href: "/auditoria", icon: HeartPulse },
  { label: "Configuración", href: "/configuracion", icon: Settings },
];
navigation.push({
  label: "Alertas y recordatorios",
  href: "/alertas",
  icon: Bell,
});
const roles: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  LAWYER: "Abogado",
  ASSISTANT: "Asistente",
  READ_ONLY: "Sólo lectura",
};
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const [mobile, setMobile] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<
      { id: string; title: string; kind: string; url: string }[]
    >([]),
    [me, setMe] = useState<{
      actorName: string;
      tenantName: string;
      role: string;
    }>();
  useEffect(() => {
    void fetch("/api/me")
      .then((r) => r.json())
      .then((v) => v.data && setMe(v.data));
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((v) => setResults(v.data ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const [alertCount, setAlertCount] = useState(0);
  useEffect(() => {
    const update = () => {
      void fetch("/api/alerts?unread=true&limit=1")
        .then((r) => r.json())
        .then((v) => setAlertCount(v.meta?.total ?? v.pagination?.total ?? 0))
        .catch(() => {});
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, []);
  const initials = (me?.actorName ?? "Estudio")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div className="app-frame">
      {mobile ? (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setMobile(false)}
        />
      ) : null}
      <aside
        className={`sidebar ${mobile ? "sidebar-open" : ""}`}
        aria-label="Navegación principal"
      >
        <Link className="brand" href="/" aria-label="Monitor Legal — Inicio">
          <span className="brand-mark">
            <Scale size={20} strokeWidth={1.5} />
          </span>
          <span>
            <strong>Monitor</strong> Legal
          </span>
        </Link>
        <span className="studio-label">
          {me?.tenantName ?? "Tu estudio jurídico"}
        </span>
        <nav className="side-nav">
          {navigation.map((item) => (
            <Link
              className={
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href))
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              href={item.href}
              key={item.href}
              onClick={() => setMobile(false)}
            >
              <item.icon size={17} strokeWidth={1.6} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <Link className="sidebar-note" href="/seguridad">
          <ShieldCheck size={17} />
          <div>
            <strong>Espacio privado</strong>
            <span>Configurá tu segundo factor</span>
          </div>
        </Link>
        <div className="profile-compact">
          <span className="avatar">{initials}</span>
          <div>
            <strong>{me?.actorName ?? "Tu cuenta"}</strong>
            <span>{roles[me?.role ?? ""] ?? ""}</span>
          </div>
          <button
            aria-label="Cerrar sesión"
            className="logout-button"
            onClick={() =>
              void fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }).then(() => {
                router.push("/auth/sign-in");
                router.refresh();
              })
            }
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="content-column">
        <header className="topbar">
          <button
            className="mobile-menu"
            type="button"
            aria-label="Abrir navegación"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={16} />
            <span>Buscar en el estudio…</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <span className="topbar-date">
              {new Intl.DateTimeFormat("es-AR", {
                day: "numeric",
                month: "long",
                timeZone: "America/Argentina/Buenos_Aires",
              }).format(new Date())}
            </span>
            <Link
              className="icon-button"
              href="/alertas"
              aria-label={`Ver alertas: ${alertCount} pendientes`}
            >
              <Bell size={18} />
              {alertCount ? (
                <span className="alert-badge">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              ) : null}
            </Link>
            <Link
              href="/seguridad"
              className="top-avatar"
              aria-label="Seguridad de mi cuenta"
            >
              {initials}
            </Link>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation
          .slice(0, 3)
          .concat(navigation[7]!)
          .map((item) => (
            <Link
              className={
                pathname === item.href
                  ? "mobile-nav-item active"
                  : "mobile-nav-item"
              }
              href={item.href}
              key={item.href}
            >
              <item.icon size={20} />
              <span>{item.label.replace(" jurídico", "")}</span>
            </Link>
          ))}
      </nav>
      {searchOpen ? (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <section
            className="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Buscar en el estudio"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="search-input">
              <Search size={20} />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResults([]);
                }}
                placeholder="Carátula, cliente, documento o tarea…"
              />
              <button
                aria-label="Cerrar búsqueda"
                onClick={() => setSearchOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="search-results">
              {results.map((r) => (
                <Link
                  href={r.url}
                  key={`${r.kind}-${r.id}`}
                  onClick={() => setSearchOpen(false)}
                >
                  <span>{r.title}</span>
                  <small>{r.kind}</small>
                </Link>
              ))}
              {query && !results.length ? (
                <p>No encontramos resultados accesibles.</p>
              ) : !query ? (
                <p>Buscá en tus causas, clientes y documentos.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
