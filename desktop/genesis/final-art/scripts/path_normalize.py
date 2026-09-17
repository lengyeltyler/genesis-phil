"""Round absolute coordinates before delta encoding: avoids cumulative relative drift.
Outlined glyphs only. Max explicit coordinate change 0.0005 source units.
"""
import re
from decimal import Decimal, ROUND_HALF_EVEN
D=Decimal
sizes={'M':2,'L':2,'H':1,'V':1,'C':6,'S':4,'Q':4,'T':2,'A':7,'Z':0}
def fmt(v):
 s=format(v,'f').rstrip('0').rstrip('.') if '.' in format(v,'f') else format(v,'f')
 if s in ('','-0'):return '0'
 return s.replace('0.','.',1) if s.startswith('0.') or s.startswith('-0.') else s
def norm(path):
 parts=re.findall(r'[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?',path)
 x=y=sx=sy=D(0);qx=qy=D(0);out=[];i=0;cmd=None
 quant=lambda v:v.quantize(D('.001'),rounding=ROUND_HALF_EVEN)
 while i<len(parts):
  if len(parts[i])==1 and parts[i].isalpha():cmd=parts[i];i+=1
  assert cmd and cmd.upper() in sizes,cmd
  c=cmd.upper();relative=cmd.islower();n=sizes[c]
  if c=='Z':out.append('z');x,y=sx,sy;qx,qy=quant(x),quant(y);cmd=None;continue
  vals=list(map(D,parts[i:i+n]));assert len(vals)==n;i+=n
  if c=='A':raise ValueError('Outline arc requires explicit review')
  if c=='H':absvals=[vals[0]+x if relative else vals[0],y];c='L'
  elif c=='V':absvals=[x,vals[0]+y if relative else vals[0]];c='L'
  else:absvals=[v+(x if j%2==0 else y) if relative else v for j,v in enumerate(vals)]
  q=[quant(v) for v in absvals]
  if c=='M':out.append('M'+','.join(map(fmt,q)));sx,sy=absvals[-2:];cmd='l' if relative else 'L'
  else:out.append(c.lower()+','.join(fmt(v-(qx if j%2==0 else qy)) for j,v in enumerate(q)))
  x,y=absvals[-2:];qx,qy=q[-2:]
 return ''.join(out)
