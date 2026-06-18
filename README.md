# Juan Pablo Agent Hub

Portal maestro para paginas personales, productividad y agentes conectados a la Jetson Nano.

## Publicacion

- Frontend publico: GitHub Pages.
- Backend privado/IA: Jetson Nano en `/workspace/jetson-web`.
- Backend publico opcional: Cloudflare Tunnel hacia la Jetson.

URL esperada de GitHub Pages:

```text
https://JuanPa7799.github.io/juanpablo-agent-hub/
```

## Estructura

```text
docs/
  index.html
  config.js
  predoctorado/
    index.html
apps/
  jetson-web/
    main.py
    requirements.txt
    .env.example
AGENTS.md
```

## Seguridad

No subir `.env`, bases SQLite, logs, sesiones ni llaves API. Las llamadas a OpenRouter deben pasar por FastAPI en la Jetson.
