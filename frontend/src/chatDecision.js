import { TOOLS } from './assistant/hubTools.js';

const normalized = value => value.trim().toLocaleLowerCase('de').replace(/[.!?]+$/g, '').replace(/\s+/g,' ');
function results(data, lead, empty) {
  return {text:data.total?lead:empty, ids:data.apps.map(app=>app.id), total:data.total};
}

export async function openInChat(id,call,signal) {
  const {app,state}=await call(TOOLS.open,{id},signal);
  return state==='opened' ? {text:'Ich öffne '+app.name+'.', navigated:true} :
    {text:app.name+' ist ein externer Link. Öffne ihn in einem neuen Tab.',ids:[app.id],navigated:true};
}

async function showCatalog(query,call,signal) {
  const data=await call(TOOLS.search,{query},signal);
  return results(data,'Dazu habe ich '+data.total+(data.total===1?' App':' Apps')+' gefunden:',
    query?'Ich habe keine registrierte App für „'+query+'“ gefunden.':'Deine App-Bibliothek ist noch leer.');
}

async function simpleAction(tool,call,signal) {
  const data=await call(tool,{},signal);
  if (tool===TOOLS.recent) return results(data,'Das hast du zuletzt geöffnet:', 'In diesem Browser hast du noch keine Apps geöffnet.');
  if (tool===TOOLS.favorites) return results(data,'Das sind deine Favoriten:',
    'Du hast in diesem Browser noch keine Favoriten. Mit dem Stern an einer App merkst du sie dir.');
  return {text:tool===TOOLS.home?'Die App-Bibliothek ist geöffnet.':
    'Das Formular ist geöffnet. Zum Speichern brauchst du das Admin-Passwort.',navigated:true};
}

async function closeActive(query,activeId,call,signal) {
  if (!activeId) return {text:'Gerade ist keine App geöffnet.'};
  // A reply may arrive after the visitor has switched apps. Never close the new one.
  const mentioned=await call(TOOLS.search,{query,match:'mentioned'},signal);
  const currentReference=/(?:\b(?:aktuell\w*|diese\w*|aktiv\w*|hier|current|this)\b)|^(?:(?:app|fenster) schließen|schließe (?:das fenster|die app)|schließen)[.!?]?$/iu.test(query.trim());
  if (mentioned.total ? mentioned.total!==1 || mentioned.apps[0].id!==activeId : !currentReference)
    return {text:'Ich kann die aktuelle Ansicht schließen. Meintest du „Schließe die aktuelle App“?'};
  const result=await call(TOOLS.close,{expectedId:activeId},signal);
  if (result.state==='changed') return {text:'Die aktive Ansicht hat sich geändert. Ich habe nichts geschlossen.'};
  if (result.state==='no_active_app') return {text:'Gerade ist keine App geöffnet.'};
  return {text:'Die Ansicht von '+result.app.name+' ist geschlossen.',navigated:true};
}

async function findForAction(query,open,call,signal) {
  if (open) {
    const named=await call(TOOLS.search,{query,match:'mentioned'},signal);
    if (named.total===1 && named.apps[0].mode==='embed') return openInChat(named.apps[0].id,call,signal);
    if (named.total) return results(named,named.total===1?'Diese App öffnet in einem neuen Tab:':'Welche dieser Apps möchtest du öffnen?','');
  }
  const data=await call(TOOLS.search,{query,match:'topic'},signal);
  return results(data,open?'Meintest du eine dieser Apps?':'Passende Apps in deiner Bibliothek:',
    'Dafür habe ich keine App gefunden. Versuche den App-Namen oder einen Suchbegriff.');
}

