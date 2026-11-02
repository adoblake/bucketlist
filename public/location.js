// Retry without requiring GPS when a precise fix is unavailable indoors.
export function getDeviceLocation(geolocation) {
 return new Promise((resolve,reject)=>{
  if(!geolocation){reject({code:0});return;}
  const accept=position=>{
   const c=position?.coords;
   if(!c||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>85||Math.abs(c.longitude)>180){reject({code:2});return;}
   resolve(position);
  };
  geolocation.getCurrentPosition(accept,error=>{
   if(error.code===1){reject(error);return;}
   geolocation.getCurrentPosition(accept,reject,{enableHighAccuracy:false,timeout:15000,maximumAge:60000});
  },{enableHighAccuracy:true,timeout:10000,maximumAge:0});
 });
}
