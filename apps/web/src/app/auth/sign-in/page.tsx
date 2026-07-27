import { Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SignInForm } from "@/app/auth/sign-in/sign-in-form";
import { authConfigured } from "@/lib/auth/server";

export const metadata = {
  title: "Ingresar",
};

export default function SignInPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/">
          <span className="brand-mark">
            <Scale size={18} strokeWidth={1.8} />
          </span>
          <span>
            <strong>Monitor</strong> Legal
          </span>
        </Link>
        <div className="auth-heading">
          <span className="auth-icon">
            <ShieldCheck size={21} />
          </span>
          <h1>Ingresá a tu estudio</h1>
          <p>Tu agenda, causas y novedades judiciales en un mismo lugar.</p>
        </div>
        <SignInForm demoMode={!authConfigured} />
        <p className="auth-footer">Identidad protegida por Better Auth sobre Neon.</p>
      </section>
    </main>
  );
}
