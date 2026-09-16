"""Extract supplied garment print regions for UV application; no generated artwork."""
from PIL import Image
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
D=Path('/Users/myscheduleai/Downloads')
def extract(name,file,rect,colour,mode):
 im=Image.open(D/file).convert('RGB');w,h=im.size
 im=im.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(rect)))
 im.thumbnail((768,512),Image.Resampling.LANCZOS)
 rgb=np.asarray(im).astype(float);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
 if mode=='white':alpha=np.clip((np.minimum(r,np.minimum(g,b))-75)/140,0,1)
 else:alpha=np.clip((r-b-15)/65,0,1)*np.clip((r-65)/65,0,1)
 out=np.zeros((*alpha.shape,4),dtype=np.uint8);out[:,:,:3]=colour;out[:,:,3]=(alpha*255).astype('uint8')
 Image.fromarray(out).save(ROOT/'src/assets/outfits'/name)
extract('schedule-front.png','WhatsApp Image 2026-09-16 at 1.38.17 AM.jpeg',(.190,.351,.365,.408),(239,237,229),'white')
extract('schedule-back.png','WhatsApp Image 2026-09-16 at 1.38.17 AM.jpeg',(.630,.291,.825,.485),(172,133,104),'tan')
extract('house-front.png','hf_20260729_080736_06546972-132e-4a9d-a0a0-4e67af4c4563.png',(.611,.365,.698,.400),(239,138,26),'tan')
extract('bros-back.png','hf_20260729_083827_c0efb0bf-57f5-4c22-b3d6-59fb242f50ba.png',(.293,.382,.718,.446),(239,138,26),'tan')
extract('vest-front.png','hf_20260729_135327_df3b58a8-24e7-476f-ab80-c14159666ce6.png',(.361,.367,.384,.401),(228,227,219),'white')
extract('vest-back.png','hf_20260729_135327_df3b58a8-24e7-476f-ab80-c14159666ce6.png',(.660,.545,.816,.595),(233,231,223),'white')
