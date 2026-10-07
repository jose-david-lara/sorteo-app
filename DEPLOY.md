# Guía de despliegue — Sorteo de Árbitros CAMP

Guía para el equipo de infraestructura. Tiempo estimado: 10 minutos.

## 1. Qué se despliega

| Aspecto | Detalle |
|---|---|
| Tipo | Sitio web estático (HTML/JS/CSS) servido por nginx |
| Imagen | `camp/sorteo-arbitros:2.0.0` (base `nginxinc/nginx-unprivileged:1.29-alpine`) |
| Puerto del contenedor | `8080` (HTTP) |
| Base de datos | No tiene |
| Volúmenes | No necesita: no guarda nada en el servidor |
| Variables de entorno / secretos | Ninguno |
| Recursos | 128 MB de RAM, 0,5 CPU (límites en `docker-compose.yml`) |
| Healthcheck | `GET /healthz` → `200 ok` |
| Uso | Una vez por mes, pocos usuarios internos |

Todo el procesamiento ocurre en el navegador del usuario: el Excel con la lista
de árbitros **no se sube al servidor** y el servidor rechaza cualquier método
que no sea `GET`/`HEAD`.

## 2. Requisitos

- Docker Engine 20.10 o superior con el plugin **Compose v2** (`docker compose`).
  El antiguo `docker-compose` 1.x no está soportado.
