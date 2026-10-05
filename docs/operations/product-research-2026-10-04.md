# Agente personal para un estudio jurídico bonaerense

Investigación: 4 de octubre de 2026. Especialidades informadas: accidentes de trabajo, laboral, amparos de salud y sucesiones. Documento de propuesta; estas ampliaciones no se implementaron en esta investigación.

## Objetivo

Reducir el trabajo de reunir información, revisar novedades, pedir documentación, preparar borradores y mantener informado al cliente. La diferenciación debe medirse por tareas completas con menos esfuerzo y revisión, no por prometer superioridad general de un modelo.

Un chat personalizado y acceso web son fáciles de replicar. Una carpeta viva por causa, conectores locales, procedimientos aprobados por el abogado, evidencia verificable y seguimiento de acciones son una ventaja más duradera. Ningún producto puede garantizar que nunca será reemplazado. Los datos deben poder exportarse; la permanencia debe venir de su utilidad.

## Referencias internacionales

Se buscaron fuentes en español, inglés, portugués, francés y alemán. Se consultaron páginas oficiales de producto y ayuda. Las funciones son las descritas por los proveedores; no se realizaron pruebas de estos productos ni se validaron sus porcentajes de ahorro o exactitud. Países indican origen o mercado de referencia; no implican que el producto cubra el derecho bonaerense.

