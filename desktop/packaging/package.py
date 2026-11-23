from pathlib import Path
import sys, os, shutil, subprocess as sp, plistlib, datetime, gzip, hashlib, struct, stat, zlib, xml.etree.ElementTree as ET
R=Path.cwd(); T=R/'buildtools'; D=R/'desktop'; OUTPUT=R/'desktop-downloads'; STAGE=R/'stage'; V='2.4.1'; EV='45.4.1'; O='Polyglot C++ Studio'
OUTPUT.mkdir(exist_ok=True);STAGE.mkdir(exist_ok=True)
def run(*args,**opts):sp.run([str(a) for a in args],check=True,**opts)
def assets(dest,arch):
 dest.mkdir(parents=True,exist_ok=True)
 for f in ['main.js','compiler.js','preload.js','record.js','package.json']:shutil.copy(D/f,dest/f)
 shutil.copytree(D/'ui',dest/'ui',dirs_exist_ok=True); (dest/'runtime').mkdir(exist_ok=True)
 if arch=='win32-x64':
  shutil.copytree(D/'runtime/windows',dest/'runtime/windows',dirs_exist_ok=True);shutil.copy(D/'upgrade-shortcuts.ps1',dest)
 shutil.copy(next((D/'runtime').glob('*.vsix')),dest/'runtime')
 enc='ffmpeg.exe' if arch=='win32-x64' else 'ffmpeg';shutil.copy(T/arch/enc,dest/'runtime'/enc)
 shutil.copy(T/arch/'package.json',dest/'runtime/ffmpeg-package.json')
 if arch!='win32-x64':(dest/'runtime'/enc).chmod(0o755)
 shutil.copy('/usr/share/common-licenses/GPL-3',dest/'runtime/FFmpeg-COPYING.txt')
 (dest/'runtime/FFmpeg-source.txt').write_text('The included standalone FFmpeg encoder comes from @ffmpeg-installer/'+arch+'.\nPackage and upstream build information: https://www.npmjs.com/package/@ffmpeg-installer/'+arch+'\nFFmpeg source: https://git.ffmpeg.org/gitweb/ffmpeg.git\nx264 source: https://code.videolan.org/videolan/x264\nSee the exact build revision in ffmpeg-package.json.\n')
def windows():
 root=STAGE/'windows';root.mkdir(exist_ok=True)
 run('unzip','-qo',T/f'electron-v{EV}-win32-x64.zip','-d',root)
 exe=root/'PolyglotStudio.exe';(root/'electron.exe').replace(exe)
 run('node',T/'node/brand.mjs',exe,D/'packaging/studio.ico')
 assets(root/'resources/app','win32-x64')
 (root/'resources/default_app.asar').unlink(missing_ok=True)
 editions=[('Windows10','Windows 10'),('Windows11-Pro','Windows 11 Pro')]
 for suffix,title in editions:
  target=OUTPUT/f'Polyglot-Cpp-Studio-{V}-{suffix}-x64-Setup.exe'
  run(T/'debs/usr/bin/makensis','-V2','-NOCD',f'-DOUTPUT={target}',f'-DEDITION={title}',f'-DICON={D}/packaging/studio.ico',f'-DPAYLOAD={root}',D/'setup.nsi',env={**os.environ,'NSISDIR':str(T/'debs/usr/share/nsis')})
  print('packaged',target.name,target.stat().st_size,flush=True)
def cpio(src,f):
 paths=[src]+sorted(src.rglob('*'),key=lambda p:p.relative_to(src).as_posix())
 def head(i,name,mode,size,nlink=1):
  name=name.encode()+b'\0';h='070707'+''.join('%06o'%x for x in (1,i,mode,0,0,nlink,0))+'%011o%06o%011o'%(0,len(name),size)
  f.write(h.encode()+name)
 for i,p in enumerate(paths):
  st=p.lstat();name='.' if p==src else './'+p.relative_to(src).as_posix()
  data=os.fsencode(os.readlink(p)) if p.is_symlink() else None
  size=len(data) if data is not None else st.st_size if p.is_file() else 0
  head(i+1,name,st.st_mode,size)
  if data is not None:f.write(data)
  elif p.is_file():
   with p.open('rb') as inp:shutil.copyfileobj(inp,f)
 head(len(paths)+1,'TRAILER!!!',0,0)
 return len(paths)
def archive(base, name):
 doc=ET.Element('xar');toc=ET.SubElement(doc,'toc')
 def sub(e,k,t):ET.SubElement(e,k).text=str(t)
 checksum=ET.SubElement(toc,'checksum',style='sha1');sub(checksum,'offset',0);sub(checksum,'size',20)
 offset=20;files=[];n=0
 def add(root,parent):
  nonlocal offset,n
  for f in sorted(root.iterdir()):
   n+=1;e=ET.SubElement(parent,'file',id=str(n));sub(e,'name',f.name);sub(e,'type','directory' if f.is_dir() else 'file');sub(e,'mode','0755' if f.is_dir() else '0644');sub(e,'uid',0);sub(e,'gid',0)
   if f.is_dir():add(f,e);continue
   size=f.stat().st_size
   with f.open('rb') as fp:digest=hashlib.file_digest(fp,'sha1').hexdigest()
   data=ET.SubElement(e,'data');sub(data,'length',size);sub(data,'offset',offset);sub(data,'size',size);ET.SubElement(data,'encoding',style='application/octet-stream')
   for key in ['archived-checksum','extracted-checksum']:ET.SubElement(data,key,style='sha1').text=digest
   offset+=size;files.append(f)
 add(base,toc);tocxml=ET.tostring(doc,encoding='utf-8',xml_declaration=True);packed=zlib.compress(tocxml,9)
 with name.open('wb') as out:
  out.write(struct.pack('>4sHHQQI',b'xar!',28,1,len(packed),len(tocxml),1)+packed+hashlib.sha1(packed).digest())
  for f in files:
   with f.open('rb') as i:shutil.copyfileobj(i,out)
