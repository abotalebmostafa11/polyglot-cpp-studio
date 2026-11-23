import fs from 'node:fs';
import * as R from 'resedit';
const [file,icon]=process.argv.slice(2);
const exe=R.NtExecutable.from(fs.readFileSync(file),{ignoreCert:true});
const res=R.NtExecutableResource.from(exe),icons=R.Data.IconFile.from(fs.readFileSync(icon)).icons.map(i=>i.data);
for(const g of R.Resource.IconGroupEntry.fromEntries(res.entries))R.Resource.IconGroupEntry.replaceIconsForResource(res.entries,g.id,g.lang,icons);
for(const v of R.Resource.VersionInfo.fromEntries(res.entries)){
  for(const l of v.getAllLanguagesForStringValues()){
    v.setFileVersion(2,4,0,0,l.lang);v.setProductVersion(2,4,0,0,l.lang);
    v.setStringValues(l,{ProductName:'Polyglot C++ Studio',FileDescription:'Polyglot C++ Studio',CompanyName:'Associate Professor Mostafa Abotaleb',OriginalFilename:'PolyglotStudio.exe',InternalName:'PolyglotStudio'});
  }
  v.outputToResourceEntries(res.entries);
}
res.outputResource(exe);fs.writeFileSync(file,Buffer.from(exe.generate()));
