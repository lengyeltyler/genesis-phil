"""Emit the approved SVG using the existing PG06 XML serialization rules."""
import xml.etree.ElementTree as E,json,re,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[2]
approval=json.loads((root/'genesis/body2-correction/owner-approval.json').read_text())
from decimal import Decimal
sys.path.insert(0,str(root/'genesis/final-art/scripts'))
from path_normalize import norm,fmt
# Use the existing normalizer only when it preserves all authored coordinates.
import types
exact=types.ModuleType('exact_path')
exec((root/'genesis/final-art/scripts/path_normalize.py').read_text().replace("D('.001')","D('.000000000000000001')"),exact.__dict__)
def checked_norm(d):
    result=norm(d)
    assert exact.norm(d)==result,'Path normalization would change authored coordinates'
    return result
basePaths={checked_norm(d):d for d in json.loads((root/'genesis/body2-correction/inputs/base-paths.json').read_text())}
result=[]
def esc(s):return s.replace('&','&amp;').replace("'",'&apos;').replace('<','&lt;')
for t in approval['traits']:
    tree=E.parse(root/'genesis/final-art/canonical-traits'/t['filename']).getroot()
    # Bake the approved translation into absolute coordinates. No rounding is
    # introduced: Decimal preserves the authored precision exactly.
    wrapper=tree.find('{http://www.w3.org/2000/svg}g')
    assert wrapper.get('transform')=='translate(109.06 15.22)'
    del wrapper.attrib['transform']
    tree.attrib.pop('id',None)
    for el in tree.iter():
        if el.tag.endswith('}g'):el.attrib.pop('id',None)
        if el.get('d'):
            el.set('d',re.sub(r'M([-\.\d]+),([-\.\d]+)',lambda m:'M'+fmt(Decimal(m[1])+Decimal('109.06'))+','+fmt(Decimal(m[2])+Decimal('15.22')),checked_norm(el.get('d'))))
        if el.tag.endswith('}linearGradient'):
            assert not el.get('gradientTransform')
            for key in ['x1','x2','y1','y2']:
                if key in el.attrib:el.set(key,fmt(Decimal(el.get(key))+Decimal('109.06' if key.startswith('x') else '15.22')))
    for el in tree.iter():
        if el.get('d') and checked_norm(el.get('d')) in basePaths:el.set('d',basePaths[checked_norm(el.get('d'))])
    ids={x.get('id'):f'p{t["index"]}x{j}' for j,x in enumerate(x for x in tree.iter() if x.get('id'))}
    parts=[]
    def visit(el):
        tag=el.tag.split('}')[-1]
        if tag=='g' and not el.attrib:
            for child in el:visit(child)
            return
        parts.append('<'+tag)
        attrs={k.replace('{http://www.w3.org/1999/xlink}','xlink:'):v for k,v in el.attrib.items()}
        if 'style' in attrs:
            props=dict(p.split(':',1) for p in attrs.pop('style').split(';') if p)
            css={}
            for k,v in props.items():
                if k=='isolation':css[k]=v
                else:attrs[k]=v
            if css:attrs['style']=';'.join(k+':'+v for k,v in sorted(css.items()))
        if tag=='svg':attrs.update({'xmlns':'http://www.w3.org/2000/svg','xmlns:xlink':'http://www.w3.org/1999/xlink'})
        for k,v in sorted(attrs.items()):
            if k=='id':v=ids[v]
            if k.endswith('href') and v.startswith('#'):v='#'+ids[v[1:]]
            v=re.sub(r'url\(#([^)]*)\)',lambda m:'url(#'+ids[m[1]]+')',v)
            if k=='d':
                v=re.sub(r'\s+',',',v.strip());v=re.sub(r',?([MmLlHhVvCcSsQqTtAaZz]),?',r'\1',v);v=re.sub(r',+',',',v)
            elif k in ['points','viewBox','transform','gradientTransform']:
                v=re.sub(r'\s+',',',v.strip());v=re.sub(r',+',',',v);v=v.replace('(,','(').replace(',)',')')
            parts.extend([' '+k+"='",esc(v),"'"])
        if len(el):
            parts.append('>')
            for child in el:visit(child)
            parts.append('</'+tag+'>')
        else:parts.append('/>')
        assert not(el.text and el.text.strip())
    visit(tree);result.append({'index':t['index'],'parts':parts})
print(json.dumps(result))
