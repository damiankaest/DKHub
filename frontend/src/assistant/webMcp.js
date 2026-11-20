// A Tool handle belongs to its document, not just its name. An iframe may
// register the same name: never dispatch a Hub command to that registration.
export function connectHubTools(definitions, registry, owner, onTransport = () => {}) {
  const local = new Map(definitions.map(tool=>[tool.name,tool]));
  const lifecycle = new AbortController();
  let stopped = false;
  const ready = (async () => {
    if (typeof registry?.registerTool !== 'function') return false;
    try {
      for (const tool of definitions) {
        if (stopped) return false;
        await registry.registerTool(tool,{signal:lifecycle.signal});
      }
      return typeof registry.getTools === 'function' && typeof registry.executeTool === 'function';
    } catch {
      lifecycle.abort(); // No partially registered catalog.
      return false;
    }
  })();
  ready.then(native=>{if (!stopped) onTransport(native?'webmcp':'local');});
  return {
    async call(name,input={},signal) {
      if (!local.has(name)) throw new Error('Unbekanntes DKHub-Werkzeug.');
      const native = await ready;
      if (stopped || signal?.aborted) throw new DOMException('Abgebrochen','AbortError');
      if (!native) return local.get(name).execute(input);
      const tools = await registry.getTools();
      const tool = tools.find(t=>t.name===name && t.source===owner);
      if (!tool) throw new Error('Das angeforderte DKHub-Werkzeug ist nicht verfügbar.');
      if (stopped || signal?.aborted) throw new DOMException('Abgebrochen','AbortError');
      // Do not replay an action locally after native execution: it may already have run.
      const reply = await registry.executeTool(tool,input,signal?{signal}:{});
      const result = typeof reply === 'string' ? JSON.parse(reply) : reply;
      if (!result || typeof result !== 'object') throw new Error('Der Browser hat kein Werkzeugergebnis geliefert.');
      return result;
    },
    dispose() { stopped=true; lifecycle.abort(); },
  };
}
