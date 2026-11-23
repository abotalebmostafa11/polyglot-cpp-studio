import urllib.request as u, json, pathlib as P, concurrent.futures as cf, tarfile, shutil, gzip, re, os, hashlib, time
root=P.Path('buildtools').resolve();ver='45.4.1';base='https://github.com/electron/electron/releases/download/v'+ver+'/'
def get(url,d):
 p=root/d
 for attempt in range(3):
  try:
   if not p.exists():
    with u.urlopen(url,timeout=150) as r,open(str(p)+'.tmp','wb') as out:shutil.copyfileobj(r,out,1024*1024)
    os.replace(str(p)+'.tmp',p)
   return p
  except Exception as e:print('retry',d,str(e)[:100],flush=True);time.sleep(1)
 raise RuntimeError(d)
def elect(t):
 name=f'electron-v{ver}-{t}.zip'; p=get(base+name,name); sha=next(l.split()[0] for l in checks if l.split()[-1].lstrip('*')==name);assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()==sha;print('ready',t,flush=True)
def npmff(osname):
 import base64
 pkg='@ffmpeg-installer/'+osname; d=json.load(u.urlopen('https://registry.npmjs.org/'+pkg+'/latest'))['dist']; p=get(d['tarball'],osname+'.tgz');assert base64.b64encode(hashlib.file_digest(p.open('rb'),'sha512').digest()).decode()==d['integrity'].split('-',1)[1]
 out=root/osname;out.mkdir(exist_ok=True)
 with tarfile.open(p) as tar:
  for f in tar.getmembers():
   if f.isfile():
    n=P.Path(f.name).name
    with (out/n).open('wb') as w:shutil.copyfileobj(tar.extractfile(f),w)
    if n=='ffmpeg':(out/n).chmod(0o755)
 print('ready ffmpeg',osname,flush=True)
def debs():
 p=get('https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.xz','Packages.xz')
 import lzma,subprocess
 names={'nsis','nsis-common','xvfb','libxfont2','x11-xkb-utils','clang-19','libclang-cpp19','libclang-common-19-dev','llvm-19-linker-tools','libclang1-19'}
 for rec in lzma.open(p,'rt').read().split('\n\n'):
  d=dict(l.split(': ',1) for l in rec.splitlines() if ': ' in l and not l.startswith(' '))
  if d.get('Package') in names:
   path=get('https://deb.debian.org/debian/'+d['Filename'],d['Package']+'.deb')
   assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==d['SHA256'];subprocess.run(['dpkg-deb','-x',path,root/'debs'],check=True)
 print('ready Debian tools',flush=True)
def signer():
 d=json.load(u.urlopen('https://api.github.com/repos/indygreg/apple-platform-rs/releases/latest')); candidates=[a for a in d['assets'] if 'x86_64-unknown-linux' in a['name'] and a['name'].endswith('.tar.gz')]
 a=candidates[0];p=get(a['browser_download_url'],a['name'])
 with tarfile.open(p) as t:
  f=next(i for i in t.getmembers() if i.name.endswith('/rcodesign')); (root/'rcodesign').write_bytes(t.extractfile(f).read()); (root/'rcodesign').chmod(0o755)
 print('ready signer',flush=True)
checks=get(base+'SHASUMS256.txt','electron-sha.txt').read_text().splitlines()
jobs=[(elect,(s,)) for s in ['win32-x64','darwin-arm64','linux-x64']]+[(npmff,(s,)) for s in ['win32-x64','darwin-arm64']]+[(debs,()),(signer,())]
with cf.ThreadPoolExecutor(max_workers=8) as x:
 for f in cf.as_completed([x.submit(fn,*args) for fn,args in jobs]):
  try:f.result()
  except Exception as e:print('FAILED',repr(e),flush=True)
