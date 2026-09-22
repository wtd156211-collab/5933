import { createApp } from './app';
import { createStore } from './store';

const port = Number(process.env.PORT ?? 3001);
const app = createApp(createStore());
app.listen(port, () => {
  console.log(`workflow server listening on http://localhost:${port}`);
});
