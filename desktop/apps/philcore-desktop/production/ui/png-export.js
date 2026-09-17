'use strict';
// Runs only in a separate sandbox with no preload, credentials or network.
window.renderPhilPNG=async svg=>{
 const image=new Image();const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('GENESIS_PNG_FAILED'));});
 image.src='data:image/svg+xml,'+encodeURIComponent(svg);await loaded;
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;
 const context=canvas.getContext('2d');if(!context)throw Error('GENESIS_PNG_FAILED');
 context.drawImage(image,0,0,2048,2048);return canvas.toDataURL('image/png');
};
