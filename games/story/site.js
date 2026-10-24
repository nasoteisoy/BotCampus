(function(){
  // Audio: remember position per file, speed buttons, only one plays at a time.
  var all=[].slice.call(document.querySelectorAll('audio'));
  all.forEach(function(a){
    var k='lotw:'+(a.dataset.remember||a.getAttribute('src'));
    a.addEventListener('loadedmetadata',function(){try{var t=+localStorage.getItem(k);if(t>5&&t<a.duration-5)a.currentTime=t;}catch(e){}});
    var last=0;a.addEventListener('timeupdate',function(){if(Math.abs(a.currentTime-last)>4){last=a.currentTime;try{localStorage.setItem(k,String(a.currentTime));}catch(e){}}});
    a.addEventListener('ended',function(){try{localStorage.removeItem(k);}catch(e){}});
    a.addEventListener('play',function(){all.forEach(function(o){if(o!==a)o.pause();});});
  });
  [].forEach.call(document.querySelectorAll('.player'),function(p){
    var a=p.querySelector('audio');
    [].forEach.call(p.querySelectorAll('.speeds button'),function(b,_,bs){
      b.addEventListener('click',function(){a.playbackRate=+b.dataset.rate;[].forEach.call(p.querySelectorAll('.speeds button'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});});
    });
  });
  // Lightbox for galleries (links still work without JS).
  var links=[].slice.call(document.querySelectorAll('a.lb'));if(!links.length)return;
  var box=document.createElement('div');box.id='lbox';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="wrap"><img alt=""></div><div class="cap"></div><button type="button" aria-label="Close">✕</button><button type="button" class="nv p" aria-label="Previous">‹</button><button type="button" class="nv n" aria-label="Next">›</button>';
  document.body.appendChild(box);
  var img=box.querySelector('img'),cap=box.querySelector('.cap'),i=0;
  function show(n){i=(n+links.length)%links.length;var l=links[i];img.src=l.getAttribute('href');img.alt=l.dataset.cap||'';cap.textContent=(l.dataset.cap||'')+(links.length>1?'  ·  '+(i+1)+'/'+links.length:'');box.classList.add('on');}
  function close(){box.classList.remove('on');img.removeAttribute('src');}
  links.forEach(function(l,n){l.addEventListener('click',function(e){e.preventDefault();show(n);});});
  box.querySelector('button').addEventListener('click',close);
  box.querySelector('.p').addEventListener('click',function(){show(i-1);});
  box.querySelector('.n').addEventListener('click',function(){show(i+1);});
  box.querySelector('.wrap').addEventListener('click',function(e){if(e.target!==img)close();});
  document.addEventListener('keydown',function(e){if(!box.classList.contains('on'))return;if(e.key==='Escape')close();if(e.key==='ArrowLeft')show(i-1);if(e.key==='ArrowRight')show(i+1);});
  var sx=null;box.addEventListener('touchstart',function(e){if(e.touches.length===1)sx=e.touches[0].clientX;},{passive:true});
  box.addEventListener('touchend',function(e){if(sx==null)return;var dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>60)show(dx<0?i+1:i-1);},{passive:true});
})();
