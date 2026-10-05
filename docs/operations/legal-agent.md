# Agente jurídico: implementación y operación

## Despliegue

- Aplicación: https://monitor-legal.vercel.app (Vercel, Next.js 16).
- Base: Neon `monitor-legal`, proyecto `round-bonus-36400761`, PostgreSQL 17.
- Inferencia y almacenamiento: Worker privado `monitor-legal-ai`, Workers AI y bucket R2 privado `monitor-legal-documents`.
- El archivo local `.private/acceso.html` contiene el enlace de configuración inicial. No versionarlo ni compartirlo públicamente. El propietario elige su contraseña. El registro público permanece cerrado.
- El entorno local actual puede usar la rama aislada `agent-validation`: sus cuentas y datos sintéticos **no pertenecen a producción**. El despliegue tiene credenciales de la rama principal.

## Funciones disponibles

Gestión persistente de causas, clientes, leads, agenda, tareas, plazos, documentos, honorarios, pagos y equipo. Asistente con conversaciones personales y contexto de causa, búsquedas documentales, citas que abren el original, herramientas de consulta, borradores y propuestas sujetas a aprobación. Invitaciones privadas de un solo uso. Inicio por usuario o correo, TOTP y códigos de recuperación. Preferencias explícitas del usuario, auditoría y métricas.

PDF con texto, DOCX, TXT, Markdown y CSV: extracción y fragmentación conservando páginas cuando el formato las proporciona. DOCX se cita como sección, sin atribuirle paginación física inexistente. PDF escaneado e imágenes: OCR ejecutado en el dispositivo del usuario con recursos locales, español e inglés. Se conserva el original y se registra que el texto fue reconocido. El abogado debe contrastar OCR con el original.

## Arquitectura y decisiones

Las investigaciones del usuario son referencias de diseño, no instrucciones operativas ni garantía de rendimiento. Se implementó la topología recomendada sin un servidor GPU permanente:

1. Better Auth obtiene la identidad con una conexión exclusiva para autenticación.
2. La aplicación usa `monitor_runtime`, sin privilegios de propietario ni BYPASSRLS. Cada transacción instala el actor autenticado mediante `set_config` local. El servidor rechaza una conexión de ejecución que evada RLS.
3. La pertenencia al estudio y la autorización de causa/documento se aplican en PostgreSQL antes de la recuperación léxica o vectorial. Reglas restrictivas alcanzan documentos, fragmentos, originales, conversaciones y registros vinculados.
4. BGE-M3 genera vectores de 1024 dimensiones. La búsqueda fusiona FTS español y pgvector con RRF; el reranker se usa cuando está disponible. Una falla auxiliar conserva búsqueda por texto y muestra el modo efectivo.
5. Qwen3 30B A3B responde mediante un gateway privado de Cloudflare. Los documentos se consideran datos no confiables. Las referencias inexistentes se rechazan; las consultas que requieren evidencia sin citas terminan en abstención. La clasificación de intención y la corrección jurídica de respuestas requieren evaluación continua.
6. Las herramientas tienen esquemas estrictos. El modelo no recibe SQL, claves de proveedor ni una herramienta para enviar mensajes. Tareas, borradores de comunicación y plazos POSIBLES se proponen; el abogado decide. La decisión y su efecto se ejecutan atómicamente y rechazan replays.
7. Los originales se cargan directamente en R2 con tickets HMAC de cinco minutos que fijan clave, origen, tamaño y tipo. No existe endpoint público de lectura. El finalize verifica SHA-256 y tamaño. Un ticket no puede sobrescribir un original.
8. El historial conserva las últimas seis intervenciones para inferencia y preferencias explícitas. Las conversaciones son personales. La revocación vuelve a verificar acceso en documentos y mensajes con citas.

## Límites y costo

