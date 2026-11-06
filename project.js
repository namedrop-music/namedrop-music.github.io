"use strict";

(() => {
  const BLUE = "#286f9e", ORANGE = "#c76e28", TEAL = "#589b91";
  const state = { data: null, baselines: false, artist: null, artistQuery: "", artistSort: "name", matrixQuery: "", matrixSort: "name", expanded: new Set(), selectedColumn: null, promptOpen: new Set() };
  const charts = new Map();
  let activeChart = null;
  const el = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = value => `${(100 * value).toFixed(1)}%`;
  const line = points => points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const text = (x, y, value, attrs = "") => `<text x="${x}" y="${y}" ${attrs}>${esc(value)}</text>`;

  function domain(values) {
    let lo = Math.min(...values), hi = Math.max(...values);
    const padding = Math.max(.01, (hi - lo) * .04);
    lo = Math.max(0, lo - padding); hi = Math.min(1, hi + padding);
    const raw = Math.max(.01, (hi - lo) / 6), power = 10 ** Math.floor(Math.log10(raw));
    const e = raw / power, step = power * (e >= Math.sqrt(50) ? 10 : e >= Math.sqrt(10) ? 5 : e >= Math.sqrt(2) ? 2 : 1);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    return { lo, hi, ticks: Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step) };
  }

  function plot(curves, options = {}) {
    const mini = Boolean(options.mini), w = options.width || 450, h = options.height || (mini ? 210 : 310);
    const left = mini ? 36 : 48, right = 12, top = 14, bottom = mini ? 26 : 40;
    const keys = ["restricted/search", "allowed/search"];
    if (state.baselines) keys.push("restricted/fixed", "allowed/fixed");
    let values = keys.flatMap(k => curves[k]);
    if (options.bands) values = values.concat(...keys.map(k => [...options.bands[k].lo, ...options.bands[k].hi]));
    const d = options.range || domain(values);
    const x = n => left + (n - 1) / 127 * (w - left - right);
    const y = v => top + (d.hi - v) / (d.hi - d.lo) * (h - top - bottom);
    const ticks = mini ? d.ticks.filter((_,i)=>i%2===0) : d.ticks;
    let body = ticks.map(v => `<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/>` + text(left - 5, y(v) + 4, v.toFixed(2), 'text-anchor="end"')).join("");
    for (const n of (mini ? [1,64,128] : [1,32,64,96,128])) body += text(x(n), h - bottom + 17, n, 'text-anchor="middle"');
    if (!mini) {
      body += text((w+left-right)/2, h-3, "Generated samples", 'text-anchor="middle"');
      body += text(13, h/2, "CLAP similarity", `text-anchor="middle" transform="rotate(-90 13 ${h/2})"`);
    }
    for (const key of keys) {
      const color = key.startsWith("restricted") ? BLUE : ORANGE, fixed = key.endsWith("fixed");
      const dash = fixed ? 'stroke-dasharray="2 3"' : key.startsWith("allowed") ? 'stroke-dasharray="7 4"' : '';
      const points = curves[key].map((v,i) => [x(i+1),y(v)]);
      if (options.bands && !fixed) {
        const b = options.bands[key];
        body += `<path d="${line([...b.hi.map((v,i)=>[x(i+1),y(v)]),...b.lo.map((v,i)=>[x(i+1),y(v)]).reverse()])}Z" fill="${color}" opacity=".10"/>`;
      }
      body += `<path d="${line(points)}" fill="none" stroke="${color}" stroke-width="${mini ? 1.8 : 2.3}" ${fixed ? 'opacity=".65"' : ''} ${dash}/>`;
      if (!fixed) body += `<circle cx="${x(128)}" cy="${y(curves[key][127])}" r="${mini ? 2 : 3}" fill="${color}"/>`;
    }
    let attrs = '';
    if (!mini) {
      const id=String(charts.size);
      charts.set(id,{curves,keys,w,h,left,right,top,bottom,x,y,index:128});
      attrs=`data-chart="${id}" tabindex="0"`;
      body+=`<g class="plot-inspector" visibility="hidden"><line class="inspect-line" y1="${top}" y2="${h-bottom}" stroke="#888" stroke-dasharray="3 4"/>${keys.map(key=>`<circle data-series="${key}" r="4" fill="white" stroke="${key.startsWith('restricted')?BLUE:ORANGE}" stroke-width="2"/>`).join('')}</g>`;
    }
    return `<svg ${attrs} viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(options.title || 'CLAP similarity by generation budget')}${mini?'':'. Hover or use arrow keys to inspect generation budgets.'}">${body}</svg>`;
  }

  function hidePlotInspector() {
    if(activeChart)activeChart.querySelector('.plot-inspector')?.setAttribute('visibility','hidden');
    activeChart=null;
    el('plot-tooltip').hidden=true;
  }

  function inspectPlot(svg,event,index) {
    const chart=charts.get(svg.dataset.chart);
    if(!chart)return;
    const box=svg.getBoundingClientRect();
    if(index===undefined) {
      const px=(event.clientX-box.left)/box.width*chart.w;
      if(px<chart.left||px>chart.w-chart.right){hidePlotInspector();return;}
      index=Math.round(1+(px-chart.left)/(chart.w-chart.left-chart.right)*127);
    }
    index=Math.max(1,Math.min(128,index));
    if(activeChart!==svg)hidePlotInspector();
    activeChart=svg;
    chart.index=index;
    const cursor=svg.querySelector('.plot-inspector'), x=chart.x(index);
    cursor.setAttribute('visibility','visible');
    for(const attr of ['x1','x2'])cursor.querySelector('.inspect-line').setAttribute(attr,x);
    cursor.querySelectorAll('[data-series]').forEach(point=>{
      point.setAttribute('cx',x);
      point.setAttribute('cy',chart.y(chart.curves[point.dataset.series][index-1]));
    });
    const tip=el('plot-tooltip');
    tip.innerHTML=`<strong>Budget: ${index} generation${index===1?'':'s'}</strong>${chart.keys.map(key=>`<div class="plot-tooltip-row"><span class="plot-tooltip-label"><i class="key-line ${key.startsWith('allowed')?'allowed':'blocked'}${key.endsWith('fixed')?' fixed':''}"></i>${key.endsWith('fixed')?'Fixed prompt · ':''}Names ${key.startsWith('restricted')?'blocked':'allowed'}</span><span>${chart.curves[key][index-1].toFixed(3)}</span></div>`).join('')}`;
    tip.hidden=false;
    const screenX=event?.clientX??(box.left+x/chart.w*box.width);
    const screenY=event?.clientY??(box.top+box.height/2);
    tip.style.left=`${Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,screenX+15))}px`;
    tip.style.top=`${Math.max(8,Math.min(innerHeight-tip.offsetHeight-8,screenY+15))}px`;
  }

  function visibleArtists() {
    let names = Object.keys(state.data.rq1.artists).filter(name => name.toLowerCase().includes(state.artistQuery.toLowerCase()));
    const gap = name => state.data.rq1.artists[name]["allowed/search"][127] - state.data.rq1.artists[name]["restricted/search"][127];
    names.sort((a,b) => state.artistSort === "name" ? a.localeCompare(b) : (state.artistSort === "gap" ? gap(b)-gap(a) : gap(a)-gap(b)));
    return names;
  }

  function detail(artist, width) {
    const mobile = window.innerWidth <= 760;
    const plotWidth = mobile ? width - 22 : (width - 70) / 2;
    const songs = state.data.rq1.songs[artist];
    return `<div class="artist-detail" id="artist-detail"><div class="detail-heading"><h4>${esc(artist)} — target songs</h4><button type="button" data-close-artist aria-label="Close artist details">×</button></div><div class="song-grid">${songs.map((song,i) => `<div class="song-result"><h5>${esc(song.title)}</h5><div class="plot">${plot(song.curves,{width:plotWidth,title:`${artist}: ${song.title}`})}</div>${["restricted","allowed"].map(condition => {
      const id = `${artist}/${i}/${condition}`;
      return `<details data-prompt="${esc(id)}" ${state.promptOpen.has(id) ? "open" : ""}><summary>Best prompt, names ${condition === "restricted" ? "blocked" : "allowed"}</summary><p>${esc(song.prompts[condition])}</p></details>`;
    }).join("")}</div>`).join("")}</div></div>`;
  }

  function updateScrollShadows() {
    const viewport=el('artist-scroll'), frame=el('artist-scroll-frame');
    frame.classList.toggle('has-above',viewport.scrollTop>1);
    frame.classList.toggle('has-below',viewport.scrollTop+viewport.clientHeight<viewport.scrollHeight-1);
  }

  function renderRQ1() {
    hidePlotInspector();
    charts.clear();
    const aggregates = state.data.rq1.aggregate;
    const mean = Object.fromEntries(Object.entries(aggregates).map(([key,value])=>[key,value.mean]));
    el("mean-chart").innerHTML = plot(mean,{width:el("mean-chart").clientWidth,height:innerWidth<=760?330:420,bands:aggregates,title:"Mean over 32 artists"});
    const grid = el("artist-grid"), viewport = el("artist-scroll"), names = visibleArtists();
    const scrollTop = viewport.scrollTop;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const gap = parseFloat(getComputedStyle(grid).columnGap);
    const tileWidth = (grid.clientWidth - (columns - 1) * gap) / columns - (innerWidth<=760 ? 16 : 20);
    const tileHeight = Math.max(112, tileWidth - 58);
    let html = "";
    names.forEach(artist => {
      const curves = state.data.rq1.artists[artist];
      html += `<button class="artist-tile" type="button" data-artist="${esc(artist)}" aria-expanded="${state.artist === artist}"><span class="artist-name">${esc(artist)}</span>${plot(curves,{mini:true,width:tileWidth,height:tileHeight,range:state.sharedRange,title:artist})}<span class="tile-scores"><span class="score-blocked">Blocked ${curves['restricted/search'][127].toFixed(3)}</span><span class="score-allowed">Allowed ${curves['allowed/search'][127].toFixed(3)}</span></span></button>`;
    });
    grid.innerHTML = html || '<p>No matching artist.</p>';
    const visibleTiles = [...grid.querySelectorAll('.artist-tile')].slice(0,columns*2);
    if (visibleTiles.length) {
      const bottom = Math.max(...visibleTiles.map(tile=>tile.getBoundingClientRect().bottom));
      viewport.style.maxHeight = `${Math.ceil(bottom-grid.getBoundingClientRect().top)+4}px`;
    }
    viewport.scrollTop = scrollTop;
    updateScrollShadows();
    el('artist-detail-panel').innerHTML = names.includes(state.artist) ? detail(state.artist,el('artist-detail-panel').clientWidth) : '';
  }

  const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;

  function renderCredit() {
    const host=el('credit-chart'), rows=state.data.rq2.credit_by_artist;
    const w=innerWidth<=760?host.clientWidth:(host.clientWidth-24)/2;
    const left=innerWidth<=760?128:153, right=38, top=48, step=23, bottom=15;
    const high=Math.ceil(Math.max(...rows.map(row=>row.total))/4)*4;
    const x=value=>left+value/high*(w-left-right);
    const groups=[rows.slice(0,25),rows.slice(25)];
    host.innerHTML=groups.map((group,column)=>{
      const h=top+group.length*step+bottom;
      let body=text(left,14,'Total credit');
      for(let value=0;value<=high;value+=4) {
        body+=`<line x1="${x(value)}" x2="${x(value)}" y1="${top-10}" y2="${h-bottom}" stroke="#e7e9ea"/>`;
        body+=text(x(value),32,value,'text-anchor="middle"');
      }
      group.forEach((row,i)=>{
        const y=top+i*step, label=row.artist.length>24?`${row.artist.slice(0,23)}…`:row.artist;
        body+=`<g class="credit-bar" tabindex="0" data-credit="${column*25+i}" aria-label="${esc(row.artist)}: total credit ${row.total.toFixed(2)}, from named outputs ${row.own.toFixed(2)}, from other outputs ${row.other.toFixed(2)}"><rect class="credit-row-bg" x="0" y="${y-2}" width="${w}" height="${step}" fill="transparent"/>${text(left-8,y+12,label,'text-anchor="end"')}<rect x="${left}" y="${y+2}" width="${x(row.own)-left}" height="13" fill="${ORANGE}"/><rect x="${x(row.own)}" y="${y+2}" width="${x(row.total)-x(row.own)}" height="13" fill="${TEAL}"/>${text(x(row.total)+5,y+12,row.total.toFixed(1))}</g>`;
      });
      body+=`<line x1="${x(4)}" x2="${x(4)}" y1="${top-10}" y2="${h-bottom}" stroke="#555" stroke-dasharray="4 4" pointer-events="none"/>`;
      return `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="Total credit, artists ${column*25+1} to ${column*25+group.length}">${body}</svg>`;
    }).join('');
  }

  function placeTooltip(html,event) {
    const tip=el('matrix-tooltip');
    tip.innerHTML=html;
    tip.hidden=false;
    tip.style.left=`${Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,event.clientX+15))}px`;
    tip.style.top=`${Math.max(8,Math.min(innerHeight-tip.offsetHeight-8,event.clientY+15))}px`;
  }

  function inspectCredit(target,event) {
    const row=state.data.rq2.credit_by_artist[Number(target.dataset.credit)];
    placeTooltip(`<strong>${esc(row.artist)}</strong>Total credit: ${row.total.toFixed(2)}<br>From outputs naming this artist: ${row.own.toFixed(2)}<br>From outputs naming other artists: ${row.other.toFixed(2)}<br>Name-only credit: 4`,event);
  }
  function visibleRows() {
    const names = state.data.rq2.artists;
    let rows = names.map((_,i)=>i).filter(i=>names[i].toLowerCase().includes(state.matrixQuery.toLowerCase()));
    rows.sort((a,b)=> state.matrixSort === "name" ? names[a].localeCompare(names[b]) : (state.matrixSort === "share" ? 1 : -1)*(state.matrixMeans[a][a]-state.matrixMeans[b][b]));
    return rows;
  }
  function shade(share) { const t=Math.min(share/.5,1); return `rgb(${Math.round(245-210*t)},${Math.round(250-146*t)},${Math.round(252-107*t)})`; }
  function cells(row,values,output) {
    return state.columnOrder.map(column => `<td><button tabindex="-1" class="heat-cell${column===row?' named':''}" data-row="${row}" data-col="${column}" data-output="${output}" style="background:${shade(values[column])}${state.selectedColumn===column?';outline:1px solid #777;outline-offset:-1px':''}" aria-label="${esc(state.data.rq2.artists[column])}: ${pct(values[column])}"></button></td>`).join("");
  }
  function renderMatrix() {
    el("matrix-tooltip").hidden = true;
    const names = state.data.rq2.artists, rows = visibleRows();
    const head = state.columnOrder.map(i=>`<th title="${esc(names[i])}"><span class="column-name" data-column="${i}">${esc(names[i])}</span></th>`).join("");
    let body = "";
    for (const row of rows) {
      const open = state.expanded.has(row);
      body += `<tr class="artist-row"><th><button type="button" class="row-toggle" data-expand="${row}" aria-expanded="${open}" title="${esc(names[row])}">${open?'▾':'▸'} ${esc(names[row])}</button></th>${cells(row,state.matrixMeans[row],"mean")}</tr>`;
      if (open) for (const output of state.outputsByArtist[row]) body += `<tr class="output-row"><th>Output ${output.id.split('_s')[1]}</th>${cells(row,output.shares,output.id)}</tr>`;
    }
    el("credit-matrix").innerHTML = `<table class="credit-table"><thead><tr><th>Named in prompt ↓<br>Contributing artist →</th>${head}</tr></thead><tbody>${body || '<tr><td colspan="51">No matching artist.</td></tr>'}</tbody></table>`;
    el("expand-all").textContent = rows.length && rows.every(i=>state.expanded.has(i)) ? "Collapse rows" : "Expand all outputs";
  }

  function inspectCell(target,event) {
    const row=Number(target.dataset.row),column=Number(target.dataset.col), names=state.data.rq2.artists;
    const outputs=state.outputsByArtist[row], averaged=target.dataset.output === "mean";
    const selected = averaged ? outputs : outputs.filter(o=>o.id===target.dataset.output);
    const value = averaged ? state.matrixMeans[row][column] : selected[0].shares[column];
    placeTooltip(`<strong>Prompt names ${esc(names[row])}</strong>Contributor: ${esc(names[column])}<br>${averaged?'Mean credit':'Credit'}: <strong style="display:inline">${pct(value)}</strong><table><thead><tr><th>Output</th><th>Credit</th><th>Shapley value</th></tr></thead><tbody>${selected.map(o=>`<tr><td>${o.id.split('_s')[1]}</td><td>${pct(o.shares[column])}</td><td>${o.values[column].toFixed(5)}</td></tr>`).join("")}</tbody></table>`,event);
  }

  async function init() {
    const response=await fetch('results.json');
    if (!response.ok) throw new Error('Could not load the experiment results.');
    state.data=await response.json();
    const arrays=Object.values(state.data.rq1.artists).flatMap(row=>Object.values(row).flat());
    state.sharedRange=domain(arrays);
    state.outputsByArtist=state.data.rq2.artists.map((_,i)=>state.data.rq2.outputs.filter(o=>o.named===i));
    state.matrixMeans=state.outputsByArtist.map(outputs=>state.data.rq2.artists.map((_,j)=>mean(outputs.map(o=>o.shares[j]))));
    state.columnOrder=state.data.rq2.artists.map((_,i)=>i).sort((a,b)=>state.data.rq2.artists[a].localeCompare(state.data.rq2.artists[b]));
    const compact=matchMedia('(max-width:760px)');
    el('matrix-panel').open=!compact.matches;
    compact.addEventListener('change',event=>{el('matrix-panel').open=!event.matches;});
    el('rq1').addEventListener('pointermove',event=>{
      const svg=event.target.closest('svg[data-chart]');
      if(svg)inspectPlot(svg,event);else hidePlotInspector();
    });
    el('rq1').addEventListener('pointerdown',event=>{
      const svg=event.target.closest('svg[data-chart]');
      if(svg){inspectPlot(svg,event);if(event.pointerType==='touch')svg.setPointerCapture(event.pointerId);}
      else hidePlotInspector();
    });
    el('rq1').addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')hidePlotInspector();});
    el('rq1').addEventListener('keydown',event=>{
      const svg=event.target.closest('svg[data-chart]');
      if(!svg||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='Escape'){hidePlotInspector();return;}
      const current=charts.get(svg.dataset.chart).index;
      inspectPlot(svg,null,event.key==='Home'?1:event.key==='End'?128:current+(event.key==='ArrowLeft'?-1:1));
    });
    el('rq1').addEventListener('focusout',event=>{if(event.target.matches('svg[data-chart]'))hidePlotInspector();});
    el('baseline-toggle').addEventListener('change',event=>{state.baselines=event.target.checked;renderRQ1();});
    el('artist-search').addEventListener('input',event=>{state.artistQuery=event.target.value;el('artist-scroll').scrollTop=0;renderRQ1();});
    el('artist-sort').addEventListener('change',event=>{state.artistSort=event.target.value;el('artist-scroll').scrollTop=0;renderRQ1();});
    el('artist-scroll').addEventListener('scroll',updateScrollShadows,{passive:true});
    el('artist-grid').addEventListener('click',event=>{
      const tile=event.target.closest('[data-artist]');
      if(tile){state.artist=state.artist===tile.dataset.artist?null:tile.dataset.artist;renderRQ1();if(state.artist)el('artist-detail').scrollIntoView({block:'nearest',behavior:'smooth'});}
    });
    el('artist-detail-panel').addEventListener('click',event=>{if(event.target.closest('[data-close-artist]')){state.artist=null;renderRQ1();}});
    el('artist-detail-panel').addEventListener('toggle',event=>{const id=event.target.dataset.prompt;if(id){if(event.target.open)state.promptOpen.add(id);else state.promptOpen.delete(id);}},true);
    el('matrix-search').addEventListener('input',event=>{state.matrixQuery=event.target.value;renderMatrix();});
    el('credit-chart').addEventListener('pointermove',event=>{const bar=event.target.closest('[data-credit]');if(bar)inspectCredit(bar,event);else el('matrix-tooltip').hidden=true;});
    el('credit-chart').addEventListener('pointerleave',()=>{el('matrix-tooltip').hidden=true;});
    el('credit-chart').addEventListener('click',event=>{const bar=event.target.closest('[data-credit]');if(bar)inspectCredit(bar,event);});
    el('credit-chart').addEventListener('focusin',event=>{const bar=event.target.closest('[data-credit]');if(bar){const box=bar.getBoundingClientRect();inspectCredit(bar,{clientX:box.x+box.width/2,clientY:box.y+box.height});}});
    el('credit-chart').addEventListener('focusout',()=>{el('matrix-tooltip').hidden=true;});
    el('matrix-sort').addEventListener('change',event=>{state.matrixSort=event.target.value;renderMatrix();});
    el('expand-all').addEventListener('click',()=>{const rows=visibleRows(),collapse=rows.every(i=>state.expanded.has(i));for(const i of rows){if(collapse)state.expanded.delete(i);else state.expanded.add(i);}renderMatrix();});
    el('credit-matrix').addEventListener('click',event=>{
      const row=event.target.closest('[data-expand]'), cell=event.target.closest('.heat-cell'), column=event.target.closest('[data-column]');
      if(row){const i=Number(row.dataset.expand);if(state.expanded.has(i))state.expanded.delete(i);else state.expanded.add(i);renderMatrix();}
      else if(cell){state.expanded.add(Number(cell.dataset.row));state.selectedColumn=Number(cell.dataset.col);renderMatrix();if(event.pointerType==='touch')inspectCell(cell,event);}
      else if(column){const i=Number(column.dataset.column);state.selectedColumn=state.selectedColumn===i?null:i;renderMatrix();}
    });
    el('credit-matrix').addEventListener('pointermove',event=>{const cell=event.target.closest('.heat-cell');if(cell)inspectCell(cell,event);else el('matrix-tooltip').hidden=true;});
    el('credit-matrix').addEventListener('pointerleave',()=>{el('matrix-tooltip').hidden=true;});
    el('credit-matrix').addEventListener('scroll',()=>{el('matrix-tooltip').hidden=true;});
    el('copy-citation').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(el('bibtex').textContent);el('copy-citation').textContent='Copied';}catch{el('copy-citation').textContent='Select text to copy';}});
    let resize;
    addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(()=>{renderRQ1();renderCredit();el('matrix-tooltip').hidden=true;},120);});
    addEventListener('scroll',()=>{el('matrix-tooltip').hidden=true;hidePlotInspector();},{passive:true});
    renderRQ1();renderCredit();renderMatrix();
  }
  init().catch(error=>{el('load-error').hidden=false;el('load-error').textContent=error.message;});
})();
