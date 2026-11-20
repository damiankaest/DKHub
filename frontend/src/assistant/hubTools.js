import { mentionedApps, topicApps } from './catalogMatch.js';

// Public DKHub actions. Both the in-page assistant and WebMCP use these handlers.
export const TOOLS = Object.freeze({
  search: 'dkhub_search_apps', favorites: 'dkhub_list_favorites', open: 'dkhub_open_app',
  home: 'dkhub_show_library', add: 'dkhub_prepare_add_app',
  recent: 'dkhub_list_recent', close: 'dkhub_close_active_app',
});
const limit = 24;
const object = (properties = {}, required = []) => ({ type:'object', properties, required, additionalProperties:false });
const idSchema = {type:'string', minLength:1, maxLength:160};
const normalized = text => (text || '').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');
const summary = ({id,name,category,mode}) => ({id,name,category,mode});
const page = apps => ({total:apps.length, apps:apps.slice(0,limit).map(summary)});

function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key=>!allowed.includes(key))) throw new Error('Ungültige Werkzeugparameter.');
}
function validId(id) { return typeof id === 'string' && id.trim().length > 0 && id.length <= 160; }

export function createHubTools(getState) {
  function catalog() {
    const state = getState();
    if (state.status !== 'ready') throw new Error('Die App-Bibliothek ist gerade nicht verfügbar. Versuche es noch einmal.');
    return state;
  }
  function navigation() {
    const state = catalog();
    if (state.panel) throw new Error('Schließe zuerst die geöffnete Verwaltung, damit deine Eingaben erhalten bleiben.');
    return state;
  }
  function tool(name, description, inputSchema, readOnly, execute) {
    return {name, description, inputSchema, annotations:{readOnlyHint:readOnly, untrustedContentHint:![TOOLS.home,TOOLS.add].includes(name)}, execute};
  }
  return [
    tool(TOOLS.search, 'Search registered DKHub apps by name, category or description. An empty search lists apps. Use match=name for a partial name, mentioned for explicit names/routes in a sentence, topic for ranked keyword matches, or ids to verify suggestions in order. Returns up to 24 apps and the total.', object({
      query:{type:'string',maxLength:500}, match:{type:'string',enum:['catalog','name','mentioned','topic']},
      ids:{type:'array',items:idSchema,maxItems:5},
    }), true, (input={}) => {
      fields(input,['query','match','ids']);
      const {query='',match='catalog',ids} = input;
      if (typeof query !== 'string' || query.length > 500 || !['catalog','name','mentioned','topic'].includes(match) ||
          (ids !== undefined && (!Array.isArray(ids) || ids.length>5 || !ids.every(validId)))) throw new Error('Ungültige Suchanfrage.');
      const {apps} = catalog();
      const list = ids ? [...new Set(ids)].map(id=>apps.find(a=>a.id===id)).filter(Boolean) : apps;
      const term = normalized(query);
      if (match==='mentioned') return page(mentionedApps(list,term));
      if (match==='topic') return page(topicApps(list,term));
      if (!term) return page(list);
      if (match === 'name') {
        const exact = list.filter(a=>normalized(a.name)===term);
        return page(exact.length ? exact : list.filter(a=>normalized(a.name).includes(term)));
      }
      const words = term.split(' ');
      return page(list.filter(a=>{
        const haystack = normalized([a.name,a.category,a.description,a.manifest].filter(Boolean).join(' '));
        return words.every(word=>haystack.includes(word));
      }));
    }),
    tool(TOOLS.favorites, 'List this browser’s favorite registered DKHub apps.', object(), true, (input={}) => {
      fields(input,[]); const {apps,favorites} = catalog();
      return page(favorites.map(id=>apps.find(a=>a.id===id)).filter(Boolean));
    }),
    tool(TOOLS.recent, 'List recently opened registered apps in this browser, newest first.', object(), true, (input={}) => {
      fields(input,[]); const {apps,recent}=catalog();
      return page(recent.map(id=>apps.find(a=>a.id===id)).filter(Boolean));
    }),
    tool(TOOLS.close, 'Close only the currently active DKHub view. Optionally require its ID to match expectedId. This never stops the underlying service.', object({expectedId:idSchema}), false, (input={}) => {
      fields(input,['expectedId']);
      if (input.expectedId!==undefined && !validId(input.expectedId)) throw new Error('Ungültige App-ID.');
      const {apps,activeId,close}=navigation();
      if (input.expectedId!==undefined && activeId!==input.expectedId) return {state:'changed'};
      const app=apps.find(a=>a.id===activeId);
      if (!app) return {state:'no_active_app'};
      close(app.id);
      return {state:'closed',app:summary(app)};
    }),
    tool(TOOLS.open, 'Open one registered app by its exact catalog ID. Embedded apps appear in DKHub. An external app shows a link for the visitor to open.', object({id:idSchema}, ['id']), false, input => {
      fields(input,['id']); if (!validId(input.id)) throw new Error('Ungültige App-ID.');
      const {apps,open} = navigation();
      const app = apps.find(item=>item.id===input.id);
      if (!app) throw new Error('Diese App ist nicht mehr in der Bibliothek.');
      open(app);
      return {state:app.mode==='embed'?'opened':'link_required',app:summary(app)};
    }),
    tool(TOOLS.home, 'Show the DKHub app library in this tab.', object(), false, (input={}) => {
      fields(input,[]); navigation().home(); return {state:'library'};
    }),
    tool(TOOLS.add, 'Open the Add App form. This only prepares the form; the visitor enters details and an administrator must save.', object(), false, (input={}) => {
      fields(input,[]); navigation().add(); return {state:'form_open'};
    }),
  ];
}
