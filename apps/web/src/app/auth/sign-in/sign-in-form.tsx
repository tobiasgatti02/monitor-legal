"use client";
import { ArrowRight,KeyRound,LockKeyhole,Mail } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function SignInForm({demoMode}:{demoMode:boolean}){
 const [error,setError]=useState(""),[pending,setPending]=useState(false),[second,setSecond]=useState(false);const router=useRouter();
 async function submit(form:FormData){setPending(true);setError("");try{
 const identifier=String(form.get("email")??"").trim();
 const isEmail=identifier.includes("@");
 const path=second?"/api/auth/two-factor/verify-totp":isEmail?"/api/auth/sign-in/email":"/api/auth/sign-in/username";
 const body=second?{code:form.get("code"),trustDevice:false}:{[isEmail?"email":"username"]:identifier,password:form.get("password")};
 const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw new Error(second?"El código no es válido. Verificá el autenticador.":"No pudimos iniciar sesión. Revisá tus datos.");
 if(v.twoFactorRedirect){setSecond(true);return;}router.push("/");router.refresh();
 }catch(e){setError((e as Error).message);}finally{setPending(false);}}
 return <form action={submit} className="auth-form">{second?<label><span>Código de tu autenticador</span><div className="field-with-icon"><KeyRound size={17}/><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus/></div></label>:<><label><span>Usuario o email</span><div className="field-with-icon"><Mail size={17}/><input type="text" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Usuario o nombre@estudio.com" required disabled={demoMode}/></div></label><label><span>Contraseña</span><div className="field-with-icon"><LockKeyhole size={17}/><input type="password" name="password" autoComplete="current-password" placeholder="••••••••••••" required disabled={demoMode}/></div></label></>}{error?<p className="form-error" role="alert">{error}</p>:null}<button className="button button-primary auth-submit" type="submit" disabled={pending||demoMode}>{pending?"Verificando…":second?"Verificar segundo factor":"Ingresar"}<ArrowRight size={17}/></button>{demoMode?<p className="demo-hint">La configuración del estudio todavía no está completa. Usá tu enlace privado de activación.</p>:null}</form>;
}
