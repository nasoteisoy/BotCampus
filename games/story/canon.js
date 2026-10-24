(function(){
  'use strict';
  var root=document.getElementById('canon');
  function el(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;}
  Promise.all([fetch('canon.json',{cache:'no-cache'}).then(function(r){return r.json();}),fetch('questions.json',{cache:'no-cache'}).then(function(r){return r.json();}).catch(function(){return {sections:[]};})]).then(function(d){
    var entries=d[0].entries||[],order=d[1].sections.map(function(s){return s.id;});root.textContent='';
    if(!entries.length){var e=el('div','empty-state');e.appendChild(el('div','big','🌱'));e.appendChild(el('h2',null,'Nothing is canon yet'));
      e.appendChild(el('p',null,'The story is still wide open. Answer questions on Decide, save them, and they will be locked in here.'));
      var a=el('a','btn big','✍️ Go to Decide');a.href='decide.html';e.appendChild(a);root.appendChild(e);return;}
    var by={},titles={};entries.forEach(function(x){(by[x.section]=by[x.section]||[]).push(x);titles[x.section]=x.section_title||x.section;});
    var keys=Object.keys(by).sort(function(a,b){var i=order.indexOf(a),j=order.indexOf(b);return (i<0?99:i)-(j<0?99:j);});
    root.appendChild(el('p','secmeta',entries.length+' locked answer'+(entries.length>1?'s':'')+' in '+keys.length+' section'+(keys.length>1?'s':'')));
    var toc=el('div','toc');keys.forEach(function(k){var a=el('a',null,titles[k]+' ('+by[k].length+')');a.href='#c-'+k;toc.appendChild(a);});root.appendChild(toc);
    keys.forEach(function(k){
      var h=el('h2',null,titles[k]);h.id='c-'+k;root.appendChild(h);
      var ul=el('ul','canonlist');
      by[k].forEach(function(x){var li=el('li');li.id='c-'+x.question_id;
        li.appendChild(el('p','cq',x.question));
        var own=x.custom_text&&x.custom_text.trim();
        li.appendChild(el('p','ca',own?x.custom_text:x.answer));
        var m=el('p','cm','🔒 Locked '+(x.locked||''));if(own)m.textContent+=' · ✍️ Chumi’s own words';li.appendChild(m);
        ul.appendChild(li);});
      root.appendChild(ul);
    });
  }).catch(function(){root.innerHTML='<p class="empty">Could not load canon.json.</p>';});
})();
