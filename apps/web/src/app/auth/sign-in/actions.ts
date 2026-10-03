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
  if (!email || !password) {
    return { error: "Ingresá tu usuario o email y tu contraseña." };
  }

  try {
    const requestHeaders = await headers();
    if (email.includes("@")) {
      await auth.api.signInEmail({
        body: { email, password },
        headers: requestHeaders,
      });
    } else {
      await auth.api.signInUsername({
        body: { username: email, password },
        headers: requestHeaders,
      });
    }
  } catch {
    return { error: "No pudimos iniciar sesión. Revisá tus datos e intentá nuevamente." };
  }

  redirect("/");
}
