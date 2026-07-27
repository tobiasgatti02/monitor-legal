import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Gavel,
  HeartPulse,
  LayoutDashboard,
  Menu,
  Scale,
  Search,
  Settings,
  Sparkles,
  Users,
  UserSearch,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { label: "Hoy", href: "/", icon: LayoutDashboard },
  { label: "Causas", href: "/causas", icon: BriefcaseBusiness },
  { label: "Novedades", href: "/novedades", icon: Bell, badge: "5" },
  { label: "Tareas y agenda", href: "/tareas", icon: CalendarDays },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Leads", href: "/leads", icon: UserSearch },
  { label: "Documentos", href: "/documentos", icon: FileText },
  { label: "Honorarios", href: "/honorarios", icon: CircleDollarSign },
  { label: "Equipo", href: "/equipo", icon: Scale },
  { label: "Integraciones", href: "/integraciones", icon: Gavel },
  { label: "Auditoría y salud", href: "/auditoria", icon: HeartPulse },
  { label: "Configuración", href: "/configuracion", icon: Settings },
] as const;

const mobileNavigation = navigation.slice(0, 5);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Navegación principal">
        <Link className="brand" href="/" aria-label="Monitor Legal — Inicio">
          <span className="brand-mark">
            <Scale size={18} strokeWidth={1.8} />
          </span>
          <span>
            <strong>Monitor</strong> Legal
          </span>
        </Link>

        <nav className="side-nav">
          {navigation.map((item) => (
            <Link
              className={
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              href={item.href}
              key={item.href}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
              {"badge" in item ? <span className="nav-badge">{item.badge}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="sidebar-note">
          <Sparkles size={16} />
          <div>
            <strong>Modo base gratuito</strong>
            <span>Reglas locales · sin IA paga</span>
          </div>
        </div>

        <div className="profile-compact">
          <span className="avatar">AG</span>
          <div>
            <strong>Agustín Gatti</strong>
            <span>Propietario</span>
          </div>
          <Menu size={18} />
        </div>
      </aside>

      <div className="content-column">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Abrir navegación">
            <Menu size={20} />
          </button>
          <button className="search-trigger" type="button">
            <Search size={17} />
            <span>Buscar causas, clientes o tareas…</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <Link className="icon-button" href="/novedades" aria-label="Ver alertas">
              <Bell size={19} />
              <span className="notification-dot" />
            </Link>
            <span className="top-avatar">AG</span>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {mobileNavigation.map((item) => (
          <Link
            className={
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                ? "mobile-nav-item active"
                : "mobile-nav-item"
            }
            href={item.href}
            key={item.href}
          >
            <item.icon size={20} />
            <span>{item.label.replace(" y agenda", "")}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
"use client";