| Producto | País o mercado de referencia | Función documentada | Inspiración para el dashboard |
| --- | --- | --- | --- |
| [Harvey Agent Builder](https://www.harvey.ai/blog/introducing-workflow-builder) | Estados Unidos / internacional | Flujos reutilizables con precedentes, lógica y estándares del estudio; versionado y permisos. | Procedimientos por especialidad, con entradas requeridas y revisión antes de avanzar. |
| [Legora Workflows](https://legora.com/product/workflows) | Suecia / internacional | Combina investigación, extracción, revisión, redacción y cronologías. | Botones que resuelvan una tarea completa, como preparar una audiencia. |
| [CoCounsel](https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-reimagined-fewer-steps-bigger-outcomes/) | Canadá / Estados Unidos | Investigación y redacción apoyadas en Westlaw, Practical Law y conocimiento interno. | Separar fuentes del expediente y autoridades jurídicas; mantener trazabilidad. |
| [Clio Manage AI](https://help.clio.com/hc/en-us/articles/41990965598491-AI-Features-in-Clio-Manage) | Canadá | Prioridades personales, resúmenes actualizados de causas, propuestas de acciones y facturación. | Parte diario, próxima acción y revisión de propuestas desde la causa. |
| [Smokeball Archie](https://support.smokeball.com/hc/en-au/articles/24407844681751-Getting-Started-with-Archie-the-Smokeball-AI-Assistant) | Australia | Usa datos, documentos, correos, tareas y notas de la causa; permite guardar resultados y abrirlos en Word. | Memoria de causa y documentos editables que permanezcan vinculados al expediente. |
| [Jusbrasil Jus IA](https://suporte.jusbrasil.com.br/hc/pt-br/articles/35773556764820-O-que-%C3%A9-o-Jus-IA) | Brasil | Contexto por caso, documentos y audio, investigación y validación de referencias. | Captura de audios/notas y comprobación de citas antes de exportar escritos. |
| [Lemontech LIA](https://www.lemontech.com/ia-para-abogados) y [CaseTracking](https://www.lemontech.com/mx/soluciones/casetracking-firms) | Chile y mercados como México y Perú | Gestión judicial integrada, generadores de hechos/prueba, reportes y registro de horas. | Combinar movimientos judiciales, matriz probatoria y gestión del estudio. |
| [Noxtua](https://www.noxtua.com/de/product/legal-research) | Alemania y otras jurisdicciones europeas | Investigación con contenidos jurídicos curados y referencias que abren extractos y originales. | Mostrar fragmento, tribunal, fecha y texto completo para cada autoridad. |
| [GenIA-L Avocat](https://boutique.lefebvre-dalloz.fr/genial-avocat.html) | Francia | Asistente basado en los fondos jurídicos de Lefebvre Dalloz. | Una base jurídica seleccionada aporta más que búsquedas web indiscriminadas. |
| [Supio](https://www.supio.com/products/medical-chronologies) y [EvenUp](https://www.evenuplaw.com/products/express-demands/) | Estados Unidos | Cronologías médicas con fuentes, organización de pruebas y armado de reclamos. | Carpeta documental y cronología médica para accidentes de trabajo y salud, adaptadas por el abogado al contexto local. |

## Situación del repositorio

La aplicación ya tiene causas, clientes, tareas, plazos, documentos con OCR, búsqueda híbrida, citas, propuestas con aprobación, preferencias explícitas, auditoría y alertas programadas. El modelo predeterminado es Qwen3 30B A3B por Cloudflare Workers AI.

Las siguientes limitaciones son relevantes para el producto:

- El agente no dispone de búsqueda web ni lectura de páginas externas.
- La documentación de operación dice que MEV/SCBA no cuenta todavía con navegación verificada. El worker PJN existente no resuelve esa integración.
- El contexto de inferencia recibe seis intervenciones recientes; las preferencias no equivalen a una memoria estructurada del expediente.
- La búsqueda devuelve hasta ocho fragmentos. Eso sirve para consultas puntuales, pero no demuestra lectura exhaustiva de todos los documentos de una causa.
- Cada generación está limitada a 800 tokens; los escritos largos necesitan un flujo propio.
- La validación de citas comprueba que el identificador existe entre las fuentes recuperadas. No demuestra que cada afirmación esté respaldada por el pasaje citado.

Referencias locales: `apps/web/src/lib/agent/{service,gateway,retrieval,core,tools}.ts` y `docs/operations/legal-agent.md`. No se verificó el estado de producción mediante una sesión autenticada.

## Funciones prioritarias

### 1. Carpeta viva y recepción documental

Cada causa tiene tipo, etapa, actores, hechos confirmados, hechos relatados, documentos, cronología, decisiones del abogado y pendientes. Cada dato extraído conserva documento, página o sección, fecha y estado de revisión. Si llega un documento nuevo, se muestra qué cambió y qué quedó desactualizado.

Flujo de carga: proponer tipo de documento y causa, detectar duplicados, extraer datos y ofrecer cambios para revisión. No sobrescribir silenciosamente datos confirmados. Pedir una aclaración si dos causas o personas coinciden.

### 2. Parte diario y próxima acción

Con los datos actuales, reunir tareas, plazos registrados, agenda, documentación pendiente y novedades no revisadas. Cada prioridad debe indicar su motivo, origen y actualización. Distinguir un plazo confirmado, una fecha documental y una sugerencia de trabajo.

El tablero debe explicar causas sin avance y dependencias: quién debe aportar qué, desde cuándo y qué trabajo bloquea. Las reglas explícitas pueden ordenar los casos; la IA puede redactar la explicación.

### 3. Movimientos y notificaciones en Provincia de Buenos Aires

La [MEV oficial](https://mev.scba.gov.ar/loguin.asp) permite consultar causas y recibir actualizaciones; algunos expedientes requieren autorización. La propia página describe su información como referencial. El [portal de Presentaciones y Notificaciones](https://scba.gov.ar/servicios/notiypresen.asp) es un sistema distinto para interactuar con el expediente electrónico.

Construir y verificar primero una vía autorizada de importación o consulta. Conservar procedencia y última sincronización, detectar duplicados y avisar de fallas. Mientras no exista un conector comprobado, admitir carga manual de documentos o avisos.

Al ingresar una novedad: asociarla a la causa, resumirla con fuente, extraer fechas candidatas, proponer una tarea y preparar una actualización al cliente. La detección de un movimiento en MEV no debe tratarse automáticamente como notificación formal ni como inicio de un plazo.

Provincia de residencia no determina por sí sola la jurisdicción de toda causa. Registrar fuero, tribunal y jurisdicción por expediente, especialmente antes de investigar o aplicar reglas en salud.

### 4. Accidentes de trabajo

Ordenar relato del accidente, documentos de ART, antecedentes aportados, atención médica, estudios, alta y dictámenes en una cronología verificable. Crear una matriz de hecho, prueba y documento pendiente. Comparar nombres, fechas y datos expresados en documentos y señalar discrepancias como asuntos a revisar.

Salida: resumen de caso, cronología, índice de prueba y lista de pedidos documentales. Preparar borradores a partir de modelos aprobados del estudio. No inventar diagnóstico, causalidad o porcentaje de incapacidad.

### 5. Laboral

Estructurar datos de la relación laboral, recibos, telegramas/cartas documento, comunicaciones y fechas. Identificar qué información proviene del cliente y qué tiene respaldo documental. Ofrecer cronología, preparación de entrevista y matriz probatoria.

Las liquidaciones deben usar un motor de cálculo reproducible, con supuestos y reglas versionadas revisadas por el abogado. La IA puede recopilar datos y explicar el resultado; no debe inventar fórmulas, índices ni normativa.

### 6. Amparos de salud

Reunir afiliación, prescripciones, informes médicos, pedidos, respuestas y constancias aportadas en una carpeta. Usar listas de documentación configuradas por el abogado según caso y jurisdicción. Señalar vencimiento de órdenes o fechas documentales para revisión, sin confundirlas con plazos procesales.

Salida: relato documentado, índice de anexos y borrador según modelo del estudio. Tras una medida judicial, registrar obligaciones revisadas, seguimiento de cumplimiento e información pendiente. No inferir urgencia clínica ni afirmar incumplimiento sin respaldo.

### 7. Sucesiones

Mantener mapa de personas y vínculos documentados, documentación pendiente por persona, inventario de bienes informado y verificaciones faltantes. Registrar cada etapa, sus dependencias y el responsable de obtener documentos.

Salida: estado de causa, solicitudes de documentación, índices y borradores rutinarios basados en plantillas revisadas. No asignar automáticamente calidad de heredero ni cuotas por parentesco inferido.

### 8. Comunicación y captura rápida

Al aprobar una novedad o cerrar una tarea, preparar un mensaje al cliente con explicación clara, próximo paso y documentación requerida. Guardar borrador, aprobación y envío confirmado. Integrar un canal de comunicación después; hoy el agente no tiene una herramienta de envío.

Permitir dictado de notas: transcribir, proponer la causa, extraer hechos relatados y tareas, y mostrar una vista para confirmar. No convertir un audio del cliente en un hecho probado ni copiar datos privados de una causa a otra.

### 9. Escritos y conocimiento propio

Importar modelos aprobados del abogado, clasificar por especialidad y finalidad, registrar versión y jurisdicción. Generar primero estructura, después secciones, y finalmente revisión de coherencia y citas. Entregar DOCX editable y versión ligada a la causa.

Las correcciones aceptadas pueden proponer mejoras a una plantilla o criterio del estudio. Diferenciar estilo de redacción, una decisión aplicable a una causa y una regla reutilizable; el abogado confirma su alcance.

### 10. Investigación local verificable

Empezar por fuentes oficiales y contenido cuyo acceso esté autorizado. [JUBA](https://www.scba.gov.ar/paginas.asp?id=46951) ofrece sentencias y sumarios bonaerenses. Guardar tribunal, fecha, identificador, URL, pasaje y fecha de consulta; distinguir sumario de sentencia completa.

Investigar autoridades favorables y adversas, separar jurisdicciones y explicar similitudes y diferencias fácticas. Si no se consiguió el texto completo o no se comprobó vigencia, indicarlo. Las bibliotecas comerciales pueden exigir acuerdos o licencias; una búsqueda web no equivale a acceso a su contenido.

## Secuencia propuesta

1. Observar casos reales con el abogado y definir listas de documentación por especialidad. No asumir que todos siguen el mismo procedimiento.
2. Carpeta viva, extracción con revisión, parte diario y próximos pasos. Funciona aun sin conector judicial.
3. Un flujo completo de accidentes de trabajo y otro de amparos de salud; cronologías, pendientes, índice y borradores editables.
4. Verificar una integración bonaerense y sumar novedades a esos mismos flujos.
5. Modelos del estudio, revisión de afirmaciones/citas, investigación JUBA y seguimiento de clientes.
6. Ampliar laboral y sucesiones, cálculos reproducibles y gestión de honorarios según uso real.

La evaluación de modelos y el presupuesto para documentos grandes acompañan la secuencia. Conservar intercambiable al proveedor de IA; el conocimiento, los procesos y los registros pertenecen al estudio.

## Cómo evaluar que aporta más que un chat general

Comparar tres modos con casos consentidos o anonimizados y el mismo resultado esperado:

1. Trabajo actual del abogado.
2. Chat general con los mismos documentos y consignas, incluyendo una comparación fuerte con contexto persistente cuando esté disponible.
3. Dashboard integrado.

Medir tiempo total incluyendo carga, correcciones y revisión; hechos sin sustento; documentación esperada que no detectó; fidelidad de citas; tareas completadas y costo. Evaluar calidad de redacción con modelos candidatos usando los mismos materiales, por separado de la ventaja operacional.

Incluir casos con documentos contradictorios, un dato faltante y fuentes jurídicas adversas. Exigir que el sistema muestre faltantes y abstenga conclusiones sin sustento. La aprobación del abogado y la apertura del original forman parte del flujo, no se cuentan como ahorro si siguen tomando el mismo esfuerzo.

No prometer ahorro porcentual, exactitud jurídica superior ni resultados judiciales antes de medirlos. No iniciar por predicciones de éxito, presentación automática de escritos o cálculo libre de plazos con el modelo.
