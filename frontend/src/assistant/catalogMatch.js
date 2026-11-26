// Explicit references may navigate; partial names and descriptions are suggestions only.
const words = value => (value || '').normalize('NFKD').toLocaleLowerCase('de')
  .replace(/\p{M}/gu,'').replace(/ß/g,'ss').match(/[\p{L}\p{N}]+/gu) || [];
const stop = new Set(words('der die das den dem des ein eine einen einer einem meine meinen mein mir ich mich wir du bitte kannst könntest kann könnte möchte möchtest will würde mal kurz jetzt doch mal wieder gerne wo womit finde finden suche suchen such suchst zeig zeige zeigen öffnen öffne starte starten bring schließe schliessen mach zu zur zum für von aus an am im in mit auf und oder um als nach welche welcher welches was sind sich es ist man app apps anwendung anwendungen hub the a an and or for with of from my me to i can could would please open show find search app apps'));

function aliases(app) {
  const names=[app.name, app.route].filter(Boolean);
  // DKCoach, DK Coach and /dk-coach refer to the same full name, not a fuzzy match.
  const split=name=>name.replace(/^DK(?=[A-Z])/u,'DK ').replace(/(\p{Ll})(\p{Lu})/gu,'$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu,'$1 $2');
  return new Set(names.flatMap(name=>[name,split(name),words(name).join('')]));
}

export function mentionedApps(apps,query) {
  const input=words(query), matches=[];
  for (const app of apps) {
    for (const alias of aliases(app)) {
      const name=words(alias);
      if (!name.length) continue;
      for (let i=0;i<=input.length-name.length;i++) {
        if (!name.every((word,j)=>input[i+j]===word)) continue;
        const end=i+name.length;
        if (!matches[i] || matches[i].end<end) matches[i]={end,ids:new Set()};
        if (matches[i].end===end) matches[i].ids.add(app.id);
      }
    }
  }
  const ids=new Set();
  let covered=0;
  // "Wetter Radar" wins over a nested "Wetter"; independent mentions stay ambiguous.
  for (const hit of matches) if (hit && hit.end>covered) {
    for (const id of hit.ids) ids.add(id);
    covered=hit.end;
  }
  return apps.filter(app=>ids.has(app.id));
}

export function topicApps(apps,query) {
  const terms=[...new Set(words(query).filter(w=>!stop.has(w)))];
  if (!terms.length) return [];
  const hits=[];
  for (const app of apps) {
    const fields=[words([...aliases(app)].join(' ')),words(app.category),words([app.description,app.manifest].filter(Boolean).join(' '))];
    let score=0, matched=0;
    for(const term of terms) {
      const field=fields.findIndex(tokens=>tokens.some(t=>t===term || (term.length>=3 && t.startsWith(term)) || (term.length>=5 && t.endsWith(term))));
      if(field>=0){score+=[5,3,1][field];matched++;}
    }
    if(matched) hits.push({app,matched,score});
  }
  return hits.sort((a,b)=>b.matched-a.matched||b.score-a.score).map(h=>h.app);
}
