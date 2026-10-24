(function(){
  function get(u){return fetch(u,{cache:'no-cache'}).then(function(r){return r.json();});}
  Promise.all([get('canon.json'),get('questions.json')]).then(function(d){
    var ids={};(d[0].entries||[]).forEach(function(e){ids[e.question_id]=1;});
    var open=0;d[1].sections.forEach(function(s){s.questions.forEach(function(q){if(!ids[q.id])open++;});});
    var n=(d[0].entries||[]).length;
    document.getElementById('homeCanon').textContent=n?n+' locked':'Nothing locked yet';
    document.getElementById('homeOpen').textContent=open+' open questions';
  }).catch(function(){});
})();