- Para construir la imagen: salida a internet hacia **Docker Hub** y
  **registry.npmjs.org**. Si el servidor no tiene salida, usar la
  [opción B](#opción-b-servidor-sin-acceso-a-internet).
- El paquete SheetJS ya viene incluido en `vendor/`, no hace falta acceso a
  `cdn.sheetjs.com`.

## 3. Despliegue

### Opción A: servidor con acceso a internet

```bash
git clone git@github.com:jose-david-lara/sorteo-app.git
cd sorteo-app
docker compose up -d --build
```

Para publicar en otro puerto del servidor (por ejemplo 80):

```bash
PUERTO=80 docker compose up -d --build
```

El build ejecuta los tests automáticos; si alguno falla, la imagen no se genera.

### Opción B: servidor sin acceso a internet

En una máquina con internet y Docker:

```bash
git clone git@github.com:jose-david-lara/sorteo-app.git
cd sorteo-app
docker build -t camp/sorteo-arbitros:2.0.0 .
docker save camp/sorteo-arbitros:2.0.0 | gzip > sorteo-arbitros-2.0.0.tar.gz
```

Copiar `sorteo-arbitros-2.0.0.tar.gz` al servidor, cargar la imagen y levantarla
con el comando de [Sin Compose](#sin-compose):

```bash
gunzip -c sorteo-arbitros-2.0.0.tar.gz | docker load
```

### Sin Compose

```bash
docker run -d --name sorteo-arbitros \
  -p 8080:8080 \
  --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 128m --cpus 0.5 --pids-limit 100 \
  --log-opt max-size=10m --log-opt max-file=3 \
  --restart unless-stopped \
  camp/sorteo-arbitros:2.0.0
```

### Detrás de un proxy corporativo

Si `npm ci` falla durante el build por el proxy de la red, pasar el proxy como
argumento de build (Docker lo reconoce automáticamente):

```bash
docker build \
  --build-arg HTTP_PROXY=http://proxy.empresa:3128 \
  --build-arg HTTPS_PROXY=http://proxy.empresa:3128 \
  -t camp/sorteo-arbitros:2.0.0 .
```

## 4. Verificación

```bash
# 1) El contenedor debe quedar "healthy" (tarda hasta 30 s)
docker ps --filter name=sorteo-arbitros

# 2) Healthcheck
curl -i http://localhost:8080/healthz          # HTTP/1.1 200 OK — "ok"

# 3) Cabeceras de seguridad presentes
curl -sI http://localhost:8080/ | grep -iE 'content-security-policy|x-frame-options'

# 4) Solo lectura: un POST debe ser rechazado
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/   # 405
```

Por último, abrir `http://<servidor>:8080` desde un equipo de la intranet y
cargar un Excel de prueba.

## 5. Proxy inverso y HTTPS (recomendado)

La aplicación funciona por HTTP, pero se recomienda publicarla con HTTPS a través
del proxy inverso existente. No usa WebSockets ni requiere configuración especial.
Ejemplo con nginx:

```nginx
server {
    listen 443 ssl;
    server_name sorteo.camp.intranet;

    ssl_certificate     /etc/ssl/certs/sorteo.crt;
    ssl_certificate_key /etc/ssl/private/sorteo.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Control de acceso.** La aplicación no maneja usuarios. Si se quiere restringir
quién la usa, agregar autenticación en el proxy (por ejemplo `auth_basic`, LDAP o
el SSO de la organización) o limitarla por IP/VLAN.

**Importante:** el proxy no debe inyectar scripts en las páginas (algunos
appliances lo hacen). La política de seguridad (CSP) los bloquea y la página
quedaría en blanco.

## 6. Operación

| Tarea | Comando |
|---|---|
| Ver estado | `docker ps --filter name=sorteo-arbitros` |
| Ver logs | `docker logs --tail 100 sorteo-arbitros` |
| Reiniciar | `docker compose restart` |
| Detener | `docker compose down` |

Los logs rotan solos (3 archivos de 10 MB como máximo).

**Respaldo:** no hay datos que respaldar en el servidor. Las actas de cada sorteo
las descarga el usuario desde la aplicación (Excel y JSON) y se archivan según el
procedimiento interno del CAMP.

### Actualizar a una nueva versión

```bash
git pull
docker compose up -d --build
```

Antes de actualizar, conviene etiquetar la versión actual para poder volver atrás:

```bash
docker tag camp/sorteo-arbitros:2.0.0 camp/sorteo-arbitros:anterior
```

**Rollback:** cambiar el tag `image:` de `docker-compose.yml` a
`camp/sorteo-arbitros:anterior` y ejecutar `docker compose up -d --no-build`.

## 7. Solución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| `port is already allocated` | El puerto 8080 está en uso: usar `PUERTO=8090 docker compose up -d`. |
| El contenedor queda `unhealthy` | Ver `docker logs sorteo-arbitros`. Verificar que no se haya cambiado `read_only`/`tmpfs` (nginx necesita `/tmp` escribible). |
| `npm ci` falla en el build | Sin salida a internet o proxy: ver [proxy corporativo](#detrás-de-un-proxy-corporativo) u [opción B](#opción-b-servidor-sin-acceso-a-internet). |
| El build falla en `npm test` | Un test automático no pasa: avisar al desarrollador, no desplegar. |
| Página en blanco | Abrir la consola del navegador (F12). Si hay errores de "Content Security Policy", algo (proxy o extensión) está inyectando scripts. |
| El usuario perdió la sesión | La sesión vive en el navegador de cada equipo; cambiar de equipo o navegador, o borrar los datos del navegador, la pierde. Las actas exportadas no se ven afectadas. |

## 8. Seguridad aplicada

- Imagen multi-etapa: la imagen final solo contiene nginx y los archivos
  estáticos (sin Node.js ni código fuente).
- nginx corre como usuario no root (uid 101), en el puerto 8080.
- Contenedor con sistema de archivos de solo lectura, sin capabilities de Linux,
  `no-new-privileges` y límites de memoria, CPU y procesos.
- Dependencias instaladas con `npm ci --ignore-scripts` desde un lockfile con
  hashes de integridad; `npm audit` sin vulnerabilidades.
- Cabeceras de seguridad: `Content-Security-Policy` estricta, `X-Frame-Options:
  DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`/`Resource-Policy`.
- Solo `GET`/`HEAD`; versión de nginx oculta; archivos ocultos bloqueados.

## Contacto

Desarrollo: Jose Lara.