- Archivo: 5 MB; PDF con texto: 200 páginas; OCR local: 30 páginas; texto extraído: 500.000 caracteres.
- Consulta: 4.000 caracteres, cinco pasos de agente, ocho herramientas, 800 tokens por generación, presupuesto agregado de 24.000 tokens de entrada y 3.200 de salida.
- Actor: cinco consultas por minuto y 100 por día; reservas serializadas en la base.
- Embeddings de fragmentos se reutilizan por checksum. Vectores de consulta se cachean por actor/estudio/modelo durante 24 horas. La autorización se ejecuta de nuevo en cada búsqueda. No se cachean respuestas ni texto recuperado.
- Groq sólo se habilita con clave y `GROQ_ZDR_CONFIRMED=true`; el adaptador local exige URL y clave. Estos proveedores alternativos no están configurados en este despliegue.
- No se garantiza costo cero: los planes, límites y consumo de Cloudflare, Neon y Vercel dependen de la cuenta. Revisar paneles de consumo antes de aumentar límites.

## Inicio del estudio

1. Abrir el enlace privado de configuración y crear el propietario `tobias`, con su correo y contraseña elegida personalmente.
2. Activar autenticador en Seguridad y guardar los códigos de recuperación.
3. Cargar clientes y causas reales. Desde Equipo, crear enlaces de invitación privados. Las asignaciones y responsables determinan qué causas puede consultar cada abogado.
4. Cargar documentos vinculados a la causa. Si figura “Necesita OCR”, ejecutar “Reconocer texto” y contrastar el original.
5. Preguntar al asistente, abrir las fuentes citadas y revisar borradores antes de utilizarlos.

## Monitoreo judicial y comunicaciones

El repositorio incluye el worker PJN y su integración con jobs y sincronizaciones. La ejecución real exige configurar los conectores, tenant y secretos del worker GitHub Actions (`DATABASE_URL`, `MONITOR_TENANT_ID`, identificadores de conector y credenciales de cada cuenta). Los disparos desde la web necesitan `GITHUB_DISPATCH_TOKEN` y `GITHUB_REPOSITORY`. No se cargaron credenciales judiciales ni SMTP en el despliegue nuevo. Tampoco se enviaron emails o comunicaciones de prueba a terceros. MEV/SCBA no cuentan con una implementación de navegación verificada en este cambio. La interfaz no presenta un conector inexistente como activo.

## Verificación

- Tests de TypeScript/API, lint y compilación de producción.
- 31 comprobaciones integrales con un estudio sintético en una rama Neon aislada: autenticación, registro cerrado, herramientas, límites de origen, roles, aislamiento entre estudios/causas, carga R2, sobrescritura denegada, indexación, búsqueda con citas, respuesta real de Cloudflare, revocación, aprobación sin duplicados y TOTP completo.
- Pruebas adicionales de invitación de un uso y permisos de sólo lectura.
- Interfaz comprobada en Chromium a 1440 y 390 px: sin excepciones de navegador ni desbordamiento horizontal. No reemplaza auditoría formal de accesibilidad.
- Los tests Python del monitor se ejecutan sin navegar el PJN real ni enviar correos.

Esta evidencia valida funcionamiento técnico con fixtures. No valida exactitud jurídica en casos reales, citas de normativa vigente, robustez ante toda inyección de instrucciones, disponibilidad contractual, auditoría externa ni cumplimiento legal certificado. Falta un conjunto de preguntas/documentos representativos revisado por abogados para medir precisión de recuperación, fidelidad de citas, abstención, latencia p95 y costos con carga real. No se hizo fine-tuning, despliegue de GPU local ni ingestión automática de legislación: son decisiones posteriores a esa evaluación.

## Operación

