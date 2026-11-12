# Actualización mensual de Mercadeo en Vercel

La tarea `/api/cron/marketing` se programa en `vercel.json` para el día 1 de cada mes a las 13:00 UTC (8:00 de Colombia; Vercel Hobby puede ejecutarla dentro de esa hora). No depende de Codex ni de un computador encendido.

## Conexión inicial obligatoria

Sin estas dos variables de **Production** y una ejecución completa verificada, la automatización está pendiente y así lo indica Mercadeo:

1. `CRON_SECRET`: clave aleatoria de 32 bytes o más, en formato hexadecimal. Vercel la envía automáticamente en el encabezado Authorization de la tarea. No la pegues en el chat, código ni enlaces.
2. `MARKETING_GOOGLE_SERVICE_ACCOUNT_JSON`: credencial JSON de una cuenta de servicio dedicada, guardada como secreto de Vercel. Habilita Google Drive API en su proyecto de Google Cloud. No necesita delegación de dominio ni roles administrativos.
3. Comparte **solo como lector**, con el `client_email` de esa cuenta de servicio, estos tres archivos:
   - Monthly: `18PIYecGjCDSN4aUYgP8vyrPPg0c877FNeEakqKlH2OU`.
   - Modelo contable: `1AOLNHHLWNzdz8LW-zC62sqqLnw5U2QC_`.
   - Costos OC32: `198Op2VTqh8tjTxBlQ0Q39SR6VYeEyRhF`.
4. Vuelve a desplegar producción para cargar las variables. En Mercadeo, pulsa **Probar actualización**. Deben figurar actualizados Shopify, Siigo, Drive, Meta y tráfico Shopify, y una fecha de última actualización completa.
5. En Vercel → Schedules/Cron Jobs confirma la tarea habilitada y una invocación autenticada con respuesta 200. La prueba desde Mercadeo valida las fuentes; el registro de la tarea valida el disparo del programador.

El acceso de Google Drive conectado a Codex no se transfiere a Vercel. La cuenta dedicada solo puede leer los archivos que se compartan con ella. Los archivos originales no se modifican ni se vuelven públicos.

## Qué se actualiza

- Shopify y Siigo: cachés de los últimos 45 días mediante las sincronizaciones existentes, conservando clasificación y conciliación. Los importes no se publican como conciliados automáticamente.
- Meta y tráfico Shopify: verifica las consultas del mes cerrado. Al visualizar el reporte, los filtros siguen consultando esos proveedores directamente.
- Monthly: costos explícitos hasta el último mes cerrado. Una celda vacía no es cero.
- ER 2025, ER 2026 y años posteriores: contenido digital, plataforma y hosting identificados por concepto y encabezados de fecha. No se importan hojas de presupuesto o proyección. Los COGS históricos revisados se conservan; desde septiembre de 2026 se utiliza OC32 por diseño.
- OC32: costos estimados por diseño y categoría, vigentes desde el 1 de septiembre de 2026 por autorización de Natalia. Los errores y diseños sin costo siguen pendientes.

Las fuentes se descargan desde Drive en cada ejecución, se validan y se guardan juntas en `marketing_settings.objectives` con claves internas `_cloud*`. No requieren un commit ni nuevo despliegue mensual. Las ediciones manuales de costos tienen prioridad. Se preservan los últimos campos válidos si la fuente omite un valor. Un cambio de estructura o fallo de acceso conserva el snapshot anterior y registra error visible.

Una reserva de ejecución y escrituras CAS evitan correr dos tareas simultáneas o borrar metas/costos editados durante la actualización. No se guardan credenciales de Google en esa tabla; únicamente en las variables de entorno de Vercel.

Para desactivar la tarea, retira su entrada de `vercel.json` y despliega, o desactívala en Vercel. La programación local de Codex quedó pausada al migrar.

Referencias: https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs y https://developers.google.com/identity/protocols/oauth2/service-account.
