from pathlib import Path
import hashlib,sys,struct,mmap
def verify(root):
 count=0
 for p in Path(root).rglob('*'):
  if p.is_symlink() or not p.is_file():continue
  with p.open('rb') as f:
   if f.read(4)!=b'\xcf\xfa\xed\xfe':continue
   with mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as data:
    cpu=struct.unpack_from('<I',data,4)[0];assert cpu==0x100000c,(p,cpu)
    n=struct.unpack_from('<I',data,16)[0];pos=32;cd=None
    for i in range(n):
     typ,size=struct.unpack_from('<II',data,pos)
     if typ==0x1d:
      off,length=struct.unpack_from('<II',data,pos+8);magic,sz,slots=struct.unpack_from('>III',data,off);assert magic==0xfade0cc0
      for j in range(slots):
       slot,delta=struct.unpack_from('>II',data,off+12+j*8)
       if slot==0:cd=off+delta
     pos+=size
    assert cd is not None,p
    magic,sz,version,flags,hashes,idOff,special,pages,limit=struct.unpack_from('>9I',data,cd)
    hsize,kind,platform,power=struct.unpack_from('4B',data,cd+36);assert magic==0xfade0c02 and kind in [1,2,3,4]
    calc={1:hashlib.sha1,2:hashlib.sha256,3:hashlib.sha256,4:hashlib.sha384}[kind]
    step=1<<power;assert pages==(limit+step-1)//step
    for i in range(pages):
     expected=data[cd+hashes+i*hsize:cd+hashes+(i+1)*hsize]
     assert expected==calc(data[i*step:min(limit,(i+1)*step)]).digest()[:hsize],(p,'code page',i)
    count+=1
 assert count>=6,count
 print('Verified arm64 code-page signatures on',count,'Mach-O files')
if __name__=='__main__':verify(sys.argv[1])
