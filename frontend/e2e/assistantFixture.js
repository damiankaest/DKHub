import { defaultTheme } from '../src/themes/palette.js';

const catalog=[
  {id:'coach',route:'coach',name:'DKCoach',category:'Fitness',description:'Dein Training zuhause',manifest:'Gewicht und Wiederholungen notieren',icon:'spark',color:'sage',url:'/demo.html',mode:'embed',label:'App'},
  {id:'garden',route:'garten',name:'DKGarden',category:'Zuhause',description:'Pflanzen und Sensoren',icon:'spark',color:'sage',url:'/demo.html',mode:'embed',label:'App'},
  {id:'music',route:'musik',name:'Musikarchiv',category:'Medien',description:'Deine Plattensammlung',icon:'globe',color:'sage',url:'https://example.com/',mode:'external',label:'Webseite'},
];
export async function mockCatalog({page}) {
  await page.route('**/api/apps',r=>r.fulfill({json:catalog}));
  await page.route('**/api/theme',r=>r.fulfill({json:defaultTheme}));
}
export const toggle=page=>page.getByRole('button',{name:'DKHub Chat öffnen',exact:true});
export const log=page=>page.getByRole('log',{name:'Chatverlauf'});
export async function say(page,text) {
  const input=page.getByRole('textbox',{name:'Nachricht an DKHub'});
  await input.fill(text);await input.press('Enter');
}
