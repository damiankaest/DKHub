import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, defaultTheme, themeVars, validTheme } from '../src/themes/palette.js';

test('text and primary actions stay readable for arbitrary user palettes', () => {
  for (const mode of ['dark','light']) for (const accent of ['#000000','#ffffff','#777777','#707070','#8A8900','#FBFE02','#F08DD0','#102031','#008CFF']) {
    const p = themeVars({...defaultTheme, mode, accent, highlight:accent});
    for (const [fg,bg] of [['--ink','--bg'],['--muted','--surface'],['--accent-ink','--soft'],['--paint-ink','--paint']]) {
      assert.ok(contrast(p[fg],p[bg]) >= 4.5, [mode,accent,fg,bg,p[fg],p[bg]].join(' '));
    }
  }
});
test('cached recipes must have usable colours and bundled effects', () => {
  assert.ok(validTheme(defaultTheme));
  for (const change of [{motif:'unknown'},{accent:'red'},{shape:'toString'},{mode:'sepia'},{motion:1},{name:''}])
    assert.ok(!validTheme({...defaultTheme,...change}));
});
