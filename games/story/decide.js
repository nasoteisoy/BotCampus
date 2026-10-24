(function(){
  'use strict';
  var KA='lotw-answers-v1', KS='lotw-sent-v1', OTHER='Other (write my own)';
  var root=document.getElementById('decide'), Q=null, canonIds={}, answers=load(KA), sent=load(KS);
  function load(k){try{return JSON.parse(localStorage.getItem(k))||{};}catch(e){return {};}}
  function save(){try{localStorage.setItem(KA,JSON.stringify(answers));localStorage.setItem(KS,JSON.stringify(sent));}catch(e){}}
  function el(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;}
  function openQs(s){return s.questions.filter(function(q){return !canonIds[q.id];});}
  function hasAns(id){var a=answers[id];return !!(a&&a.answer&&(a.answer!==OTHER||(a.custom_text||'').trim()));}
  function isSent(id){var a=answers[id],s=sent[id];return !!(a&&s&&s.answer===a.answer&&(s.custom_text||'')===(a.custom_text||''));}
  function allQs(){var r=[];Q.sections.forEach(function(s){openQs(s).forEach(function(q){r.push([s,q]);});});return r;}
  function pending(){return allQs().filter(function(x){return hasAns(x[1].id);});}
  function sectionStats(s){var o=openQs(s),a=0,w=0;o.forEach(function(q){if(hasAns(q.id)){a++;if(isSent(q.id))w++;}});return {open:o.length,answered:a,sent:w};}

  function render(){
    var m=/^#s=([\w-]+)/.exec(location.hash), s=m&&Q.sections.filter(function(x){return x.id===m[1];})[0];
    root.textContent='';
    if(s)renderSection(s);else renderHome();
    renderBar();
  }
  function renderHome(){
    var p=pending(),tot=allQs().length,w=p.filter(function(x){return isSent(x[1].id);}).length;
    var sum=el('ul','sumlist');
    [['🟡',tot+' open questions'],['✅',p.length+' answered on this phone'],['📨',w+' sent, waiting to be made canon']].forEach(function(r){var li=el('li');li.appendChild(el('span','ic',r[0]));li.appendChild(el('span',null,r[1]));sum.appendChild(li);});
    root.appendChild(sum);
    root.appendChild(el('p','lede','Pick a story section:'));
    var ul=el('ul','seclist');
    Q.sections.forEach(function(s){
      var st=sectionStats(s),li=el('li'),a=el('a');a.href='#s='+s.id;
      a.appendChild(el('b',null,s.title));
      if(s.blurb)a.appendChild(el('span','blurb',s.blurb));
      var c=el('span','counts');
      c.appendChild(el('span','pill open',st.open+' open'));
      if(st.answered)c.appendChild(el('span','pill ans',st.answered+' answered'));
      if(st.sent)c.appendChild(el('span','pill sent',st.sent+' sent'));
      if(!st.open)c.appendChild(el('span','pill done','All decided ⭐'));
      a.appendChild(c);li.appendChild(a);ul.appendChild(li);
    });
    root.appendChild(ul);
    root.appendChild(el('p','note','Your answers save on this phone as you go. When you are ready, tap “Save my answers” and send them in chat. Once they are locked into Canon they disappear from here and new questions take their place.'));
  }
  function renderSection(s){
    var back=el('a','backlink','← All sections');back.href='#';root.appendChild(back);
    root.appendChild(el('h2','sectitle',s.title));
    var st=sectionStats(s);
    root.appendChild(el('p','secmeta',st.open+' open · '+st.answered+' answered'+(st.sent?' · '+st.sent+' sent, waiting to be made canon':'')));
    var qs=openQs(s);
    if(!qs.length){var e=el('div','empty-state');e.appendChild(el('div','big','⭐'));e.appendChild(el('p',null,'Everything in this section is decided. New questions will be added here.'));root.appendChild(e);return;}
    var groups=[],gm={};
    qs.forEach(function(q){var g=q.group||'';if(!(g in gm)){gm[g]=[];groups.push(g);}gm[g].push(q);});
    var n=0;
    groups.forEach(function(g){
      var host=root;
      if(g){var d=el('details','group');var done=gm[g].filter(function(q){return hasAns(q.id);}).length;
        var sm=el('summary');sm.appendChild(el('b',null,g));sm.appendChild(el('span','pill '+(done===gm[g].length?'ans':'open'),done+'/'+gm[g].length+' answered'));
        d.appendChild(sm);root.appendChild(d);host=d;
        try{if(sessionStorage.getItem('lotw-open-'+g))d.open=true;}catch(e){}
        d.addEventListener('toggle',function(){try{d.open?sessionStorage.setItem('lotw-open-'+g,'1'):sessionStorage.removeItem('lotw-open-'+g);}catch(e){}});
      }
      var ol=el('ol','qlist');
      gm[g].forEach(function(q){n++;ol.appendChild(qCard(s,q,n));});
      host.appendChild(ol);
    });
    var i=Q.sections.indexOf(s),nx=Q.sections[i+1];
    if(nx){var a=el('a','btn nextsec','Next section: '+nx.title+' →');a.href='#s='+nx.id;root.appendChild(a);}
  }
  function qCard(s,q,n){
    var li=el('li','qcard');li.id='q-'+q.id;
    var head=el('div','qhead');head.appendChild(el('span','qnum',String(n)));head.appendChild(el('p','qprompt',q.prompt));li.appendChild(head);
    var status=el('div','qstatus');li.appendChild(status);
    var opts=el('div','opts');opts.setAttribute('role','radiogroup');opts.setAttribute('aria-label',q.prompt);
    var ta=el('textarea','other');ta.placeholder='Write your own answer…';ta.rows=3;
    var list=q.options.concat([OTHER]);
    function paint(){
      var a=answers[q.id];
      [].forEach.call(opts.children,function(b){var on=!!(a&&a.answer===b.dataset.v);b.setAttribute('aria-checked',on?'true':'false');});
      ta.style.display=(a&&a.answer===OTHER)?'block':'none';
      status.textContent='';status.className='qstatus';
      if(hasAns(q.id)){if(isSent(q.id)){status.textContent='📨 Sent, waiting to be made canon';status.className+=' sent';}else{status.textContent='✅ Answered — saved on this phone';status.className+=' ans';}}
      clr.style.display=a?'inline-block':'none';
    }
    list.forEach(function(o){
      var b=el('button','opt',o);b.type='button';b.dataset.v=o;b.setAttribute('role','radio');
      if(o===OTHER)b.className+=' optother';
      b.addEventListener('click',function(){
        var a=answers[q.id]||{};
        answers[q.id]={section:s.id,answer:o,custom_text:o===OTHER?(a.custom_text||''):'',updated:new Date().toISOString()};
        save();paint();renderBar();
        if(o===OTHER)setTimeout(function(){ta.focus();},30);
      });
      opts.appendChild(b);
    });
    li.appendChild(opts);
    var a0=answers[q.id];if(a0&&a0.answer===OTHER)ta.value=a0.custom_text||'';
    ta.addEventListener('input',function(){var a=answers[q.id];if(!a)return;a.custom_text=ta.value;a.updated=new Date().toISOString();save();paint();renderBar();});
    li.appendChild(ta);
    var clr=el('button','clear','Clear answer');clr.type='button';
    clr.addEventListener('click',function(){delete answers[q.id];ta.value='';save();paint();renderBar();});
    li.appendChild(clr);
    paint();return li;
  }
  // ---------- save bar + export ----------
  var bar=el('div','savebar'),sb=el('button','savebtn');sb.type='button';bar.appendChild(sb);document.body.appendChild(bar);
  sb.addEventListener('click',openExport);
  function renderBar(){var p=pending(),u=p.filter(function(x){return !isSent(x[1].id);}).length;
    sb.textContent=p.length?('💾 Save my answers ('+p.length+')'+(u&&u<p.length?' · '+u+' new':'')):'💾 Save my answers';sb.disabled=!p.length;}
  function today(){var d=new Date();function z(n){return (n<10?'0':'')+n;}return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());}
  function buildExport(){
    return {exported_at:new Date().toISOString(),answers:pending().map(function(x){var s=x[0],q=x[1],a=answers[q.id];
      return {section:s.id,section_title:s.title,question_id:q.id,question:(q.group?q.group+' — ':'')+q.prompt,answer:a.answer,custom_text:a.answer===OTHER?(a.custom_text||'').trim():''};})};
  }
  function markSent(exp){exp.answers.forEach(function(r){sent[r.question_id]={at:exp.exported_at,answer:r.answer,custom_text:answers[r.question_id].custom_text||''};});save();render();}
  function openExport(){
    var exp=buildExport();if(!exp.answers.length)return;
    var txt=JSON.stringify(exp,null,2);
    var ov=el('div','modal');ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    var box=el('div','mbox');ov.appendChild(box);
    box.appendChild(el('h2',null,'💾 Save my answers'));
    var ul=el('ol','steps');['Tap Copy (or Download).','Paste it to the Story bot in chat (or send the file).','The bot locks them into Canon and adds new questions.'].forEach(function(t){ul.appendChild(el('li',null,t));});box.appendChild(ul);
    box.appendChild(el('p','secmeta',exp.answers.length+' answer'+(exp.answers.length>1?'s':'')+' ready.'));
    var area=el('textarea','exportbox');area.readOnly=true;area.value=txt;area.rows=8;box.appendChild(area);
    var msg=el('p','msg');msg.setAttribute('aria-live','polite');
    var row=el('div','mbtns');
    var cp=el('button','btn big','📋 Copy to clipboard');cp.type='button';
    cp.addEventListener('click',function(){
      function ok(){msg.textContent='✅ Copied! Paste it in chat. These answers are now marked “sent, waiting to be made canon”.';markSent(exp);}
      function fallback(){area.focus();area.select();try{if(document.execCommand('copy'))return ok();}catch(e){}msg.textContent='Could not copy automatically — press and hold the text above, Select All, then Copy.';}
      if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(txt).then(ok,fallback);else fallback();
    });
    var dl=el('button','btn big','⬇️ Download file');dl.type='button';
    dl.addEventListener('click',function(){
      var blob=new Blob([txt],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=u;a.download='story-answers-'+today()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},4000);
      msg.textContent='✅ Downloaded story-answers-'+today()+'.json. Send the file in chat. These answers are now marked “sent, waiting to be made canon”.';markSent(exp);
    });
    row.appendChild(cp);row.appendChild(dl);box.appendChild(row);box.appendChild(msg);
    var cl=el('button','btn ghost','Close');cl.type='button';cl.addEventListener('click',function(){ov.remove();});box.appendChild(cl);
    ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
    document.body.appendChild(ov);cp.focus();
  }
  window.addEventListener('hashchange',function(){render();window.scrollTo(0,0);});
  Promise.all([fetch('questions.json',{cache:'no-cache'}).then(function(r){return r.json();}),fetch('canon.json',{cache:'no-cache'}).then(function(r){return r.json();})]).then(function(d){
    Q=d[0];(d[1].entries||[]).forEach(function(e){canonIds[e.question_id]=1;});
    var ch=false;Object.keys(canonIds).forEach(function(id){if(answers[id]){delete answers[id];ch=true;}if(sent[id]){delete sent[id];ch=true;}});if(ch)save();
    render();
  }).catch(function(){root.innerHTML='<p class="empty">Could not load the questions. Check your connection and reload.</p>';});
})();
