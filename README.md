# Portafolio Comercial BI · WPP Media

Página estática con un editor autenticado para crear, modificar, ordenar y eliminar estudios. Al publicar, una función de Vercel crea un único commit en GitHub; el push a `main` activa el despliegue automático del proyecto.

## Estructura

- `index.html`: página pública, diálogos y controles del editor.
- `data/estudios.json`: fuente ordenada del portafolio general.
- `data/colombia.json`: estudios diseñados para el mercado colombiano.
- `assets/js/studies-core.js`: render seguro y operaciones CRUD.
- `assets/js/studies-app.js`: detalle público, sesión e interfaz de edición.
- `assets/estudios/` y `assets/colombia/`: imágenes de cada colección.
- `assets/img/` y `assets/video/`: medios generales de la página.
- `api/`: login, logout, sesión, carga de imágenes y publicación.
- `tests/`: pruebas de migración, CRUD, autenticación, conflictos y archivos.

## Crear el token de GitHub

1. En GitHub abre **Settings → Developer settings → Personal access tokens → Fine-grained tokens** y elige **Generate new token**. La guía oficial está en [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
2. Selecciona como propietario la cuenta u organización que contiene este repositorio.
3. En **Repository access**, elige **Only select repositories** y selecciona únicamente este repositorio.
4. En **Repository permissions**, asigna a **Contents** el permiso **Read and write**. No hacen falta permisos de administración ni acceso a otros repositorios.
5. Define una fecha de vencimiento, crea el token y cópialo en ese momento. GitHub no vuelve a mostrarlo.
6. Si la organización exige aprobación para tokens fine-grained, solicita esa aprobación antes de probar el editor.

No guardes el token en archivos del proyecto ni lo expongas en variables que empiecen por `NEXT_PUBLIC_`, `VITE_` u otro prefijo público.

## Variables de entorno en Vercel

En **Project Settings → Environment Variables** crea estas variables para Production (y también Preview si vas a probar allí):

| Variable | Valor |
| --- | --- |
| `GITHUB_TOKEN` | Token fine-grained del paso anterior. |
| `GITHUB_OWNER` | Usuario u organización propietaria del repositorio. |
| `GITHUB_REPO` | Nombre del repositorio, sin la URL. |
| `GITHUB_BRANCH` | `main` |
| `ADMIN_PASSWORD` | Contraseña larga y exclusiva para la persona editora. |
| `SESSION_SECRET` | Secreto aleatorio de 32 caracteres o más. Puedes crearlo con `openssl rand -base64 48`. |

La administración de variables está descrita en [Environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables). Después de agregar o cambiar una variable, crea un despliegue nuevo para que la función la reciba.

## Probar en local

Se requiere Node.js 20 y Vercel CLI.

```bash
# Si instalaste Node 20 con Homebrew en un Mac Apple Silicon:
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

npm install -g vercel
vercel link
vercel env pull .env.local
vercel dev
```

Abre la dirección que muestra Vercel CLI, normalmente `http://localhost:3000`. No abras `index.html` directamente: el navegador necesita el servidor para cargar el JSON y las rutas `/api`. La referencia oficial del comando está en [Vercel CLI: `vercel dev`](https://vercel.com/docs/cli/dev).

Para ejecutar la suite automática:

```bash
npm test
```

Las pruebas usan mocks para GitHub y nunca escriben en el repositorio remoto.

## Guía rápida para editar

1. Abre la página publicada y baja a **Estudios de mercado**.
2. Pulsa **Editar** e ingresa la contraseña. También puedes entrar agregando `#editar` al final de la URL.
3. Abre una tarjeta para usar **Editar**, las flechas o **Eliminar**. Al final de cada columna está **+ Agregar estudio**.
4. Los cambios se ven de inmediato, pero todavía no son públicos. La barra inferior indicará **Cambios sin guardar**.
5. Para poner una parte del texto en negrita, escribe un punto o elemento de lista con el formato `Título: texto`.
6. Las imágenes se convierten automáticamente a WebP y se reducen a un máximo de 1400 px. Agrega siempre un texto alternativo que describa la imagen.
7. Pulsa **Guardar y publicar**. No cierres la pestaña mientras aparezca el estado de carga.
8. Cuando veas el mensaje de confirmación, espera de 1 a 2 minutos a que Vercel termine el despliegue.
9. Si aparece un aviso de que otra persona publicó primero, recarga la página antes de volver a editar.
10. Al terminar, pulsa **Cerrar sesión**. La sesión también vence automáticamente después de 8 horas.

## Seguridad y publicación

- La contraseña se compara en el servidor en tiempo constante y los intentos fallidos se limitan por instancia/IP.
- La sesión vive en una cookie `HttpOnly`, `Secure`, `SameSite=Strict`, firmada y válida durante 8 horas.
- Las operaciones de escritura aceptan únicamente solicitudes del mismo origen.
- El servidor valida todo el esquema, los IDs, longitudes y tipos reales de imagen; no confía en extensiones ni rutas nuevas enviadas por el navegador.
- La publicación usa la API Git Data de GitHub: blobs, tree, commit y actualización no forzada de la rama. Si el SHA cambió, devuelve conflicto y no sobrescribe el trabajo ajeno.
- `data/estudios.json` y `data/colombia.json` se sirven con `Cache-Control: no-cache, no-store, must-revalidate`.
