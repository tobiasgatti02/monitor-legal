import { Scale } from "lucide-react";
import { SetupForm } from "@/components/setup-form";
export default function SetupPage(){return <main className="auth-page"><section className="auth-card"><span className="brand"><Scale size={22}/><strong>Monitor Legal</strong></span><div className="auth-heading"><h1>Tu estudio, listo para empezar.</h1><p>Configurá tu cuenta privada. Las causas y documentos se cargarán con tus datos reales.</p></div><SetupForm/></section></main>;}
