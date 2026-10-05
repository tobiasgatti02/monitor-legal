# Datos necesarios para activar el agente

Completar con el abogado responsable. No pegar contraseñas, tokens, datos de salud ni expedientes reales en este archivo. Guardar modelos y casos de evaluación en un repositorio privado o carpeta controlada e indicar su ruta.

## Entorno y accesos

- Proyecto y rama Neon de producción: confirmar que corresponden a `monitor-legal`; facilitar acceso de gestión para crear una rama de prueba, o crearla y compartir su identificador por un canal seguro.
- Cuenta de Cloudflare Workers AI/R2 y despliegue Vercel: indicar quién administra cada servicio y un entorno de prueba separado. Entregar secretos sólo mediante el gestor de secretos del servicio.
- Cuota diaria compartida de Workers AI y límite de gasto aceptable para el piloto: ___.

## MEV y Notificaciones SCBA

Son sistemas distintos. Para cada uno indicar: titular autorizado de la cuenta, alcance de causas permitido, mecanismo oficial disponible (API, exportación, avisos por correo o consulta web), documentación técnica o de uso, y una causa de prueba autorizada sin datos sensibles. Iniciar sesión personalmente en el navegador cuando haga falta; no compartir usuario, clave, certificado ni segundo factor. Si el sitio requiere captcha o una interacción personal, la automatización se detiene ahí. La importación manual ya permite trabajar sin conector.

## Investigación oficial

- Fuentes oficiales prioritarias, por jurisdicción y fuero: ___.
- Para cada fuente: URL/identificador de un resultado de ejemplo, si ofrece sumario o texto completo, y permiso de consulta automatizada o alternativa de exportación: ___.
- Abogado que revisará vigencia, pertinencia y precedentes adversos: ___.

## Voz y comunicaciones

- Uso deseado: dictado privado, notas de cliente, audiencias u otro: ___.
- Canal autorizado y proveedor de transcripción, si existe: ___.
- Política aprobada de consentimiento, conservación/borrado del audio y acceso: ___.
- Destino simulado para pruebas; ningún envío real a clientes: ___.

## Plantillas del estudio

Por cada modelo, entregar un archivo DOCX o texto editable, preferentemente anonimizado, con:

1. Especialidad, jurisdicción, fuero, tribunal y finalidad (por ejemplo, accidente de trabajo — entrevista/reclamo — Provincia de Buenos Aires).
2. Título, versión y fecha de aprobación por el abogado.
3. Secciones obligatorias, variables que debe completar el usuario y fuentes exigidas para cada afirmación relevante.
4. Fragmentos que se pueden reutilizar y fragmentos que deben verificarse siempre por vigencia.
5. Un ejemplo de salida aceptable y otro que deba rechazarse, ambos anonimizados.

No convertir un modelo aportado en plantilla aprobada sin revisión explícita del abogado.

## Reglas de cálculo

Por cada cálculo jurídico solicitado, el abogado debe indicar jurisdicción/fuero, tipo de pretensión, fuente oficial y versión de cada fórmula/índice, fechas relevantes, base de cálculo, redondeo, exclusiones y al menos tres casos con entradas y resultados esperados revisados. Indicar qué fecha proviene de una notificación formal y cuáles son sólo movimientos o datos relatados. Sin estas reglas, mantener únicamente escenarios aritméticos generales.

## Evaluación antes de producción

- Responsable de la revisión jurídica: ___.
- Casos anonimizados reservados para prueba, con resultado esperado y fuentes originales: ___.
- Criterio de aceptación (hechos/citas, faltantes, tiempo de revisión y errores inadmisibles): ___.
- Plan de reversión y ventana de despliegue: ___.
