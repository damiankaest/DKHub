// The first assistant uses explicit commands against the existing catalog.
const normalize = value => value.toLocaleLowerCase('de').trim().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
const matches = (app, query) => [app.name, app.description, app.category].some(value => normalize(value || '').includes(query));

export function decideChat(input, apps, favorites = []) {
  const text = normalize(input);
  if (!text) return { kind: 'message', text: 'Schreibe zum Beispiel „Öffne Wetter“ oder „Suche Musik“.' };
  if (/^(hilfe|was kannst du|hallo|hi)$/.test(text)) {
    return { kind: 'message', text: 'Ich kann registrierte Apps suchen und öffnen. Versuche „Öffne Wetter“, „Suche Musik“ oder „Zeige meine Favoriten“.' };
  }
  if (/^(zurück zur startseite|zur startseite|startseite öffnen|öffne startseite)$/.test(text)) {
    return { kind: 'home', text: 'Ich öffne die Startseite.' };
  }
  if (/^(zeige? )?(mir )?(meine )?favoriten$/.test(text)) {
    const found = apps.filter(app => favorites.includes(app.id));
    return { kind: 'results', text: found.length ? 'Das sind deine Favoriten:' : 'Du hast in diesem Browser noch keine Favoriten.', ids: found.map(app => app.id) };
  }
  const open = text.match(/^(?:öffne|oeffne|öffnen)\s+(?:(?:die|den|das)\s+)?(.+)$/);
  if (open) {
    const name = open[1].trim();
    const exact = apps.filter(app => normalize(app.name) === name);
    const found = exact.length ? exact : apps.filter(app => normalize(app.name).includes(name));
    if (found.length === 1 && found[0].mode === 'embed') return { kind: 'open', text: `Ich öffne ${found[0].name}.`, id: found[0].id };
    if (found.length === 1) return { kind: 'results', text: `${found[0].name} öffnet sich in einem neuen Tab:`, ids: [found[0].id] };
    if (found.length > 1) return { kind: 'results', text: 'Ich habe mehrere passende Apps gefunden. Welche meinst du?', ids: found.map(app => app.id) };
    return { kind: 'message', text: `Ich habe keine registrierte App für „${name}“ gefunden.` };
  }
  const search = text.match(/^(?:suche(?:\s+nach)?|finde|such)\s+(.+)$/);
  if (search) {
    const query = search[1].trim();
    const found = apps.filter(app => matches(app, query));
    return { kind: 'results', text: found.length ? `Dazu habe ich ${found.length} ${found.length === 1 ? 'App' : 'Apps'} gefunden:` : `Ich habe keine registrierte App für „${query}“ gefunden.`, ids: found.map(app => app.id) };
  }
  return { kind: 'message', text: 'Das habe ich noch nicht verstanden. Versuche „Öffne Wetter“, „Suche Musik“ oder „Zeige meine Favoriten“.' };
}
