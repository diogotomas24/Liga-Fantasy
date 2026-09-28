# Servidor automático de Fabtasy (fabtasy-cron-v2)

La Edge Function `fabtasy-cron-v2` hace, cada minuto (pg_cron), las tareas
automáticas del juego: cierre del mercado, precios diarios, bloqueo de
alineaciones, 5 ideal, Triple, avisos y playoffs. Usa **el mismo código que
`src/App.jsx`**: este script extrae de la app las funciones automáticas y las
empaqueta para el servidor.

`fabtasy-cron` (el nombre antiguo) solo reenvía a `fabtasy-cron-v2`.

## Volver a generar el servidor tras cambiar la app

```bash
cd supabase/server-build
python3 gen_core.py ../../src/App.jsx core.jsx   # extrae las tareas del App
bun build.ts                                     # genera dist/bundle.js
# quitar sangría y pasar a ASCII (más fácil de desplegar)
sed -i 's/^ *//' dist/bundle.js
python3 -c "import sys;p='dist/bundle.js';s=open(p,encoding='utf-8').read();open(p,'w').write(''.join(c if ord(c)<128 else ('\\\\u%04X'%ord(c) if ord(c)<=0xFFFF else '\\\\u%04X\\\\u%04X'%(0xD800+((ord(c)-0x10000)>>10),0xDC00+((ord(c)-0x10000)&0x3FF))) for c in s))"
TZ=UTC bun smoke.mjs                             # prueba rápida con datos falsos
```

Luego desplegar `../functions/fabtasy-cron-v2/index.ts` + `dist/bundle.js`.

## Simulacro (no escribe nada)

POST a la función con `{"dry": true, "clockOffsetMs": <ms>}`: hace una pasada
completa leyendo datos reales, pero en vez de guardar devuelve la lista de
escrituras que haría. `clockOffsetMs` adelanta el reloj (p. ej. hasta las
22:00:30 para probar el cierre del mercado, o las 00:00:30 para los precios).
