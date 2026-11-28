// SDL-005-BATCH-01: in-memory queue; existing service owns authentication and authorization.
export const BATCH_MAX=50;
const categories=new Set(['batting','pitching','throwing']);
export function createCoachBatchUpload({auth,service,getCoachedPlayers,validateFile,createKey=()=>crypto.randomUUID(),onChange=()=>{},timeoutMs=125000}){
 let rows=[],running=false,identity=null,epoch=0,controller=null;
 const snapshot=()=>({running,rows:rows.map(({file,...r})=>({...r,name:file.name,size:file.size}))});
 const emit=()=>onChange(snapshot());
 const current=()=>identity!==null&&auth.isTeamCoach.value===true&&auth.isCurrentIdentity(identity);
 const inScope=id=>getCoachedPlayers().some(p=>p.id===id);
 function clear(){epoch++;controller?.abort();controller=null;rows=[];identity=null;running=false;emit();}
 function add(files){
   if(running)throw Error('Wait for the active batch.');
   if(!auth.isTeamCoach.value)throw Error('Coach access required.');
   if(identity&&!current())clear();
   identity=auth.captureIdentity();
   if(!current())throw Error('Sign in as a coach.');
   const list=Array.from(files||[]);
   if(rows.length+list.length>BATCH_MAX)throw Error('Maximum 50 videos per batch.');
   const added=list.map(file=>{validateFile(file);return {id:createKey(),key:createKey(),file,playerId:'',category:'',state:'queued',progress:0,message:'',attempted:false,receipt:null};});
   rows.push(...added);emit();
 }
 function assign(id,{playerId,category}){if(running||!current())return;const r=rows.find(x=>x.id===id);if(!r||r.attempted||r.state!=='queued')return;r.playerId=inScope(playerId)?playerId:'';r.category=categories.has(category)?category:'';emit();}
 function remove(id){if(running||!current())return;rows=rows.filter(r=>r.id!==id||r.attempted);emit();}
 function cancel(){controller?.abort();}
 async function run(){
   if(running)return;
   if(!current()){clear();throw Error('Sign in again as a coach.');}
   const todo=rows.filter(r=>['queued','retry'].includes(r.state));
   if(!todo.length)return;
   if(todo.some(r=>!r.playerId||!categories.has(r.category)))throw Error('Assign a player and activity to every clip.');
   const started=epoch,batch=new AbortController();controller=batch;running=true;emit();
   const active=()=>started===epoch&&current()&&!batch.signal.aborted;
   try{
     for(const r of todo){
       if(!active())break;
       if(!inScope(r.playerId)){r.state='denied';r.message='Player outside current coaching roster.';emit();continue;}
       const op=new AbortController(),abort=()=>op.abort();batch.signal.addEventListener('abort',abort,{once:true});
       const timer=setTimeout(()=>op.abort(),timeoutMs);
       try{
         r.state='checking';r.message='';emit();
         const allowed=await service.authorize(r.playerId,'upload',{signal:op.signal});
         if(!active()||op.signal.aborted){r.state='retry';r.message='Authorization check interrupted.';break;}
         if(allowed!==true||!inScope(r.playerId)){r.state='denied';r.message='Server did not authorize upload.';continue;}
         r.state='uploading';r.attempted=true;r.progress=0;emit();
         const receipt=await service.upload(r.playerId,r.file,{signal:op.signal,submission:{key:r.key,category:r.category},onProgress:p=>{if(active()&&!op.signal.aborted){r.progress=Math.max(0,Math.min(100,Number(p)||0));emit();}}});
         if(!active()||op.signal.aborted){r.state='retry';r.message='Outcome unconfirmed; retry with same key.';break;}
         if(!receipt?.id||receipt.player_id!==r.playerId||receipt.category!==r.category||!['pending','approved','rejected'].includes(receipt.status))throw Error('Invalid receipt.');
         r.receipt={id:receipt.id,status:receipt.status};r.state='saved';r.progress=100;
       }catch(e){if(started!==epoch||!current())break;r.state=e?.status===403?'denied':'retry';r.message=e?.status===403?'Upload denied by server.':'Upload not confirmed; retry uses original key.';if(e?.status===401||batch.signal.aborted)break;}
       finally{clearTimeout(timer);batch.signal.removeEventListener('abort',abort);if(started===epoch&&current())emit();}
     }
   }finally{if(started===epoch){if(!current())clear();else{for(const r of rows)if(['checking','uploading'].includes(r.state)){r.state='retry';r.message='Upload not confirmed; retry uses original key.';}running=false;controller=null;emit();}}}
 }
 return {add,assign,remove,run,cancel,clear,snapshot};
}