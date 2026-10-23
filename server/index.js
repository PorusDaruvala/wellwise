// Start Wellwise: node server/index.js   (PORT, WELLWISE_* settings: see docs/DEPLOY.md)
const { createApp } = require('./app.js');
const app = createApp();
const port = +process.env.PORT || 8787;
app.server.listen(port, () => console.log(`Wellwise is running on http://localhost:${port}  (admin console: /admin)`));
const every = +process.env.WELLWISE_TICK_MINUTES || 10;
setInterval(() => app.tick().catch(e => console.error('tick', e)), every * 60e3).unref();
setTimeout(() => app.tick().catch(e => console.error('tick', e)), 5e3).unref();
