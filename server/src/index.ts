import { createApiServer } from './app.js';

const port = Number(process.env.PORT ?? 4173);
const server = createApiServer();
server.listen(port, () => {
  console.log(`Workflow server listening on http://localhost:${port}`);
});
