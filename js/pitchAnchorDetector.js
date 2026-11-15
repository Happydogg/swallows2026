/**
 * Swallows DataLab Stage 2 pose-based event estimator.
 * All indices refer to the returned sortedFrames array, not source-video frames.
 * Timestamps are video seconds (not performance.now() timestamps).
 * These are estimates: pose alone cannot verify ball release or bat-ball contact.
 */

const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  (p.visibility === undefined || p.visibility >= 0.35);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const at = (f, i) => f?.landmarks?.[i];
const midpoint = (a, b) => valid(a) && valid(b) ? { x: (a.x+b.x)/2, y: (a.y+b.y)/2 } : null;
const distance = (a,b) => valid(a) && valid(b) ? Math.hypot(a.x-b.x,a.y-b.y) : NaN;
const median = values => {
  const s = values.filter(Number.isFinite).sort((a,b)=>a-b);
  return s.length ? s[Math.floor(s.length/2)] : NaN;
};

function cleanAndSortFrames(raw) {
  if (!Array.isArray(raw)) return [];
  // Avoid fixed 4 ms buckets, which merge legitimate 240 fps observations.
  const frames = raw.filter(f => Number.isFinite(f?.timestamp) &&
    Array.isArray(f.landmarks) && f.landmarks.length >= 33)
    .sort((a,b)=>a.timestamp-b.timestamp);
  const out = [];
  for (const f of frames) {
    const last = out[out.length-1];
    if (last && Math.abs(f.timestamp-last.timestamp) < 0.0005) {
      const score = x => x.landmarks.reduce((n,p)=>n+(valid(p)?1:0),0);
      if (score(f)>score(last)) out[out.length-1]=f;
    } else out.push(f);
  }
  return out;
}

function smooth(values, radius=2) {
  return values.map((_,i)=>median(values.slice(Math.max(0,i-radius),Math.min(values.length,i+radius+1))));
}
function velocity(values, frames) {
  return values.map((_,i)=>{
    const a=Math.max(0,i-1), b=Math.min(values.length-1,i+1);
    const dt=frames[b].timestamp-frames[a].timestamp;
    return dt>0.001 && Number.isFinite(values[a]) && Number.isFinite(values[b]) ?
      (values[b]-values[a])/dt : NaN;
  });
}
function maxIndex(values, start, end, fallback) {
  let idx=clamp(fallback,start,end), best=-Infinity;
  for(let i=start;i<=end;i++) if(Number.isFinite(values[i]) && values[i]>best) {
    best=values[i]; idx=i;
  }
  return idx;
}
function minIndex(values,start,end,fallback) {
  return maxIndex(values.map(v=>Number.isFinite(v)?-v:NaN),start,end,fallback);
}
function time(frames,i) { return Number(frames[clamp(i,0,frames.length-1)].timestamp.toFixed(4)); }
function pelvis(f) { return midpoint(at(f,23),at(f,24)); }
function torsoScale(f) {
  const shoulders=midpoint(at(f,11),at(f,12));
  return distance(shoulders,pelvis(f));
}
function normalizedSpeed(frames, index) {
  const x=frames.map(f=>valid(at(f,index))?at(f,index).x:NaN);
  const y=frames.map(f=>valid(at(f,index))?at(f,index).y:NaN);
  const vx=velocity(smooth(x),frames),vy=velocity(smooth(y),frames);
  const scale=median(frames.map(torsoScale));
  return vx.map((v,i)=>Number.isFinite(v)&&Number.isFinite(vy[i])&&scale>0.01?
    Math.hypot(v,vy[i])/scale:NaN);
}
function separation(f) {
  const w=f.worldLandmarks;
  if(!Array.isArray(w)) return NaN;
  const ls=w[11],rs=w[12],lh=w[23],rh=w[24];
  if(![ls,rs,lh,rh].every(p=>p&&[p.x,p.z].every(Number.isFinite))) return NaN;
  const sx=rs.x-ls.x,sz=rs.z-ls.z,hx=rh.x-lh.x,hz=rh.z-lh.z;
  const den=Math.hypot(sx,sz)*Math.hypot(hx,hz);
  return den>1e-6?Math.acos(clamp((sx*hx+sz*hz)/den,-1,1))*180/Math.PI:NaN;
}
function strictOrder(indices,n) {
  const result=indices.slice();
  for(let i=1;i<result.length;i++) result[i]=Math.max(result[i],result[i-1]+1);
  if(result[result.length-1]>=n) {
    const shift=result[result.length-1]-(n-1);
    for(let i=0;i<result.length;i++) result[i]-=shift;
  }
  for(let i=0;i<result.length;i++) result[i]=clamp(result[i],i,n-(result.length-i));
  return result;
}

