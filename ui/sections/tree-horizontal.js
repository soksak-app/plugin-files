// 가로 파일 섹션은 경로를 한 줄로 나열하고 같은 파일 상태와 선언된 명령을 사용한다.
import { drawList } from '@soksak/plugin-api';

export function mount(root, context) {
  if (context.orientation !== 'horizontal') throw new Error('horizontal file tree requires horizontal orientation');
  const box = document.createElement('div');
  Object.assign(box.style,{display:'flex',flexDirection:'column',height:'100%',minHeight:'0'});
  const header = document.createElement('div');
  Object.assign(header.style,{display:'flex',alignItems:'center',gap:'8px',flex:'0 0 28px',minWidth:'0'});
  const title = document.createElement('span');
  Object.assign(title.style,{flex:'1 1 auto',minWidth:'0',whiteSpace:'nowrap',overflowX:'auto'});
  const refresh = document.createElement('button');refresh.type='button';refresh.textContent='새로고침';
  header.append(title,context.bind(refresh,'files.refresh',{}));
  const paths = document.createElement('div');
  Object.assign(paths.style,{display:'flex',alignItems:'center',gap:'8px',overflowX:'auto',minHeight:'0',flex:'1 1 auto'});
  box.append(header,paths);root.append(box);
  let selection = null;
  const controls = new Map();
  const gitMarkers = new Map();
  let git = [];
  const applySelection = () => {
    for (const [path,button] of controls) {
      const selected = path === selection;
      button.dataset.selected=String(selected);
      button.style.background=selected?'var(--chip-sel)':'transparent';
    }
  };
  const applyGit = () => {
    for (const [path,label] of gitMarkers) label.textContent=git.filter(item=>item.path===path).map(item=>item.status).join(', ');
  };
  const stopTree = context.status('files.tree',(value,source)=>{
    controls.clear();gitMarkers.clear();
    if (source === null) {paths.textContent='';title.textContent='프로젝트 없음';return;}
    title.title=value.root;
    title.textContent=value.root==='/'?'/':value.root.slice(value.root.lastIndexOf('/')+1);
    if(!title.textContent) throw new Error('horizontal file tree requires a canonical project root');
    if (value.error !== null) {paths.textContent=`오류: ${value.error}`;return;}
    if (value.entries.length === 0) {paths.textContent='파일 없음';return;}
    // 항목마다 그 조작 요소를 문서에 둔다. 새 항목만 만들고 펼침 상태는 제자리에서 고친다(core docs/spec/exposure.md).
    drawList(paths,value.entries,{
      key:(entry)=>`${entry.directory?'d':'f'}:${entry.path}`,
      create:(entry)=>{
        const item=document.createElement('div');Object.assign(item.style,{display:'flex',alignItems:'center',gap:'4px',flex:'0 0 auto'});
        if(entry.directory) {
          const toggle=document.createElement('button');toggle.type='button';toggle.dataset.part='toggle';
          item.append(context.bind(toggle,'files.tree.toggle',{path:entry.path}));
        }
        const select=document.createElement('button');select.type='button';select.textContent=entry.path;select.dataset.part='select';
        item.append(context.bind(select,'files.select',{path:entry.path}));
        // A double click on a file opens it in the plugin that declares its extension.
        if(!entry.directory) context.bind(select,'core.file.open',{path:entry.path},{event:'dblclick'});
        const marker=document.createElement('span');marker.dataset.part='git';item.append(marker);
        if(!entry.directory) {
          const bookmark=document.createElement('button');bookmark.type='button';bookmark.textContent='북마크';
          item.append(context.bind(bookmark,'files.bookmarks.add',{path:entry.path}));
        }
        return item;
      },
      update:(item,entry)=>{
        const toggle=item.querySelector('[data-part="toggle"]');
        if(toggle) toggle.textContent=entry.expanded?'접기':'펼치기';
        controls.set(entry.path,item.querySelector('[data-part="select"]'));
        gitMarkers.set(entry.path,item.querySelector('[data-part="git"]'));
      },
    });
    applySelection();applyGit();
  });
  const stopSelection=context.status('files.selection',(value,source)=>{selection=source===null?null:value;applySelection();});
  const stopGit=context.status('files.git',(value,source)=>{git=source===null?[]:value;applyGit();});
  return {dispose(){stopTree();stopSelection();stopGit();box.remove();}};
}
