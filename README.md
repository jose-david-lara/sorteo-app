# Sorteo de Árbitros - CAMP

Aplicación web para sortear árbitros del Centro de Arbitraje y Mediación Paraguay.
Se usa una vez por mes. Es 100% estática: el Excel se procesa en el navegador y
**ningún dato se envía al servidor**.

## Cómo se usa

1. **Cargar el Excel** (.xlsx/.xls, máx. 5 MB). Se lee la primera hoja; la columna
   se detecta por un encabezado que contenga "Nombre", "Árbitro" o "Participante".
   Se ignoran filas vacías y se avisa de nombres repetidos (sin distinguir tildes
   ni mayúsculas).
2. **Excluir** a quien corresponda (conflictos de interés, licencias, etc.).
3. **Confirmar lista**. A partir de aquí la lista queda bloqueada.
4. **Iniciar sorteo** tantas veces como árbitros se necesiten. Un árbitro sorteado
   no vuelve a salir.
5. **Exportar Acta (Excel)** y **Acta de verificación (JSON)** para archivo.

Si se recarga la página, la sesión se conserva. "Limpiar todo" la borra.

## Algoritmo

- Semilla de 256 bits generada con `crypto.getRandomValues` (CSPRNG) **después**
  de confirmar la lista, para que nadie pueda ajustar la lista conociéndola.
- En el acta queda `SHA-256(semilla)` (compromiso) junto con la semilla.
- Cada sorteo usa `HMAC-SHA256(semilla, "n:huella_de_elegibles:intento")` con
  muestreo por rechazo: todos los elegibles tienen exactamente la misma probabilidad.
- El resultado se calcula antes de la animación; la animación es solo visual.
- Es determinístico: recargar la página no permite "volver a tirar".

### Verificar un acta

Cualquier persona con el JSON puede recalcular todos los resultados:

```bash
npm ci
npm run verificar -- acta_sorteo_2026-10-06.json
```

El script comprueba que la semilla corresponde al compromiso, que la lista
(incluidos los excluidos) no fue alterada y que cada árbitro sorteado es el que
corresponde.

## Despliegue (infraestructura)

Requisitos: Docker. El build no necesita acceso a `cdn.sheetjs.com`: el paquete
de SheetJS está en `vendor/` (SheetJS ya no publica versiones seguras en npm).
Sí necesita acceso al registro de npm y a Docker Hub.

```bash
docker compose up -d --build      # o docker-compose
# http://<servidor>:8080   healthcheck: http://<servidor>:8080/healthz
```

Sin compose:

```bash
docker build -t camp/sorteo-arbitros:2.0.0 .
docker run -d --name sorteo-arbitros -p 8080:8080 \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  --restart unless-stopped camp/sorteo-arbitros:2.0.0
```

Características de la imagen:

- Build multi-etapa: los tests corren durante el build; si fallan, no hay imagen.
- Runtime `nginx-unprivileged` (usuario no root), puerto 8080, sistema de archivos
  de solo lectura, sin capabilities.
- Cabeceras de seguridad: CSP estricta (sin scripts externos ni inline),
  `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Solo acepta `GET`/`HEAD`; no expone la versión de nginx.

Recomendaciones para infra:

- Publicarla solo en la intranet y, si es posible, detrás del proxy con HTTPS.
- Si se quiere limitar quién la usa, agregar autenticación en el proxy inverso
  (la app no maneja usuarios).

## Desarrollo

```bash
npm ci
npm run dev     # http://localhost:5173
npm test
npm run build   # genera dist/
```