export function detectPitchAnchors(rawFrames, armSide='RHP') {
  const frames=cleanAndSortFrames(rawFrames), n=frames.length;
  if(n<12) return null;
  const right=armSide!=='LHP' && armSide!=='L';
  const knee=right?25:26, ankle=right?27:28, heel=right?29:30;
  const wrist=right?16:15;
  const scale=median(frames.map(torsoScale));
  if(!Number.isFinite(scale)||scale<0.01) return null;
  const kneeHeight=smooth(frames.map(f=>{
    const p=at(f,knee), hip=pelvis(f);
    return valid(p)&&hip?(hip.y-p.y)/scale:NaN;
  }));
  const wristSpeed=smooth(normalizedSpeed(frames,wrist),1);
  const earlyEnd=Math.max(2,Math.floor(n*0.65));
  const lift=minIndex(kneeHeight.map(v=>Number.isFinite(v)?-v:NaN),0,earlyEnd,Math.floor(n*.2));
  // Release proxy: fastest throwing wrist in the later part of the motion.
  // This is NOT a direct ball-release measurement.
  const releaseStart=Math.min(n-2,Math.max(lift+4,Math.floor(n*.35)));
  const release=maxIndex(wristSpeed,releaseStart,n-2,Math.floor(n*.82));
  if(release<=lift+3) return null;
  const leadFoot=smooth(frames.map(f=>{
    const p=at(f,heel) || at(f,ankle);
    return valid(p)?p.y:NaN;
  }),1);
  const footSpeed=smooth(normalizedSpeed(frames,ankle),1);
  const hipX=smooth(frames.map(f=>pelvis(f)?.x??NaN));
  const ankleX=smooth(frames.map(f=>valid(at(f,ankle))?at(f,ankle).x:NaN));
  const stride=frames.map((_,i)=>Number.isFinite(ankleX[i])&&Number.isFinite(hipX[i])?
    Math.abs(ankleX[i]-hipX[i])/scale:NaN);
  const landStart=lift+1, landEnd=release-1;
  // Earliest near-ground foot with meaningful stride and deceleration.
  const ground=median(leadFoot.slice(Math.max(landStart,release-6),release+1));
  const maxStride=Math.max(...stride.slice(landStart,release).filter(Number.isFinite),0);
  let land=-1;
  for(let i=landStart+1;i<=landEnd;i++) {
    const nearGround=Number.isFinite(ground)&&Number.isFinite(leadFoot[i])&&leadFoot[i]>=ground-0.025;
    const extended=Number.isFinite(stride[i])&&stride[i]>=maxStride*.72;
    const slowing=Number.isFinite(footSpeed[i])&&Number.isFinite(footSpeed[i-1])&&
      footSpeed[i]<=footSpeed[i-1]*1.15;
    if(nearGround&&extended&&slowing) {land=i;break;}
  }
  if(land<0) {
    const scores=frames.map((_,i)=>Number.isFinite(stride[i])&&Number.isFinite(leadFoot[i])?
      stride[i]+leadFoot[i]*.4:NaN);
    land=maxIndex(scores,landStart,landEnd,Math.floor((lift+release)/2));
  }
  const hipVelocity=velocity(hipX,frames).map(v=>Math.abs(v));
  const drift=maxIndex(smooth(hipVelocity,1),lift+1,Math.max(lift+1,land-1),Math.floor((lift+land)/2));
  const sep=smooth(frames.map(separation),1);
  const hipSep=maxIndex(sep,Math.min(land+1,release-1),release-1,Math.floor((land+release)/2));
  const [legLift,hipDrift,frontFootLand,hipSeparation,releaseIdx]=strictOrder([lift,drift,land,hipSep,release],n);
  return {
    sortedFrames:frames,legLift,hipDrift,frontFootLand,hipSeparation,release:releaseIdx,
    peakLift:legLift,footContact:frontFootLand,
    timestamps:{legLift:time(frames,legLift),hipDrift:time(frames,hipDrift),
      frontFootLand:time(frames,frontFootLand),hipSeparation:time(frames,hipSeparation),release:time(frames,releaseIdx)}
  };
}

export function detectBattingAnchors(rawFrames,batSide='R') {
  const frames=cleanAndSortFrames(rawFrames),n=frames.length;
  if(n<10) return null;
  const left=batSide==='L';
  const leadAnkle=left?28:27;
  // Both hands contribute to bat motion; use the stronger reliable wrist signal.
  const a=normalizedSpeed(frames,15),b=normalizedSpeed(frames,16);
  const handSpeed=smooth(a.map((v,i)=>Math.max(Number.isFinite(v)?v:0,Number.isFinite(b[i])?b[i]:0)),1);
  const contact=maxIndex(handSpeed,Math.floor(n*.25),n-2,Math.floor(n*.72));
  if(contact<4) return null;
  const footY=smooth(frames.map(f=>valid(at(f,leadAnkle))?at(f,leadAnkle).y:NaN),1);
  const stride=maxIndex(footY,0,contact-2,Math.floor(contact*.5));
  // Launch proxy: first sustained hand acceleration following stride.
  const handAcceleration=velocity(handSpeed,frames);
  const launch=maxIndex(smooth(handAcceleration,1),stride+1,contact-1,Math.floor((stride+contact)/2));
  const [strideIdx,launchIdx,contactIdx]=strictOrder([stride,launch,contact],n);
  return {sortedFrames:frames,stride:strideIdx,launch:launchIdx,contact:contactIdx,
    timestamps:{stride:time(frames,strideIdx),launch:time(frames,launchIdx),contact:time(frames,contactIdx)}};
}