- `/api/health` comprueba conectividad de ejecución, rol que aplica RLS y tablas de la versión. No expone conexiones ni errores. La marca `ai` indica configuración, no disponibilidad instantánea del proveedor.
- Auditoría guarda actor, referencias, tiempos, proveedor/modelo y decisiones; no registrar prompts, contraseñas, tokens ni originales en logs de infraestructura.
- Si falla la inferencia, los datos, documentos y consultas con `/causas`, `/plazos`, `/tareas`, `/clientes` y `/buscar` siguen accesibles.
- Si una indexación queda en PROCESSING, su lease permite reintentar después de cinco minutos. La indexación es síncrona y tiene un límite de ejecución: dividir documentos grandes y reintentar desde la biblioteca; no existe aún una cola distribuida de OCR.
- Las eliminaciones de documentos son lógicas; el original permanece en R2. El estudio debe fijar una política de retención antes de incorporar documentación confidencial a gran escala.
- Antes de migraciones, crear una rama Neon. Aplicar SQL como propietario. La aplicación nunca usa esa cuenta para las operaciones de negocio. Validar restauración en una rama separada antes de sustituir producción.
- Restauración: recuperar la versión de aplicación en Vercel y una rama/restore de Neon compatible; R2 no se restaura con la rama Neon. Los originales son inmutables y su clave/hash deben conservarse. No se ejecutó un simulacro completo de restauración de R2 en esta entrega.
- Rotar secretos de Vercel y `SERVICE_KEY` del Worker de forma coordinada. El token inicial se puede retirar de Vercel cuando se configure el propietario.
- Nunca versionar `.env*`, `.private/`, originales, sesiones, credenciales o archivos temporales de pruebas.

## Recordatorios y alertas inteligentes

Cloudflare ejecuta una revisión cada cinco minutos, independiente del navegador. Una cuenta Postgres `monitor_scheduler` sólo puede ejecutar funciones de programación; no puede leer tablas de negocio directamente. El endpoint exige un secreto distinto al del servicio de IA.

- Recordatorios personales o vinculados a una causa: únicos, diarios o semanales; creación manual o propuesta del asistente para aprobación.
- Reglas explicables para vencimientos registrados (siete días, un día, dos horas y fecha superada), tareas atrasadas, actividades de agenda, movimientos importantes sin revisar, próximos contactos vencidos, consultas que requieren seguimiento, conexiones degradadas y documentos que necesitan OCR/revisión.
- Configuración personal de categorías y horas de silencio; posposición de una hora y estado visto/pendiente.
- Las claves de evento evitan duplicaciones. La recurrencia avanza a una fecha futura, sin inundar al usuario con todas las ocurrencias perdidas.
- El centro de alertas verifica acceso a las fuentes en cada lectura. Revocar una causa bloquea también sus alertas y recordatorios.
- Web Push se activa voluntariamente por dispositivo. Incluye claves VAPID, suscripciones privadas, entrega cifrada, reintentos acotados y eliminación de endpoints vencidos. El aviso del sistema no muestra datos del expediente: invita a abrir el dashboard protegido. Se puede desactivar desde Alertas.
- La entrega push depende del permiso, del navegador/dispositivo y de su proveedor de notificaciones. Las pruebas automáticas cubren programación, persistencia y seguridad; la recepción real en el dispositivo del propietario debe comprobarse tras activar el permiso. No se configuraron avisos por WhatsApp, Telegram, SMS ni email en esta entrega.

Referencias de implementación: [Cron Triggers de Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/) y [web-push](https://github.com/web-push-libs/web-push). Las reglas alertan sobre fechas registradas, sin inferir ni confirmar plazos jurídicos automáticamente.

Verificación adicional de la ampliación: 27 comprobaciones de recordatorios/alertas, tres de revocación de alertas por causa, tres de configuración inicial en una segunda rama aislada y extracción real de fixtures PDF/DOCX. El request de Web Push se verificó con cifrado y firma VAPID, sin enviar notificaciones a terceros. El smoke de producción devolvió readiness 200, APIs privadas 401 y ejecución autenticada del programador 200. Los fixtures permanecieron fuera de la base principal.
