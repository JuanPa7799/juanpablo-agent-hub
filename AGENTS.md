# Mapa De Agentes

Este archivo define la arquitectura conceptual del sistema multiagente. La implementacion activa inicial vive en la Jetson con FastAPI + PicoClaw.

## Orquestador Principal

- Mision: recibir solicitudes del portal maestro, decidir que subagente debe actuar y consolidar resultados.
- Canal principal: backend FastAPI `/api/orchestrator/chat` en fase siguiente.
- Memoria: SQLite por app/agente y archivos de workspace cuando sea necesario.

## Agente Doctorado

- Mision: apoyar protocolo doctoral, PQD, Wavelet, Edge Computing, revision de papers, bitacoras y redaccion academica.
- App inicial: `docs/predoctorado/`.
- Estado actual: pagina adaptada para usar Jetson API.

## Agente Portfolio

- Mision: mantener proyectos, dashboard, CV y narrativa profesional.
- Estado: planeado.

## Agente Asistente Virtual

- Mision: agenda, correo, Drive, notas y recordatorios.
- Estado: planeado; requiere autorizaciones externas antes de ejecutar acciones.

## Agente Programador

- Mision: crear, revisar y desplegar apps, scripts y automatizaciones.
- Estado: planeado.

## Agente Escritura

- Mision: redactar, editar, resumir y convertir notas en documentos.
- Estado: planeado.

## Agente Productividad

- Mision: metas, habitos, foco, bitacoras, reportes y analitica personal.
- Estado: planeado.

## Agente Empleo

- Mision: buscar vacantes, adaptar CV, priorizar postulaciones y preparar entrevistas.
- Estado: reservado para cuando se definan metas y criterios.
