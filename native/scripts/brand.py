"""Generate opaque RGB PNG branding from fixed vector geometry, using only Python stdlib."""
import math, struct, zlib, json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BG=(16,16,16)
FG=(255,255,255)
POLYS=[[(0,0),(46,0),(90,102),(134,0),(180,0),(180,210),(138,210),(138,77),(90,182),(42,77),(42,210),(0,210)],[(213,0),(256,0),(256,210),(213,210)],[(290,0),(333,0),(333,171),(422,171),(422,210),(290,210)],[(450,0),(576,0),(576,39),(493,39),(493,85),(568,85),(568,124),(493,124),(493,171),(576,171),(576,210),(450,210)]]
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
def render(width,height,mark_fraction=.68):
    rows=[bytearray(bytes(BG)*width) for _ in range(height)]
    scale=min(width,height)*mark_fraction/680
    ox=width/2-320*scale
    oy=height/2-105*scale
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
    polygon([(600,169),(643,169),(643,210),(600,210)],FG)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+r for r in rows),9))+chunk(b'IEND',b'')
def apply(platform):
    version=json.loads((ROOT/'package.json').read_text())['version']
    number=int(version.split('.')[0])*1000000+int(version.split('.')[1])*1000+int(version.split('.')[2])+1
    if platform=='ios':
        assets=ROOT/'ios/App/App/Assets.xcassets'
        for folder,fraction in [('AppIcon.appiconset',.68),('Splash.imageset',.46)]:
            directory=assets/folder
            manifest=json.loads((directory/'Contents.json').read_text())
            for item in manifest['images']:
                if not item.get('filename'): continue
                target=directory/item['filename']
                raw=target.read_bytes()
                w,h=struct.unpack('>II',raw[16:24])
                target.write_bytes(render(w,h,fraction))
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
            w,h=struct.unpack('>II',target.read_bytes()[16:24]);target.write_bytes(render(w,h,.46))
        gradle=ROOT/'android/app/build.gradle';s=gradle.read_text()
        s,n=re.subn(r'(?m)^(\s*versionCode\s+)\d+',lambda m:m.group(1)+str(number),s)
        if not n: raise ValueError('Missing versionCode')
        s,n=re.subn(r'(?m)^(\s*versionName\s+)[\x22\x27][^\x22\x27]+[\x22\x27]',lambda m:m.group(1)+'"'+version+'"',s)
        if not n: raise ValueError('Missing versionName')
        gradle.write_text(s)
        # Android 12+ uses a system splash with a launcher icon; use the dark background.
        for target in res.glob('values*/styles.xml'):
            s=target.read_text()
            s=re.sub(r'(<item name="windowSplashScreenBackground">)[^<]+',r'\g<1>#101010',s)
            target.write_text(s)
    else: raise ValueError('Expected ios or android')
if __name__=='__main__':
    if sys.argv[1:]==['--test']:
        data=render(128,128)
        assert data[:8]==b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II',data[16:24])==(128,128)
        assert data==render(128,128)
        print('Branding PNG generation passed')
    else: apply(sys.argv[1])
