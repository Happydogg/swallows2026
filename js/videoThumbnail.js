// SDL-005-UX-THUMB-001: Extract a real preview frame from an authorized MP4 Blob.
// No server writes, no public URLs, no localStorage/IndexedDB persistence.
// The calling controller owns identity checks, download limits and cleanup.
export async function extractVideoThumbnail(blob,{
  doc=typeof document!=='undefined'?document:null,
  urls=typeof URL!=='undefined'?URL:null,
  timeoutMs=12000,
  maxWidth=320,
  quality=0.67,
  onSignal=null
}={}){
  if(!doc||!urls||typeof urls.createObjectURL!=='function'
    ||typeof urls.revokeObjectURL!=='function')throw new Error('Video previews unavailable in this browser');
  if(!blob||!Number.isFinite(blob.size)||blob.size<=0||blob.size>20971520)
    throw new Error('Video preview exceeds the private-media size limit');
  if(onSignal?.aborted)throw new DOMException('Cancelled','AbortError');
  const video=doc.createElement('video');
  video.muted=true;video.preload='auto';video.playsInline=true;
  const url=urls.createObjectURL(blob);
  const handlers=[];
  let timer;
  const wait=(event, failureEvents=[])=>new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(err)=>{
      if(settled)return;settled=true;
      for(const [name,fn] of handlers.splice(0))video.removeEventListener(name,fn);
      if(onSignal)onSignal.removeEventListener('abort',abort);
      clearTimeout(timer);err?reject(err):resolve();
    };
    const abort=()=>finish(new DOMException('Cancelled','AbortError'));
    const success=()=>finish(null);
    const failure=()=>finish(new Error('Video preview could not be decoded'));
    video.addEventListener(event,success,{once:true});handlers.push([event,success]);
    for(const name of failureEvents){video.addEventListener(name,failure,{once:true});handlers.push([name,failure]);}
    onSignal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(new Error('Video preview timed out')),timeoutMs);
    if(onSignal?.aborted)abort();
  });
  try{
    video.src=url;
    video.load?.();
    if(video.readyState<1)await wait('loadedmetadata',['error']);
    if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth||!video.videoHeight)
      throw new Error('Video has no readable frame');
    // 0.2-1.5 seconds, never past the end; avoid a frequently black frame zero.
    const target=Math.max(0,Math.min(Math.min(1.5,video.duration*0.12),video.duration-0.08));
    if(target>0.03){
      video.currentTime=target;
      await wait('seeked',['error']);
    }else if(video.readyState<2)await wait('loadeddata',['error']);
    if(onSignal?.aborted)throw new DOMException('Cancelled','AbortError');
    const canvas=doc.createElement('canvas');
    const scale=Math.min(1,maxWidth/video.videoWidth);
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
    canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Video preview canvas unavailable');
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',quality);
    if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(result))
      throw new Error('Video preview encoding failed');
    return result;
  }finally{
    clearTimeout(timer);
    for(const [name,fn] of handlers.splice(0))video.removeEventListener(name,fn);
    video.pause?.();video.removeAttribute?.('src');video.load?.();
    urls.revokeObjectURL(url);
  }
}