def mac():
 ext=STAGE/'extracted';ext.mkdir(exist_ok=True)
 run('unzip','-qo',T/f'electron-v{EV}-darwin-arm64.zip','-d',ext)
 root=STAGE/'macroot';root.mkdir(exist_ok=True);bundle=root/(O+'.app')
 if bundle.exists():shutil.rmtree(bundle)
 (ext/'Electron.app').rename(bundle)
 con=bundle/'Contents';resources=con/'Resources';info=con/'Info.plist'
 d=plistlib.loads(info.read_bytes());d.update(CFBundleDisplayName=O,CFBundleName=O,CFBundleIdentifier='org.cppstart.studio',CFBundleShortVersionString=V,CFBundleVersion=V,NSHumanReadableCopyright='Created and designed by Associate Professor Mostafa Abotaleb',CFBundleIconFile='studio.icns')
 d.pop('ElectronAsarIntegrity',None);info.write_bytes(plistlib.dumps(d))
 shutil.copy(D/'packaging/studio.icns',resources/'studio.icns')
 for helper in (con/'Frameworks').glob('*.app'):
  hp=helper/'Contents/Info.plist'; hd=plistlib.loads(hp.read_bytes())
  exe=next((helper/'Contents/MacOS').iterdir()).name; suffix=exe.removeprefix('Electron Helper').strip(' ()').lower()
  hd.update(CFBundleExecutable=exe,CFBundleName=exe,CFBundleIdentifier='org.cppstart.studio.helper'+('.'+suffix if suffix else ''),CFBundleVersion=V)
  hp.write_bytes(plistlib.dumps(hd))
 assets(resources/'app','darwin-arm64')
 (resources/'default_app.asar').unlink(missing_ok=True)
 for lname in ['LICENSE','LICENSES.chromium.html']:
  if (ext/lname).exists():shutil.copy(ext/lname,resources/lname)
 run(T/'rcodesign','sign',bundle,stdout=sp.DEVNULL)
 run(sys.executable,D/'packaging/verify_macho.py',bundle)
 pkgroot=STAGE/'product';comp=pkgroot/'PolyglotStudio.pkg';comp.mkdir(parents=True,exist_ok=True)
 with gzip.open(comp/'Payload','wb',compresslevel=5) as z:count=cpio(root,z)
 run(T/'bomutils/build/bin/mkbom','-u','0','-g','0',root,comp/'Bom')
 kb=sum(p.stat().st_size for p in root.rglob('*') if not p.is_symlink() and p.is_file())//1024+1
 meta=ET.Element('pkg-info',{'format-version':'2','identifier':'org.cppstart.studio.pkg','version':V,'install-location':'/Applications','auth':'root','relocatable':'false'})
 ET.SubElement(meta,'payload',numberOfFiles=str(count),installKBytes=str(kb))
 b=ET.SubElement(meta,'bundle-version');ET.SubElement(b,'bundle',id='org.cppstart.studio',path='./'+bundle.name,CFBundleVersion=V,CFBundleShortVersionString=V)
 for field in ['upgrade-bundle','update-bundle','atomic-update-bundle','strict-identifier','relocate']:
  ET.SubElement(meta,field)
 (comp/'PackageInfo').write_bytes(ET.tostring(meta,encoding='utf-8',xml_declaration=True))
 distribution=ET.Element('installer-gui-script',minSpecVersion='2');ET.SubElement(distribution,'title').text=O+' '+V
 ET.SubElement(distribution,'options',customize='never',**{'require-scripts':'false','hostArchitectures':'arm64'})
 ET.SubElement(distribution,'domains',enable_anywhere='false',enable_currentUserHome='false',enable_localSystem='true')
 check=ET.SubElement(distribution,'volume-check');versions=ET.SubElement(check,'allowed-os-versions');ET.SubElement(versions,'os-version',min=d['LSMinimumSystemVersion'])
 outline=ET.SubElement(distribution,'choices-outline');ET.SubElement(outline,'line',choice='studio');choice=ET.SubElement(distribution,'choice',id='studio',title=O,visible='false')
 ET.SubElement(choice,'pkg-ref',id='org.cppstart.studio.pkg');ET.SubElement(distribution,'pkg-ref',id='org.cppstart.studio.pkg',version=V,onConclusion='none').text='#PolyglotStudio.pkg'
 (pkgroot/'Distribution').write_bytes(ET.tostring(distribution,encoding='utf-8',xml_declaration=True))
 dest=OUTPUT/f'Polyglot-Cpp-Studio-{V}-macOS-M4-M5.pkg';archive(pkgroot,dest);print('packaged',dest.name,dest.stat().st_size)
{'win':windows,'mac':mac}[sys.argv[1]]()
