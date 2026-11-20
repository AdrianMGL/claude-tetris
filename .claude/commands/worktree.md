---
description: Crea un git worktree aislado en .trees/<nombre> y ejecuta ahí el requerimiento
argument-hint: <requerimiento>
---

Requerimiento recibido:

$ARGUMENTS

Sigue estos pasos en orden:

1. Si el requerimiento está vacío, pide al usuario que lo describa y detente.

2. Determina un `<nombre>` corto en kebab-case (minúsculas, guiones, máximo 40 caracteres) que describa el requerimiento. Ejemplo: `agregar-pausa-con-sonido`. No uses espacios ni caracteres especiales.

3. Desde la raíz del repositorio, crea el worktree:

   ```
   git worktree add .trees/<nombre>
   ```

   Si el directorio `.trees/<nombre>` ya existe, usa otro nombre con sufijo numérico (`-2`, `-3`, …). No borres nada existente.

4. Trabaja SOLO dentro de `.trees/<nombre>`:
   - Usa rutas absolutas que empiecen por `<raíz-del-repo>/.trees/<nombre>/` en todas las lecturas, ediciones y escrituras.
   - Ejecuta los comandos git con `git -C <raíz-del-repo>/.trees/<nombre> ...`.
   - No modifiques archivos en la raíz del repositorio principal ni en otros worktrees.

5. Ejecuta el requerimiento dentro del worktree de forma independiente y aislada del código principal, siguiendo las convenciones de `CLAUDE.md` de la raíz.

6. Al terminar, muestra en una sola respuesta:
   - Ruta del worktree: `.trees/<nombre>`
   - Rama creada
   - Resumen breve de los cambios realizados
   - Estado final: `git -C <raíz-del-repo>/.trees/<nombre> status`

   No hagas commit, push ni merge salvo que el requerimiento o el usuario lo pidan explícitamente.
