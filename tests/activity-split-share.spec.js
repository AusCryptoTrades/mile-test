const {test,expect}=require('@playwright/test');
const {normalize,layout,names}=require('../mile-split-share.js');
test('split layout retains every lap and adapts to marathon and ultra distances',()=>{
 const rows=Array.from({length:101},(_,i)=>({index:i+1,distance:1000,duration:300+i}));
 const data=normalize(rows,[]);expect(layout(data.rows.slice(0,10)).columns).toBe(1);expect(layout(data.rows.slice(0,43)).columns).toBe(2);
 const pages=Array.from({length:layout(data.rows).count},(_,i)=>layout(data.rows,i).part).flat();
 expect(pages).toEqual(data.rows);expect(names(data)).toHaveLength(6);
 expect(normalize([],[]).rows).toHaveLength(0);expect(normalize([{distance:1000,duration:0}],rows).rows).toHaveLength(101);
});
test('real canvas renders both split themes and extra pages, own card selection retains original options',async({page})=>{
 await page.goto('/mile-split-share.js');await page.setContent('<!doctype html><html><head></head><body><div id="dialog"><div class="mile352-choices"><button data-mile352-style="performance">Performance</button><button data-mile352-style="photo">Photo</button><button data-mile352-style="route">Route</button></div><label class="mile352-photo-label">Photo</label><img id="mile352-preview"></div></body></html>');
 await page.addScriptTag({path:'mile-split-share.js'});
 const result=await page.evaluate(()=>{
  const rows=Array.from({length:45},(_,i)=>({index:i+1,distance:1000,duration:300+i}));
  const data=mileSplitShare.normalize(rows,[]),model={title:'Example',activity_at:'2026-11-27',distance_m:45000,duration_s:13500,average_hr:150};
  const c=mileSplitShare.paint(model,data,false),d=mileSplitShare.paint(model,data,true,1);
  window.mileBeta4RecordedLaps=()=>rows;
  mileSplitShare.ownButtons(document.getElementById('dialog'),{distanceKm:45,averageHR:150},{laps:rows},{sport:'Running',title:'Example',date:'2026-11-27',seconds:13500});
  return {w:c.width,h:c.height,light:[...c.getContext('2d').getImageData(0,0,1,1).data],dark:[...d.getContext('2d').getImageData(0,0,1,1).data]};
 });
 expect(result).toEqual({w:1080,h:1350,light:[232,232,228,255],dark:[28,32,35,255]});
 await page.getByRole('button',{name:'Splits Dark · 2/2'}).click();
 await expect(page.locator('#mile352-preview')).toHaveAttribute('src',/^data:image\/png;base64,/);
 await expect(page.getByRole('button',{name:'Performance'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Photo',exact:true})).toBeVisible();
});
