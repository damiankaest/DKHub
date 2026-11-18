import test from 'node:test';
import assert from 'node:assert/strict';
import { decideChat } from '../src/chatDecision.js';
const apps = [
  { id:'a', name:'Wetter', category:'Zuhause', description:'Lokale Vorhersage', mode:'embed' },
  { id:'b', name:'Musik', category:'Musik', description:'Vinyl', mode:'external' },
  { id:'c', name:'Musikbox', category:'Musik', description:'Audio', mode:'embed' },
];
test('explicit open selects exactly one embedded app', () => {
  assert.deepEqual(decideChat('Öffne Wetter!', apps), { kind:'open', text:'Ich öffne Wetter.', id:'a' });
  assert.equal(decideChat('Öffne Musik', apps).kind, 'results'); // external opens only by user click
});
test('ambiguous names and searches return choices without executing', () => {
  assert.deepEqual(decideChat('Öffne Mus', apps).ids, ['b', 'c']);
  assert.deepEqual(decideChat('Suche Musik', apps).ids, ['b', 'c']);
  assert.equal(decideChat('Installiere Musik', apps).kind, 'message');
});
test('favorites, home, missing matches and empty input', () => {
  assert.deepEqual(decideChat('Zeige meine Favoriten', apps, ['a']).ids, ['a']);
  assert.equal(decideChat('Zurück zur Startseite', apps).kind, 'home');
  assert.match(decideChat('Öffne Unbekannt', apps).text, /keine registrierte App/);
  assert.equal(decideChat(' ', apps).kind, 'message');
});
