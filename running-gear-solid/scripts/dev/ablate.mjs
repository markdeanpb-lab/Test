import { startServer, openFilm } from '../lib/browser.mjs';
const { server, url } = await startServer();
const film = await openFilm(url + 'remaster.html');
const path = JSON.parse(process.env.P ?? "[]");
for (const t of process.argv.slice(2).map(Number)) console.log(t, JSON.stringify(await film.page.evaluate(([tt, p]) => window.RGS.ablate(tt, p), [t, path])));
await film.browser.close();
await server.close();
