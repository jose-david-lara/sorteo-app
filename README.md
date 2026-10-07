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

```bash
docker compose up -d --build
# http://<servidor>:8080   healthcheck: http://<servidor>:8080/healthz
```

La guía completa para infraestructura (requisitos, servidor sin internet, proxy,
HTTPS, verificación, actualización, rollback y solución de problemas) está en
[DEPLOY.md](DEPLOY.md).

## Desarrollo

```bash
npm ci
npm run dev     # http://localhost:5173
npm test
npm run build   # genera dist/
```
