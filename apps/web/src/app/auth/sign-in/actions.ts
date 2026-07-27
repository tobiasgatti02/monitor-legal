"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, authConfigured } from "@/lib/auth/server";

export type AuthActionState = {
  error?: string;
};

export async function signIn(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!authConfigured) redirect("/");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 12) {
    return { error: "Ingresá un email válido y una contraseña de al menos 12 caracteres." };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    return { error: "No pudimos iniciar sesión. Revisá tus datos e intentá nuevamente." };
  }

  redirect("/");
}
