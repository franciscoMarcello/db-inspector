jsreport POC (Docker + Angular)

Run the jsreport Studio
1) docker compose -f docker-compose.jsreport.yml up -d
2) Open http://localhost:5488 to access Studio

Run the jsreport Studio (local, no Docker)
1) npm init -y
2) npm install jsreport
3) npx jsreport init
4) npx jsreport start
5) Open http://localhost:5488 to access Studio

Create a template in Studio
1) Create a new template named "db-report"
2) Recipe: chrome-pdf
3) Engine: handlebars
4) Copy the HTML from jsreport/sample-template.html

Angular integration
1) Open "Executar SQL"
2) Click "Configurar jsreport"
   - Server URL: http://localhost:5488
   - Template name: db-report
3) Run a query and click "Exportar PDF (jsreport)"

Notes
- The Angular client sends this data to jsreport:
  - data.meta: environment, generatedAt, lastRunAt, rowCount, elapsedMs, truncated
  - data.query: SQL text
  - data.columns: column names
  - data.rows: up to 500 rows
  - data.summaries: numeric column totals