export async function decideChat(input,call,signal,activeId) {
  const text=normalized(input);
  if (/^(?:zeige? (?:mir )?)?(?:(?:meine|die) )?zuletzt (?:geöffnet(?:e|en)?(?: apps)?|genutzten apps)$/.test(text))
    return simpleAction(TOOLS.recent,call,signal);
  if (/^(?:schließe? (?:die (?:aktuelle |aktive )?app|das (?:aktuelle |aktive )?fenster)|(?:app|fenster) schließen|schließen)$/.test(text))
    return closeActive(input,activeId,call,signal);
  if (/^(zurück zur (startseite|bibliothek)|zur (startseite|bibliothek)|startseite öffnen|öffne (die )?(startseite|bibliothek))$/.test(text))
    return simpleAction(TOOLS.home,call,signal);
  if (/^(neue? app hinzufügen|app hinzufügen|anwendung hinzufügen)$/.test(text)) return simpleAction(TOOLS.add,call,signal);
  if (/^(zeige? )?(mir )?(meine )?favoriten$/.test(text)) return simpleAction(TOOLS.favorites,call,signal);
  const open=text.match(/^(?:öffne|oeffne|öffnen|starte)\s+(?:(?:die|den|das)\s+)?(.+)$/);
  if (open) {
    const data=await call(TOOLS.search,{query:open[1],match:'name'},signal);
    const first=data.apps[0];
    if (data.total===1 && first.mode==='embed') return openInChat(first.id,call,signal);
    return results(data,data.total===1?first.name+' öffnet sich in einem neuen Tab:':'Mehrere Apps passen. Welche möchtest du öffnen?',
      'Ich habe keine registrierte App für „'+open[1]+'“ gefunden.');
  }
  if (!text || /^(hallo|hey|hi|hilfe|was kannst du)$/.test(text))
    return {text:'Ich kann deine Apps suchen und öffnen. Versuche „Zeige alle Apps“, „Meine Favoriten“ oder „Öffne Wetter“.'};
  if (/^(installier|lösch|entfern|bearbeite|deinstallier)/.test(text))
    return {text:'Dienste installierst oder verwaltest du im Bereich Dienste. Hier kann ich dir helfen, registrierte Apps zu finden und zu öffnen.'};
  if (/^(alle apps|apps entdecken|zeige (mir )?(alle |meine )?apps)$/.test(text)) return showCatalog('',call,signal);
  return showCatalog(text.replace(/^(?:suche(?: nach)?|finde|such)\s+/,''),call,signal);
}

// The server selects from a fixed set; resolve live catalog IDs in the browser.
// On an older backend ranked suggestions remain clickable, but do not auto-open.
export async function resolveAiReply(reply,call,signal,activeId) {
  if (typeof reply?.reply!=='string' || !Array.isArray(reply.app_ids)) throw new Error('Ungültige Antwort des KI-Dienstes.');
  const {tool,app_ids:ids}=reply;
  const actions={favorites:TOOLS.favorites,recent:TOOLS.recent,library:TOOLS.home,prepare_add:TOOLS.add};
  if (Object.hasOwn(actions,reply.intent) && actions[reply.intent]===tool) return simpleAction(tool,call,signal);
  if ('query' in reply) {
    const query=reply.query;
    if (typeof query!=='string' || !query.trim() || query.length>500) throw new Error('Ungültiger Suchauftrag.');
    if (tool===TOOLS.open && reply.intent==='open') return findForAction(query,true,call,signal);
    if (tool===TOOLS.search && reply.intent==='search') return findForAction(query,false,call,signal);
    if (tool===TOOLS.close && reply.intent==='close_active') return closeActive(query,activeId,call,signal);
    throw new Error('Unbekannter Werkzeugauftrag.');
  }
  if (tool===TOOLS.search && reply.intent==='catalog') return showCatalog('',call,signal);
  if ((tool && ![TOOLS.search,TOOLS.open].includes(tool)) || !ids.length) return {text:reply.reply};
  const data=await call(TOOLS.search,{ids:ids.slice(0,5)},signal);
  if (!data.total) return {text:'Diese vorgeschlagenen Apps sind nicht mehr in deiner Bibliothek.'};
  if (tool===TOOLS.open && reply.intent==='open' && ids.length===1 && data.total===1 && data.apps[0].mode==='embed')
    return openInChat(data.apps[0].id,call,signal);
  return {text:reply.reply,ids:data.apps.map(app=>app.id),total:data.total};
}
