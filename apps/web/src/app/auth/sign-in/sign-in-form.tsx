"use client";

import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useActionState } from "react";

import { signIn, type AuthActionState } from "@/app/auth/sign-in/actions";

const initialState: AuthActionState = {};

export function SignInForm({ demoMode }: { demoMode: boolean }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="auth-form">
      <label>
        <span>Email</span>
        <div className="field-with-icon">
          <Mail size={17} />
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nombre@estudio.com"
            required
            disabled={demoMode}
          />
        </div>
      </label>
      <label>
        <span>Contraseña</span>
        <div className="field-with-icon">
          <LockKeyhole size={17} />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            minLength={12}
            required
            disabled={demoMode}
          />
        </div>
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}>
        {demoMode ? "Entrar al modo demo" : pending ? "Ingresando…" : "Ingresar"}
        <ArrowRight size={17} />
      </button>
      {demoMode ? (
        <p className="demo-hint">
          Neon Auth todavía no está configurado. El botón abre datos totalmente ficticios.
        </p>
      ) : null}
    </form>
  );
}
