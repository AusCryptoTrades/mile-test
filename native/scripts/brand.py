"""Generate opaque RGB PNG branding from fixed vector geometry, using only Python stdlib."""
import math, struct, zlib, json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BG=(16,18,16)
FG=(245,246,242)
LIME=(198,250,120)
POLYS=[[(0,0),(46,0),(90,102),(134,0),(180,0),(180,210),(138,210),(138,77),(90,182),(42,77),(42,210),(0,210)],[(213,0),(256,0),(256,210),(213,210)],[(290,0),(333,0),(333,171),(422,171),(422,210),(290,210)],[(450,0),(576,0),(576,39),(493,39),(493,85),(568,85),(568,124),(493,124),(493,171),(576,171),(576,210),(450,210)]]
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
def render(width,height,mark_fraction=.68,tagline=False):
    rows=[bytearray(bytes(BG)*width) for _ in range(height)]
    scale=min(width,height)*mark_fraction/680
    ox=width/2-(302.9885 if tagline else 320)*scale
    oy=height/2-(127.65 if tagline else 105)*scale
    def polygon(points,color):
        pts=[(ox+x*scale,oy+y*scale) for x,y in points]
        for y in range(max(0,math.floor(min(p[1] for p in pts))),min(height,math.ceil(max(p[1] for p in pts)))):
            xs=[]
            for a,b in zip(pts,pts[1:]+pts[:1]):
                if min(a[1],b[1])<=y+.5<max(a[1],b[1]):
                    xs.append(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]))
            xs.sort()
            for l,r in zip(xs[::2],xs[1::2]):
                lo=max(0,math.ceil(l-.5));hi=min(width,math.ceil(r-.5))
                if hi>lo: rows[y][lo*3:hi*3]=bytes(color)*(hi-lo)
    for poly in POLYS: polygon([(x-y*.1763,y) for x,y in poly],FG)
    polygon([(600,169),(643,169),(643,210),(600,210)],LIME)
    if tagline:
        # Compact sans-serif vector lettering, spaced to match the web splash hierarchy.
        glyphs={"M":["10001","11011","10101","10101","10001","10001","10001"],"A":["01110","10001","10001","11111","10001","10001","10001"],"K":["10001","10010","10100","11000","10100","10010","10001"],"E":["11111","10000","10000","11110","10000","10000","11111"],"I":["111","010","010","010","010","010","111"],"T":["11111","00100","00100","00100","00100","00100","00100"],"L":["10000","10000","10000","10000","10000","10000","11111"],"O":["01110","10001","10001","10001","10001","10001","01110"],"S":["01111","10000","10000","01110","00001","00001","11110"],"Y":["10001","10001","01010","00100","00100","00100","00100"]}
        label='MAKE IT LOOK EASY'
        widths=[3 if c==' ' else len(glyphs[c][0])+1 for c in label]
        unit=2.9
        x=302.9885-(sum(widths)-1)*unit/2
        for c,advance in zip(label,widths):
            if c!=' ':
                for row,line in enumerate(glyphs[c]):
                    for col,ink in enumerate(line):
                        if ink=='1':
                            l=x+col*unit;t=235+row*unit
                            polygon([(l,t),(l+unit,t),(l+unit,t+unit),(l,t+unit)],FG)
            x+=advance*unit
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+r for r in rows),9))+chunk(b'IEND',b'')
def apply(platform):
    version=json.loads((ROOT/'package.json').read_text())['version']
    number=int(version.split('.')[0])*1000000+int(version.split('.')[1])*1000+int(version.split('.')[2])+1
    if platform=='ios':
        assets=ROOT/'ios/App/App/Assets.xcassets'
        for folder,fraction in [('AppIcon.appiconset',.68),('Splash.imageset',.60)]:
            directory=assets/folder
            manifest=json.loads((directory/'Contents.json').read_text())
            for item in manifest['images']:
                if not item.get('filename'): continue
                target=directory/item['filename']
                raw=target.read_bytes()
                w,h=struct.unpack('>II',raw[16:24])
                target.write_bytes(render(w,h,fraction,tagline=folder=='Splash.imageset'))
        project=ROOT/'ios/App/App.xcodeproj/project.pbxproj'
        s=project.read_text()
        for key,value in [('MARKETING_VERSION',version),('CURRENT_PROJECT_VERSION',str(number))]:
            s,n=re.subn(r'('+key+r'\s*=\s*)[^;]+;',lambda m:m.group(1)+value+';',s)
            if not n: raise ValueError('Missing '+key)
        project.write_text(s)
    elif platform=='android':
        res=ROOT/'android/app/src/main/res'
        count=0
        for target in res.glob('mipmap-*/*.png'):
            if target.stem not in ('ic_launcher','ic_launcher_round','ic_launcher_foreground'): continue
            w,h=struct.unpack('>II',target.read_bytes()[16:24])
            target.write_bytes(render(w,h,.48 if target.stem=='ic_launcher_foreground' else .68));count+=1
        if not count: raise ValueError('No launcher images found')
        for target in res.glob('drawable*/splash.png'):
            w,h=struct.unpack('>II',target.read_bytes()[16:24]);target.write_bytes(render(w,h,.60,tagline=True))
        gradle=ROOT/'android/app/build.gradle';s=gradle.read_text()
        s,n=re.subn(r'(?m)^(\s*versionCode\s+)\d+',lambda m:m.group(1)+str(number),s)
        if not n: raise ValueError('Missing versionCode')
        s,n=re.subn(r'(?m)^(\s*versionName\s+)[\x22\x27][^\x22\x27]+[\x22\x27]',lambda m:m.group(1)+'"'+version+'"',s)
        if not n: raise ValueError('Missing versionName')
        gradle.write_text(s)
        # Android 12+ uses a system splash with a launcher icon; use the dark background.
        for target in res.glob('values*/styles.xml'):
            s=target.read_text()
            s=re.sub(r'(<item name="windowSplashScreenBackground">)[^<]+',r'\g<1>#101210',s)
            target.write_text(s)
    else: raise ValueError('Expected ios or android')
if __name__=='__main__':
    if sys.argv[1:]==['--test']:
        data=render(128,128)
        assert data[:8]==b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II',data[16:24])==(128,128)
        assert data==render(128,128)
        assert render(256,512,.60,True)!=render(256,512,.60,False)
        assert render(256,512,.60,True)==render(256,512,.60,True)
        # Verify visible horizontal centres of logo and tagline within raster rounding.
        png=render(680,1000,.60,True)
        pos=8; compressed=b''
        while pos<len(png):
            length=struct.unpack('>I',png[pos:pos+4])[0]
            if png[pos+4:pos+8]==b'IDAT': compressed+=png[pos+8:pos+8+length]
            pos+=length+12
        raw=zlib.decompress(compressed); stride=680*3+1
        spans=[]
        for y in range(1000):
            row=raw[y*stride+1:(y+1)*stride]
            xs=[x for x in range(680) if row[x*3:x*3+3]!=bytes(BG)]
            if xs: spans.append((y,min(xs),max(xs)))
        logo=[v for v in spans if v[0]<557]; label=[v for v in spans if v[0]>=557]
        assert logo and label
        for group in (logo,label):
            assert abs((min(v[1] for v in group)+max(v[2] for v in group))/2-339.5)<=2
        print('Branding PNG generation passed')
    else: apply(sys.argv[1])
