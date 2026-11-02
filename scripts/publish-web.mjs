import { GITHUB_REPOSITORY_URL } from '../public/site-config.js';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const remote=GITHUB_REPOSITORY_URL;
const stage=await mkdtemp(join(tmpdir(),'bucketlist-pages-'));
try{
 execFileSync('git',['clone','--branch','gh-pages','--depth','1','--single-branch',remote,stage],{stdio:'inherit'});
 await cp(new URL('../web-dist/',import.meta.url),stage,{recursive:true});
 execFileSync('git',['add','.'],{cwd:stage,stdio:'inherit'});
 const diff=spawnSync('git',['diff','--cached','--quiet'],{cwd:stage});
 if(diff.status===1){execFileSync('git',['-c','user.name=Bucketlist site build','-c','user.email=noreply@github.com','commit','-m','Update installable Bucketlist phone demo'],{cwd:stage,stdio:'inherit'});execFileSync('git',['push','origin','HEAD:refs/heads/gh-pages'],{cwd:stage,stdio:'inherit'});}else if(diff.status!==0)throw Error('Unable to inspect staged site changes.');
 console.log('Site files are on gh-pages. If Pages is not enabled, choose gh-pages / (root) in repository Settings → Pages.');
}finally{await rm(stage,{recursive:true,force:true});}
