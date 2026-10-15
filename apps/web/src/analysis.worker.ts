import { candidateLine } from './analysis-line';

self.onmessage = (event: MessageEvent<string>) => {
  try { self.postMessage({ line: candidateLine(event.data) }); }
  catch { self.postMessage({ error: 'The candidate line could not be calculated. Try again.' }); }
};
